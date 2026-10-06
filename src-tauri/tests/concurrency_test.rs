//! Integration test verifying non-blocking concurrency and catalog graph caching per G1 prompt.
//!
//! Asserts that:
//! 1. Heavy compute operations (catalog graph build, suggest_order) do not hold the database mutex across execution.
//! 2. Concurrent lightweight commands (list_songs, volume control, track queries) respond promptly (< 50ms).
//! 3. CatalogGraph and ScoreMatrix are cached per catalog_revision and invalidated when the catalog changes.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use app_lib::commands::{get_or_build_catalog_graph, suggest_order_pins_core_with_cancel};
use app_lib::playback::playback_set_volume_core;
use app_lib::state::AppState;
use core_types::{
    BeatGrid, Camelot, CamelotLetter, DynamicsAnalysis, EnergyCurve, EnergyProfile, Key,
    LoudnessInfo, Mode, RhythmAnalysis, Song, Track, TrackAnalysis, TrackTags, Waveform3Band,
    WaveformBand,
};

fn make_synthetic_song_and_track(i: usize) -> (Song, Track) {
    let id = format!("track-{i:03}");
    let bpm = 120.0 + (i as f64 % 10.0);
    let camelot_num = ((i % 12) + 1) as u8;
    let camelot_letter = if i % 2 == 0 {
        CamelotLetter::A
    } else {
        CamelotLetter::B
    };
    let energy = ((i % 10) + 1) as u8;

    let analysis = TrackAnalysis {
        loudness: LoudnessInfo {
            integrated_lufs: -14.0,
            loudness_range: 6.0,
            true_peak: -1.0,
        },
        rhythm: RhythmAnalysis {
            grid: BeatGrid {
                first_downbeat_ms: 100.0,
                bpm,
                beats_ms: vec![100.0, 100.0 + 60000.0 / bpm],
                downbeat_flags: vec![true, false],
                steady: true,
            },
            bpm_alternates: vec![bpm * 0.5, bpm * 2.0],
        },
        key: Key {
            pitch_class: ((camelot_num * 7) % 12),
            mode: match camelot_letter {
                CamelotLetter::A => Mode::Minor,
                CamelotLetter::B => Mode::Major,
            },
            camelot: Camelot::new(camelot_num, camelot_letter).unwrap(),
            tuning_cents: 0.0,
        },
        dynamics: DynamicsAnalysis {
            frame_rate: 86.13,
            rms_curve: vec![0.5],
            low_ratio_curve: vec![0.5],
            centroid_curve: vec![1000.0],
        },
        energy_score: energy,
        energy_curve: EnergyCurve { per_bar: vec![5.0] },
        segments: vec![],
        cue_points: vec![],
        waveform: Waveform3Band {
            points_per_sec: 10,
            low: WaveformBand {
                peak: vec![100],
                rms: vec![50],
            },
            mid: WaveformBand {
                peak: vec![100],
                rms: vec![50],
            },
            high: WaveformBand {
                peak: vec![100],
                rms: vec![50],
            },
        },
    };

    let track = Track {
        id: id.clone(),
        path: format!("/music/{id}.mp3"),
        hash: format!("hash_{id}"),
        tags: TrackTags {
            title: Some(format!("Title {i}")),
            artist: Some(format!("Artist {}", i % 5)),
            album: None,
        },
        duration_ms: 180000.0,
        analysis: Some(analysis),
        analyzed_at: Some("2026-10-06T00:00:00Z".to_string()),
        analysis_version: Some("1.0.0".to_string()),
    };

    let song = Song {
        id: id.clone(),
        title: format!("Title {i}"),
        artist: format!("Artist {}", i % 5),
        duration_seconds: 180.0,
        bpm: Some(bpm),
        musical_key: Some(format!("{camelot_num}{camelot_letter:?}")),
        mode: Some(match camelot_letter {
            CamelotLetter::A => Mode::Minor,
            CamelotLetter::B => Mode::Major,
        }),
        camelot_code: Some(format!("{camelot_num}{camelot_letter:?}")),
        tuning: None,
        capo: None,
        energy_rating: Some(energy),
        lead_performer: None,
        tags: vec!["electronic".to_string()],
        notes: None,
    };

    (song, track)
}

