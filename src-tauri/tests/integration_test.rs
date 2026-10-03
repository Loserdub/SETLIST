//! Integration tests: end-to-end audio generation, folder scanning, SQLite persistence,
//! library listing, setlist sequencing, transition advising, and multi-format export.

use std::f32::consts::PI;
use std::path::Path;
use std::sync::{Arc, Mutex};

use app_lib::commands::{
    export_set_core, get_advice_core, get_track_core, list_tracks_core, scan_folder_core,
    suggest_order_core,
};
use app_lib::state::{AppState, ProgressEvent, ProgressStage};
use core_types::{EnergyProfile, ExportTarget};

/// Generates a synthetic mono 16-bit PCM WAV audio file with periodic beat pulses and musical harmonics.
fn generate_wav_file(path: &Path, duration_secs: f64, bpm: f64, root_hz: f32, third_hz: f32) {
    let sample_rate = 44100;
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(path, spec).expect("create wav file");

    let total_samples = (duration_secs * sample_rate as f64).round() as usize;
    let beat_period_samples = (60.0 / bpm * sample_rate as f64).round() as usize;

    for i in 0..total_samples {
        let t = i as f32 / sample_rate as f32;

        // Harmonic tone
        let tone = 0.25 * (2.0 * PI * root_hz * t).sin() + 0.15 * (2.0 * PI * third_hz * t).sin();

        // Rhythmic click / kick transient on each beat
        let click = if (i % beat_period_samples) < 250 {
            let env = 1.0 - (i % beat_period_samples) as f32 / 250.0;
            0.5 * env * (2.0 * PI * 100.0 * t).sin()
        } else {
            0.0
        };

        let sample = (tone + click).clamp(-1.0, 1.0);
        let int_sample = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
        writer.write_sample(int_sample).expect("write sample");
    }

    writer.finalize().expect("finalize wav");
}

