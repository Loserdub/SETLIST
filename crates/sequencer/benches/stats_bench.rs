//! Criterion benchmarks for CatalogGraph score matrix, summary stats, and suggest_order.
//!
//! Evaluates performance budgets:
//! - ScoreMatrix build for 587 songs: under 250 ms (baseline was 12,000 - 24,000 ms un-cached scans)
//! - Summary stats on precomputed matrix: under 300 ms (baseline was 12,000 - 24,000 ms)
//! - suggest_order on 20 tracks: under 50 ms (baseline was ~150 ms)
//! - suggest_order on 60 tracks: under 200 ms (baseline was ~1,000 ms)

use std::time::Duration;

use core_types::{
    BeatGrid, Camelot, CamelotLetter, CostWeights, DynamicsAnalysis, EnergyCurve, EnergyProfile,
    Key, LoudnessInfo, Mode, RhythmAnalysis, Song, TrackAnalysis, Waveform3Band, WaveformBand,
};
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use sequencer::solve::{order_tracks, TrackPins};
use sequencer::{CatalogGraph, ScoreMatrix};

fn generate_synthetic_catalog(count: usize, seed: u64) -> Vec<Song> {
    let mut rng = sequencer::solve::SimpleRng::new(seed);
    let mut songs = Vec::with_capacity(count);
    for i in 0..count {
        let camelot_num = rng.gen_range(1, 13) as u8;
        let camelot_letter = if rng.next_f32() < 0.5 { "A" } else { "B" };
        let camelot_code = format!("{}{}", camelot_num, camelot_letter);
        let bpm = 100.0 + (rng.next_f32() * 50.0) as f64;
        let energy = rng.gen_range(1, 11) as u8;
        songs.push(Song {
            id: format!("song_{:04}", i),
            title: format!("Synthetic Track {}", i),
            artist: "Synthetic Artist".to_string(),
            duration_seconds: 180.0 + (rng.next_f32() * 180.0) as f64,
            bpm: Some(bpm),
            musical_key: Some(camelot_code.clone()),
            mode: None,
            camelot_code: Some(camelot_code),
            tuning: Some("Standard".to_string()),
            capo: Some(0),
            energy_rating: Some(energy),
            lead_performer: None,
            tags: vec!["electronic".to_string(), "house".to_string()],
            notes: None,
        });
    }
    songs
}

fn generate_synthetic_tracks(count: usize, seed: u64) -> Vec<TrackAnalysis> {
    let mut rng = sequencer::solve::SimpleRng::new(seed);
    (0..count)
        .map(|i| {
            let bpm = 110.0 + (rng.next_f32() * 40.0) as f64;
            let camelot_num = rng.gen_range(1, 13) as u8;
            let letter = if i % 2 == 0 {
                CamelotLetter::A
            } else {
                CamelotLetter::B
            };
            let energy = rng.gen_range(1, 11) as u8;
            TrackAnalysis {
                loudness: LoudnessInfo {
                    integrated_lufs: -14.0,
                    loudness_range: 6.0,
                    true_peak: -1.0,
                },
                rhythm: RhythmAnalysis {
                    grid: BeatGrid {
                        first_downbeat_ms: 0.0,
                        bpm,
                        beats_ms: vec![],
                        downbeat_flags: vec![],
                        steady: true,
                    },
                    bpm_alternates: vec![],
                },
                key: Key {
                    pitch_class: 0,
                    mode: Mode::Minor,
                    camelot: Camelot::new(camelot_num, letter).unwrap(),
                    tuning_cents: 0.0,
                },
                dynamics: DynamicsAnalysis {
                    frame_rate: 44100.0,
                    rms_curve: vec![],
                    low_ratio_curve: vec![],
                    centroid_curve: vec![],
                },
                energy_score: energy,
                energy_curve: EnergyCurve { per_bar: vec![] },
                segments: vec![],
                cue_points: vec![],
                waveform: Waveform3Band {
                    points_per_sec: 100,
                    low: WaveformBand {
                        peak: vec![],
                        rms: vec![],
                    },
                    mid: WaveformBand {
                        peak: vec![],
                        rms: vec![],
                    },
                    high: WaveformBand {
                        peak: vec![],
                        rms: vec![],
                    },
                },
            }
        })
        .collect()
}

fn bench_catalog_and_solver(c: &mut Criterion) {
    let songs = generate_synthetic_catalog(587, 42);

    let mut group = c.benchmark_group("sequencer_benchmarks");
    group.measurement_time(Duration::from_secs(3));
    group.sample_size(15);

    // Budget: ScoreMatrix build for 587 songs under 250 ms (P0.1 baseline un-cached scans took 12-24s)
    group.bench_function("matrix_build_587", |b| {
        b.iter(|| black_box(ScoreMatrix::build(black_box(&songs))))
    });

    // Budget: Summary stats on precomputed matrix under 300 ms (P0.1 baseline: 12,000 - 24,000 ms)
    let prebuilt_graph = CatalogGraph::new(songs.clone());
    group.bench_function("summary_stats_587", |b| {
        b.iter(|| black_box(prebuilt_graph.get_catalog_summary_stats()))
    });

    // Tracks for solver benchmarks
    let tracks_20 = generate_synthetic_tracks(20, 101);
    let tracks_60 = generate_synthetic_tracks(60, 202);
    let weights = CostWeights::default();
    let pins_20 = TrackPins::new().with_first(0).with_last(19);
    let pins_60 = TrackPins::new().with_first(0).with_last(59);

    // Budget: suggest_order at 20 tracks under 50 ms (P0.1 baseline: ~150 ms)
    group.bench_function("suggest_order_20", |b| {
        b.iter(|| {
            black_box(
                order_tracks(
                    black_box(&tracks_20),
                    black_box(&weights),
                    EnergyProfile::Wave,
                    black_box(&pins_20),
                    12345,
                )
                .unwrap(),
            )
        })
    });

    // Budget: suggest_order at 60 tracks under 200 ms (P0.1 baseline: ~1,000 ms, SA delta-cost 5x speedup)
    group.bench_function("suggest_order_60", |b| {
        b.iter(|| {
            black_box(
                order_tracks(
                    black_box(&tracks_60),
                    black_box(&weights),
                    EnergyProfile::PeakPlateau,
                    black_box(&pins_60),
                    67890,
                )
                .unwrap(),
            )
        })
    });

    group.finish();
}

criterion_group!(benches, bench_catalog_and_solver);
criterion_main!(benches);
