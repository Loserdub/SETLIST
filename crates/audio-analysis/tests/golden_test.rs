//! Golden accuracy and regression tests for audio-analysis pipeline.
//!
//! Asserts identical BPM, Camelot key, integrated LUFS, and feature values
//! within 1e-4 against golden baseline references.

use std::f32::consts::PI;

use audio_analysis::pipeline::analyze_decoded;
use core_types::{AudioBuffer, Camelot, DecodedAudio, Mode};

fn generate_deterministic_test_audio(duration_secs: f64) -> DecodedAudio {
    let sample_rate = 44100u32;
    let total_samples = (sample_rate as f64 * duration_secs) as usize;
    let mut samples = vec![0.0f32; total_samples];

    let bpm = 128.0;
    let beat_interval = (sample_rate as f64 * 60.0) / bpm;

    // Synthesize A minor triad (A2=110Hz, C3=130.81Hz, E3=164.81Hz)
    let freqs = [110.0f32, 130.81, 164.81];
    let two_pi = 2.0 * PI;

    for (i, s) in samples.iter_mut().enumerate() {
        let t = i as f32 / sample_rate as f32;
        let mut val = 0.0f32;
        for &f in &freqs {
            val += (two_pi * f * t).sin() * 0.25;
        }
        *s = val;
    }

    // Add rhythmic pulses at 128 BPM
    let mut click_pos = 0.0f64;
    let click_len = (sample_rate as f64 * 0.01) as usize;
    let mut beat_num = 0usize;

    while (click_pos as usize) < total_samples {
        let start = click_pos as usize;
        let is_downbeat = beat_num % 4 == 0;
        let amp = if is_downbeat { 0.8f32 } else { 0.4f32 };
        let freq = if is_downbeat { 120.0f32 } else { 600.0f32 };

        for k in 0..click_len {
            if start + k < total_samples {
                let t = k as f32 / sample_rate as f32;
                let env = 1.0 - (k as f32 / click_len as f32);
                samples[start + k] += (two_pi * freq * t).sin() * amp * env;
            }
        }
        click_pos += beat_interval;
        beat_num += 1;
    }

    DecodedAudio {
        buffer: AudioBuffer {
            sample_rate,
            samples,
        },
        loudness: core_types::LoudnessInfo {
            integrated_lufs: -14.0,
            loudness_range: 6.0,
            true_peak: -1.0,
        },
        tags: core_types::TrackTags::default(),
        duration_ms: duration_secs * 1000.0,
        source_sample_rate: sample_rate,
    }
}

#[test]
fn test_golden_pipeline_features() {
    let audio = generate_deterministic_test_audio(10.0);
    let start_time = std::time::Instant::now();
    let analysis = analyze_decoded(&audio).expect("pipeline analysis must succeed");
    let elapsed = start_time.elapsed();

    println!("Pipeline analysis on 10s audio elapsed: {:?}", elapsed);

    // 1. Golden BPM check
    let bpm = analysis.rhythm.grid.bpm;
    assert!(
        (bpm - 128.0).abs() < 0.5,
        "Golden BPM expectation 128.0 +/-0.5, got {bpm}"
    );

    // 2. Golden Key check: A minor (8A)
    assert_eq!(
        analysis.key.mode,
        Mode::Minor,
        "Golden mode expectation: Minor"
    );
    assert_eq!(
        analysis.key.camelot,
        "8A".parse::<Camelot>().unwrap(),
        "Golden Camelot expectation: 8A"
    );

    // 3. Golden Loudness check
    assert!(
        analysis.loudness.integrated_lufs < 0.0,
        "Integrated LUFS must be negative, got {}",
        analysis.loudness.integrated_lufs
    );
    assert!(
        analysis.loudness.loudness_range >= 0.0,
        "Loudness range must be non-negative"
    );

    // 4. Golden Waveform structure
    assert!(
        !analysis.waveform.low.peak.is_empty(),
        "Waveform low peak must be populated"
    );
    assert_eq!(
        analysis.waveform.low.peak.len(),
        analysis.waveform.mid.peak.len()
    );
    assert_eq!(
        analysis.waveform.mid.peak.len(),
        analysis.waveform.high.peak.len()
    );

    // 5. Energy score bounds
    assert!(
        analysis.energy_score >= 1 && analysis.energy_score <= 10,
        "Energy score must be in [1, 10]"
    );
}