fn setup_benchmark_catalog(n: usize) -> (tempfile::TempDir, AppState) {
    let db_dir = tempfile::tempdir().expect("create temp dir for db");
    let db_path = db_dir.path().join("library.db");
    let state = AppState::new(db_path).expect("initialize AppState");

    {
        let conn = state.db.lock().expect("lock db");
        for i in 0..n {
            let (song, track) = make_synthetic_song_and_track(i);
            library_db::upsert_song(&conn, &song).expect("upsert song");
            library_db::upsert_track(&conn, &track).expect("upsert track");
        }
    }

    (db_dir, state)
}

#[test]
fn test_catalog_graph_cache_and_invalidation() {
    let (_dir, state) = setup_benchmark_catalog(40);

    // Initial build (cold cache)
    let t0 = Instant::now();
    let graph1 = get_or_build_catalog_graph(&state).expect("build graph on cold cache");
    let initial_duration = t0.elapsed();
    println!("Cold build of 40-song graph took {:?}", initial_duration);

    // Second call should hit cache and complete in sub-millisecond time
    let t1 = Instant::now();
    let graph2 = get_or_build_catalog_graph(&state).expect("fetch cached graph");
    let cached_duration = t1.elapsed();
    println!("Warm cache fetch took {:?}", cached_duration);

    assert!(
        cached_duration < Duration::from_millis(15),
        "Cached graph fetch must be instant (<15ms), took {:?}",
        cached_duration
    );
    assert!(
        Arc::ptr_eq(&graph1, &graph2),
        "Cached graph must return identical Arc reference"
    );

    // Invalidate by bumping catalog revision
    {
        let conn = state.db.lock().expect("lock db");
        library_db::bump_catalog_revision(&conn).expect("bump revision");
    }

    // Call after revision change should rebuild
    let graph3 = get_or_build_catalog_graph(&state).expect("fetch graph after revision bump");
    assert!(
        !Arc::ptr_eq(&graph1, &graph3),
        "Graph must be rebuilt with new Arc after revision bump"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn test_heavy_compute_does_not_block_concurrent_commands() {
    let (_dir, state) = setup_benchmark_catalog(60);
    let state_arc = Arc::new(state);

    // Prepare 60 track IDs for suggest_order
    let track_ids: Vec<String> = (0..60).map(|i| format!("track-{i:03}")).collect();

    let state_for_compute = Arc::clone(&state_arc);
    let compute_running = Arc::new(AtomicBool::new(true));
    let compute_flag = Arc::clone(&compute_running);

    // Launch heavy suggest_order on background thread
    let compute_handle = tokio::task::spawn_blocking(move || {
        let res = suggest_order_pins_core_with_cancel(
            &state_for_compute,
            Some(track_ids),
            Some(EnergyProfile::PeakPlateau),
            None,
            None,
            None,
            None,
            None::<fn(f32)>,
            |_| {},
        );
        compute_flag.store(false, Ordering::SeqCst);
        res
    });

    // Warm up playback subsystem once so audio device init doesn't skew probe measurement
    playback_set_volume_core(1.0);

    // While suggest_order is computing, execute concurrent lightweight calls
    let mut latencies = Vec::new();
    for _ in 0..5 {
        let t_start = Instant::now();

        let t_vol = Instant::now();
        playback_set_volume_core(0.75);
        let vol_time = t_vol.elapsed();

        let t_lock = Instant::now();
        let conn = state_arc.db.lock().expect("acquire db lock for fast read");
        let lock_time = t_lock.elapsed();

        let t_query = Instant::now();
        let song_count = library_db::list_song_summaries(&conn)
            .expect("list summaries")
            .len();
        let query_time = t_query.elapsed();
        drop(conn);
        assert_eq!(song_count, 60);

        let elapsed = t_start.elapsed();
        println!("Probe sub-timings: vol={vol_time:?}, lock={lock_time:?}, query={query_time:?}, total={elapsed:?}");
        latencies.push(elapsed);

        // Sleep briefly before next probe
        std::thread::sleep(Duration::from_millis(10));
    }

    let compute_res = compute_handle
        .await
        .expect("join handle")
        .expect("suggest_order succeeds");
    assert_eq!(compute_res.len(), 60);

    // Verify all concurrent probes responded under 50ms budget
    for (idx, latency) in latencies.iter().enumerate() {
        println!("Probe {} latency: {:?}", idx, latency);
        assert!(
            *latency < Duration::from_millis(50),
            "Concurrent probe {} exceeded 50ms budget: {:?}",
            idx,
            latency
        );
    }
}
