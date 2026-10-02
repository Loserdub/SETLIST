//! Benchmarks for audio analysis and sequencer cost matrix calculation.
//!
//! Evaluates performance on a 6-minute audio buffer (44.1 kHz, 15.88M samples)
//! for rhythm, tonal, dynamics, and structure analysis, as well as cost matrix
//! construction for 20, 50, and 100 tracks.

use std::f32::consts::PI;
use std::time::Duration;

use criterion::{black_box, criterion_group, criterion_main, Criterion};

use audio_analysis::dynamics::analyze_dynamics;
use audio_analysis::rhythm::analyze_rhythm;
use audio_analysis::structure::segment;
use audio_analysis::tonal::analyze_key;
use core_types::{
    AudioBuffer, BeatGrid, Camelot, CamelotLetter, CostWeights, DynamicsAnalysis, EnergyCurve,
    EnergyProfile, Key, LoudnessInfo, Mode, RhythmAnalysis, RhythmConfig, TrackAnalysis,
    Waveform3Band, WaveformBand,
};
use sequencer::build_cost_matrix;

/// Synthesizes a realistic 6-minute (360 seconds, 15,876,000 samples at 44.1 kHz)
/// audio buffer containing:
/// 1. Harmonic triad tones (A minor: 8A) for key detection.
/// 2. Periodic transient click pulses at 128 BPM with accented downbeats every 4 beats.
/// 3. Dynamic envelope progression (intro, buildup, drop, breakdown, outro) for dynamics & structure.
fn generate_six_minute_synthetic_buffer() -> AudioBuffer {
    let sample_rate = 44100u32;
    let duration_secs = 360.0f64; // 6 minutes
    let num_samples = (sample_rate as f64 * duration_secs) as usize;
    let mut samples = vec![0.0f32; num_samples];

    // Mix A minor triad (A2 = 110Hz, C3 = 130.81Hz, E3 = 164.81Hz, A3 = 220Hz)
    let bpm = 128.0f64;
    let interval_samples = (sample_rate as f64 * 60.0) / bpm;
    let click_len = (sample_rate as f64 * 0.015) as usize; // 15ms click

    let freqs = [110.0f32, 130.81, 164.81, 220.0];
    let two_pi = 2.0 * PI;

    // Harmonic background tone with dynamic sections:
    for (i, samp) in samples.iter_mut().enumerate() {
        let t = i as f32 / sample_rate as f32;
        let progress = t / 360.0;
        let env = if progress < 0.15 {
            0.3
        } else if progress < 0.35 {
            0.6
        } else if progress < 0.65 {
            0.9
        } else if progress < 0.85 {
            0.4
        } else {
            0.2
        };

        let mut val = 0.0f32;
        for (h, &f) in freqs.iter().enumerate() {
            val += (two_pi * f * t).sin() * (0.15 / (h as f32 + 1.0));
        }
        *samp = val * env;
    }

    // Add rhythmic transient clicks (accenting downbeats on every 4th beat)
    let mut click_pos = 0.0f64;
    let mut beat_idx = 0usize;
    while (click_pos as usize) < num_samples {
        let start = click_pos as usize;
        let is_downbeat = beat_idx % 4 == 0;
        let click_freq = if is_downbeat { 150.0f32 } else { 800.0f32 };
        let amp = if is_downbeat { 1.5f32 } else { 0.8f32 };

        for i in 0..click_len {
            if start + i < num_samples {
                let t = i as f32 / sample_rate as f32;
                let envelope = 1.0 - (i as f32 / click_len as f32);
                let tone = (two_pi * click_freq * t).sin();
                samples[start + i] += amp * tone * envelope;
            }
        }
        click_pos += interval_samples;
        beat_idx += 1;
    }

    AudioBuffer {
        sample_rate,
        samples,
    }
}