#[tokio::test]
async fn test_end_to_end_scan_database_list_sequence_export() {
    let audio_dir = tempfile::tempdir().expect("create audio tempdir");
    let db_dir = tempfile::tempdir().expect("create db tempdir");
    let db_path = db_dir.path().join("test_library.db");

    // 1. Generate 3 synthetic tracks
    // Track 1: 120 BPM, A major (440 Hz + 554 Hz)
    let track1_path = audio_dir.path().join("01_track_a_major.wav");
    generate_wav_file(&track1_path, 4.0, 120.0, 440.0, 554.37);

    // Track 2: 124 BPM, C major (523 Hz + 659 Hz)
    let track2_path = audio_dir.path().join("02_track_c_major.wav");
    generate_wav_file(&track2_path, 4.0, 124.0, 523.25, 659.25);

    // Track 3: 128 BPM, E minor (330 Hz + 392 Hz)
    let track3_path = audio_dir.path().join("03_track_e_minor.wav");
    generate_wav_file(&track3_path, 4.0, 128.0, 329.63, 392.00);

    // 2. Initialize AppState with persistent SQLite DB on disk
    let state = AppState::new(db_path).expect("initialize app state");

    // 3. Scan folder and collect progress events
    let progress_events: Arc<Mutex<Vec<ProgressEvent>>> = Arc::new(Mutex::new(Vec::new()));
    let events_clone = Arc::clone(&progress_events);

    let scanned_tracks = scan_folder_core(&state, audio_dir.path().to_path_buf(), move |evt| {
        events_clone.lock().unwrap().push(evt);
    })
    .await
    .expect("scan folder succeeds");

    assert_eq!(
        scanned_tracks.len(),
        3,
        "expected 3 tracks discovered and analyzed"
    );

    // Verify progress events were emitted
    {
        let events = progress_events.lock().unwrap();
        assert!(!events.is_empty(), "expected progress events to be emitted");
        assert!(
            events.iter().any(|e| e.stage == ProgressStage::Scanning),
            "expected Scanning progress events"
        );
        assert!(
            events.iter().any(|e| e.stage == ProgressStage::Analyzing),
            "expected Analyzing progress events"
        );
    }

    // 4. Test list_tracks
    let library_tracks = list_tracks_core(&state).expect("list tracks succeeds");
    assert_eq!(library_tracks.len(), 3);

    for track in &library_tracks {
        assert!(!track.id.is_empty());
        assert!(!track.hash.is_empty());
        assert!(track.duration_ms > 0.0);

        let analysis = track.analysis.as_ref().expect("track must be analyzed");

        // Verify loudness
        assert!(analysis.loudness.integrated_lufs < 0.0);

        // Verify rhythm
        assert!(analysis.rhythm.grid.bpm >= 100.0 && analysis.rhythm.grid.bpm <= 150.0);
        assert!(!analysis.rhythm.grid.beats_ms.is_empty());
        assert_eq!(
            analysis.rhythm.grid.beats_ms.len(),
            analysis.rhythm.grid.downbeat_flags.len()
        );

        // Verify key
        assert!(analysis.key.pitch_class <= 11);
        assert!(analysis.key.camelot.number >= 1 && analysis.key.camelot.number <= 12);

        // Verify dynamics
        assert!(!analysis.dynamics.rms_curve.is_empty());
        assert!(analysis.energy_score >= 1 && analysis.energy_score <= 10);
        assert!(!analysis.energy_curve.per_bar.is_empty());

        // Verify structure
        assert!(!analysis.segments.is_empty());
        assert!(!analysis.cue_points.is_empty());

        // Verify waveform
        assert_eq!(analysis.waveform.points_per_sec, 150);
        assert!(!analysis.waveform.low.peak.is_empty());
        assert!(!analysis.waveform.mid.peak.is_empty());
        assert!(!analysis.waveform.high.peak.is_empty());
    }

    // 5. Test get_track
    let target_id = &library_tracks[0].id;
    let single_track = get_track_core(&state, target_id)
        .expect("get_track succeeds")
        .expect("track exists");
    assert_eq!(&single_track.id, target_id);

    let nonexistent =
        get_track_core(&state, "non-existent-id").expect("query nonexistent succeeds");
    assert!(nonexistent.is_none());

    // 6. Test suggest_order
    let track_ids: Vec<String> = library_tracks.iter().map(|t| t.id.clone()).collect();
    let setlist_events = Arc::new(Mutex::new(Vec::new()));
    let setlist_events_clone = Arc::clone(&setlist_events);

    let ordered_entries = suggest_order_core(
        &state,
        Some(track_ids),
        Some(EnergyProfile::PeakPlateau),
        None,
        move |evt| {
            setlist_events_clone.lock().unwrap().push(evt);
        },
    )
    .expect("suggest_order succeeds");

    assert_eq!(ordered_entries.len(), 3);
    for (idx, entry) in ordered_entries.iter().enumerate() {
        assert_eq!(entry.position, (idx + 1) as u32);
        assert!(entry.track.is_some());
        assert!(entry.target_energy.is_some());
        if idx > 0 {
            assert!(
                entry.transition.is_some(),
                "subsequent tracks should have transition advice"
            );
        }
    }

    // 7. Test get_advice
    let advice = get_advice_core(
        &state,
        &library_tracks[0].id,
        &library_tracks[1].id,
        None,
        None,
        None,
    )
    .expect("get_advice succeeds");
    assert!(!advice.notes.is_empty());
    assert!(advice.phrase_bars == 8 || advice.phrase_bars == 16 || advice.phrase_bars == 32);
    assert!(advice.total_cost.is_some());
    assert!(advice.tempo_cost.is_some());
    assert!(advice.key_cost.is_some());
    assert!(advice.energy_cost.is_some());

    // 8. Test export_set across all supported targets
    let export_dir = tempfile::tempdir().expect("create export tempdir");

    // Rekordbox XML
    let xml_path = export_dir.path().join("setlist.xml");
    let xml_res = export_set_core(
        &ordered_entries,
        ExportTarget::RekordboxXml,
        xml_path.clone(),
        true,
        |_| {},
    )
    .expect("export Rekordbox XML");
    assert_eq!(xml_res.format, ExportTarget::RekordboxXml);
    assert_eq!(xml_res.track_count, ordered_entries.len());
    assert_eq!(xml_res.path, xml_path.to_string_lossy());
    assert!(xml_path.exists());
    let xml_content = std::fs::read_to_string(&xml_path).expect("read xml");
    assert!(xml_content.contains("DJ_PLAYLISTS"));

    // M3U8
    let m3u8_path = export_dir.path().join("setlist.m3u8");
    let m3u8_res = export_set_core(
        &ordered_entries,
        ExportTarget::M3u8,
        m3u8_path.clone(),
        true,
        |_| {},
    )
    .expect("export M3U8");
    assert_eq!(m3u8_res.format, ExportTarget::M3u8);
    assert_eq!(m3u8_res.track_count, ordered_entries.len());
    assert_eq!(m3u8_res.path, m3u8_path.to_string_lossy());
    assert!(m3u8_path.exists());
    let m3u8_content = std::fs::read_to_string(&m3u8_path).expect("read m3u8");
    assert!(m3u8_content.contains("#EXTM3U"));

    // Set Sheet CSV
    let csv_path = export_dir.path().join("setlist.csv");
    let csv_res = export_set_core(
        &ordered_entries,
        ExportTarget::SetSheetCsv,
        csv_path.clone(),
        true,
        |_| {},
    )
    .expect("export CSV");
    assert_eq!(csv_res.format, ExportTarget::SetSheetCsv);
    assert_eq!(csv_res.track_count, ordered_entries.len());
    assert_eq!(csv_res.path, csv_path.to_string_lossy());
    assert!(csv_path.exists());
    let csv_content = std::fs::read_to_string(&csv_path).expect("read csv");
    assert!(csv_content.contains("Order,Title,Artist,BPM"));

    // Set Sheet Markdown
    let md_path = export_dir.path().join("setlist.md");
    let md_res = export_set_core(
        &ordered_entries,
        ExportTarget::SetSheetMarkdown,
        md_path.clone(),
        true,
        |_| {},
    )
    .expect("export Markdown");
    assert_eq!(md_res.format, ExportTarget::SetSheetMarkdown);
    assert_eq!(md_res.track_count, ordered_entries.len());
    assert_eq!(md_res.path, md_path.to_string_lossy());
    assert!(md_path.exists());
    let md_content = std::fs::read_to_string(&md_path).expect("read md");
    assert!(md_content.contains("# DJ Set Sheet"));

    // 9. Rescan: verify skip logic (already analyzed at current version)
    let rescan_events: Arc<Mutex<Vec<ProgressEvent>>> = Arc::new(Mutex::new(Vec::new()));
    let rescan_events_clone = Arc::clone(&rescan_events);

    let rescan_tracks = scan_folder_core(&state, audio_dir.path().to_path_buf(), move |evt| {
        rescan_events_clone.lock().unwrap().push(evt);
    })
    .await
    .expect("rescan succeeds");

    assert_eq!(rescan_tracks.len(), 3);
    let events2 = rescan_events.lock().unwrap();
    assert!(
        events2.iter().any(|e| {
            if let Some(ref msg) = e.message {
                msg.contains("Skipped")
            } else {
                false
            }
        }),
        "rescan should skip already-analyzed tracks"
    );
}