/// Generates dummy `TrackAnalysis` objects for matrix benchmarks.
fn generate_dummy_track_analyses(count: usize) -> Vec<TrackAnalysis> {
    (0..count)
        .map(|i| {
            let camelot_num = ((i % 12) + 1) as u8;
            let camelot_letter = if i % 2 == 0 {
                CamelotLetter::A
            } else {
                CamelotLetter::B
            };
            let mode = match camelot_letter {
                CamelotLetter::A => Mode::Minor,
                CamelotLetter::B => Mode::Major,
            };
            let bpm = 120.0 + ((i % 15) as f64 * 1.5);
            let energy = ((i % 10) + 1) as u8;

            TrackAnalysis {
                loudness: LoudnessInfo {
                    integrated_lufs: -14.0 + (i % 6) as f32 * 0.5,
                    loudness_range: 5.0,
                    true_peak: -0.5,
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
                    pitch_class: (camelot_num * 7) % 12,
                    mode,
                    camelot: Camelot::new(camelot_num, camelot_letter).expect("valid camelot"),
                    tuning_cents: 0.0,
                },
                dynamics: DynamicsAnalysis {
                    frame_rate: 43.066,
                    rms_curve: vec![0.3; 32],
                    low_ratio_curve: vec![0.4; 32],
                    centroid_curve: vec![1500.0; 32],
                },
                energy_score: energy,
                energy_curve: EnergyCurve {
                    per_bar: vec![energy as f32; 16],
                },
                segments: vec![],
                cue_points: vec![],
                waveform: Waveform3Band {
                    points_per_sec: 150,
                    low: WaveformBand {
                        peak: vec![100; 150],
                        rms: vec![50; 150],
                    },
                    mid: WaveformBand {
                        peak: vec![80; 150],
                        rms: vec![40; 150],
                    },
                    high: WaveformBand {
                        peak: vec![60; 150],
                        rms: vec![30; 150],
                    },
                },
            }
        })
        .collect()
}

fn bench_analysis(c: &mut Criterion) {
    let mut group = c.benchmark_group("analysis_6min");
    group.sample_size(10);
    group.measurement_time(Duration::from_secs(8));

    let buffer = generate_six_minute_synthetic_buffer();
    let rhythm_config = RhythmConfig::default();

    // 1. Rhythm Analysis
    group.bench_function("rhythm::analyze_rhythm", |b| {
        b.iter(|| {
            analyze_rhythm(black_box(&buffer), black_box(&rhythm_config))
                .expect("rhythm analysis should succeed")
        });
    });

    // 2. Key / Tonal Analysis
    group.bench_function("tonal::analyze_key", |b| {
        b.iter(|| analyze_key(black_box(&buffer)).expect("key analysis should succeed"));
    });

    // 3. Dynamics Analysis
    group.bench_function("dynamics::analyze_dynamics", |b| {
        b.iter(|| analyze_dynamics(black_box(&buffer)).expect("dynamics analysis should succeed"));
    });

    // 4. Structure / Segment Analysis
    let rhythm = analyze_rhythm(&buffer, &rhythm_config).expect("precomputed rhythm");
    let dynamics = analyze_dynamics(&buffer).expect("precomputed dynamics");

    group.bench_function("structure::segment", |b| {
        b.iter(|| {
            segment(black_box(&rhythm), black_box(&dynamics))
                .expect("structure segmentation should succeed")
        });
    });

    group.finish();
}

fn bench_sequencer(c: &mut Criterion) {
    let mut group = c.benchmark_group("sequencer::build_cost_matrix");
    group.sample_size(20);
    group.measurement_time(Duration::from_secs(3));

    let weights = CostWeights::default();
    let profile = EnergyProfile::PeakPlateau;

    for &count in &[20, 50, 100] {
        let tracks = generate_dummy_track_analyses(count);
        group.bench_function(format!("{count}_tracks"), |b| {
            b.iter(|| {
                build_cost_matrix(black_box(&tracks), black_box(&weights), black_box(profile))
            });
        });
    }

    group.finish();
}

criterion_group!(benches, bench_analysis, bench_sequencer);
criterion_main!(benches);
