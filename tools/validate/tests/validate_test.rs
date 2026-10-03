//! Integration test for tools/validate: runs analysis and accuracy reporting
//! across a synthetic directory of 20 audio files with ground truth.

use std::f32::consts::PI;
use std::fs;
use std::path::Path;
use std::process::Command;

use validate::{analyze_folder, evaluate_accuracy, generate_csv, parse_ground_truth};

/// Generates a synthetic mono 16-bit PCM WAV file with beat pulses and harmonic chord components.
fn generate_wav_track(
    path: &Path,
    duration_secs: f64,
    bpm: f64,
    root_hz: f32,
    third_hz: f32,
    fifth_hz: f32,
) {
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

        // Harmonic triad
        let tone = 0.25 * (2.0 * PI * root_hz * t).sin()
            + 0.15 * (2.0 * PI * third_hz * t).sin()
            + 0.10 * (2.0 * PI * fifth_hz * t).sin();

        // Rhythmic click / kick transient on each beat
        let click = if beat_period_samples > 0 && (i % beat_period_samples) < 250 {
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

#[test]
fn test_validation_report_on_20_files() {
    let temp_dir = tempfile::tempdir().expect("create tempdir");
    let audio_dir = temp_dir.path().join("audio");
    fs::create_dir_all(&audio_dir).expect("create audio dir");

    // 20 test definitions: (filename, bpm, root_hz, third_hz, fifth_hz, key_name, camelot)
    let tracks_spec = [
        (
            "track_01.wav",
            120.0,
            440.0,
            554.37,
            659.25,
            "A major",
            "11B",
        ),
        (
            "track_02.wav",
            122.0,
            440.0,
            523.25,
            659.25,
            "A minor",
            "8A",
        ),
        (
            "track_03.wav",
            124.0,
            261.63,
            329.63,
            392.00,
            "C major",
            "8B",
        ),
        (
            "track_04.wav",
            125.0,
            261.63,
            311.13,
            392.00,
            "C minor",
            "5A",
        ),
        (
            "track_05.wav",
            126.0,
            329.63,
            392.00,
            493.88,
            "E minor",
            "9A",
        ),
        (
            "track_06.wav",
            128.0,
            392.00,
            493.88,
            587.33,
            "G major",
            "9B",
        ),
        (
            "track_07.wav",
            128.0,
            293.66,
            349.23,
            440.00,
            "D minor",
            "7A",
        ),
        (
            "track_08.wav",
            130.0,
            349.23,
            440.00,
            523.25,
            "F major",
            "7B",
        ),
        (
            "track_09.wav",
            132.0,
            220.00,
            261.63,
            329.63,
            "A minor",
            "8A",
        ),
        (
            "track_10.wav",
            134.0,
            246.94,
            293.66,
            369.99,
            "B minor",
            "10A",
        ),
        (
            "track_11.wav",
            135.0,
            293.66,
            369.99,
            440.00,
            "D major",
            "10B",
        ),
        (
            "track_12.wav",
            138.0,
            196.00,
            233.08,
            293.66,
            "G minor",
            "6A",
        ),
        (
            "track_13.wav",
            140.0,
            233.08,
            293.66,
            349.23,
            "Bb major",
            "6B",
        ),
        (
            "track_14.wav",
            142.0,
            174.61,
            207.65,
            261.63,
            "F minor",
            "4A",
        ),
        (
            "track_15.wav",
            145.0,
            207.65,
            261.63,
            311.13,
            "Ab major",
            "4B",
        ),
        (
            "track_16.wav",
            150.0,
            311.13,
            369.99,
            466.16,
            "Eb minor",
            "2A",
        ),
        (
            "track_17.wav",
            155.0,
            369.99,
            466.16,
            554.37,
            "F# major",
            "2B",
        ),
        (
            "track_18.wav",
            160.0,
            277.18,
            329.63,
            415.30,
            "C# minor",
            "12A",
        ),
        (
            "track_19.wav",
            170.0,
            329.63,
            415.30,
            493.88,
            "E major",
            "12B",
        ),
        (
            "track_20.wav",
            174.0,
            440.00,
            523.25,
            659.25,
            "A minor",
            "8A",
        ),
    ];

    // Build ground-truth CSV content
    let mut gt_csv = String::from("file,bpm,key\n");
    for (name, bpm, root, third, fifth, key, _) in &tracks_spec {
        let file_path = audio_dir.join(name);
        // Short 2.5 second audio for high-speed deterministic test execution
        generate_wav_track(&file_path, 2.5, *bpm, *root, *third, *fifth);
        gt_csv.push_str(&format!("{name},{bpm},{key}\n"));
    }

    let gt_path = temp_dir.path().join("ground_truth.csv");
    fs::write(&gt_path, &gt_csv).expect("write ground truth csv");

    // 1. Analyze the folder of 20 files
    let analyzed_rows = analyze_folder(&audio_dir).expect("analyze folder");
    assert_eq!(
        analyzed_rows.len(),
        20,
        "All 20 audio tracks should be analyzed"
    );

    // 2. Generate and verify CSV
    let csv_output = generate_csv(&analyzed_rows);
    assert!(csv_output.starts_with("file,bpm,key,camelot,lufs,energy\n"));
    let csv_lines: Vec<&str> = csv_output.trim().lines().collect();
    assert_eq!(csv_lines.len(), 21); // 1 header + 20 data rows

    // 3. Parse ground truth and evaluate accuracy
    let gt_rows = parse_ground_truth(&gt_csv).expect("parse ground truth");
    assert_eq!(gt_rows.len(), 20);

    let report = evaluate_accuracy(&analyzed_rows, &gt_rows);
    assert_eq!(report.total_analyzed, 20);
    assert_eq!(report.total_matched, 20);

    // Verify report string output
    let report_str = report.to_string();
    assert!(report_str.contains("VALIDATION ACCURACY REPORT"));
    assert!(report_str.contains("Analyzed Audio Files:  20"));
    assert!(report_str.contains("Ground-Truth Matched:  20 (100.0%)"));
    assert!(report_str.contains("Tempo (BPM) Evaluation:"));
    assert!(report_str.contains("Within +/-0.5 BPM:"));
    assert!(report_str.contains("Correct up to an Octave:"));
    assert!(report_str.contains("Musical Key (Camelot) Evaluation:"));
    assert!(report_str.contains("Exact Key Match:"));
    assert!(report_str.contains("Camelot-Adjacent (d <= 1):"));
    assert!(report_str.contains("Worst 10 Files (Ranked by Error Severity):"));

    // Verify worst_10 list is populated (up to 10 entries)
    assert!(report.worst_10.len() <= 10);
    assert!(!report.worst_10.is_empty());
}

#[test]
fn test_cli_binary_execution_on_folder() {
    let temp_dir = tempfile::tempdir().expect("create tempdir");
    let audio_dir = temp_dir.path().join("audio_cli");
    fs::create_dir_all(&audio_dir).expect("create audio dir");

    // Generate 2 tracks for quick CLI test
    let track1 = audio_dir.join("cli_track_01.wav");
    generate_wav_track(&track1, 2.0, 128.0, 440.0, 554.37, 659.25);
    let track2 = audio_dir.join("cli_track_02.wav");
    generate_wav_track(&track2, 2.0, 124.0, 261.63, 329.63, 392.00);

    let gt_csv = "file,bpm,key\ncli_track_01.wav,128.0,11B\ncli_track_02.wav,124.0,8B\n";
    let gt_path = temp_dir.path().join("cli_gt.csv");
    fs::write(&gt_path, gt_csv).expect("write gt csv");

    let out_csv_path = temp_dir.path().join("out.csv");

    let bin_path = env!("CARGO_BIN_EXE_validate");
    let output = Command::new(bin_path)
        .arg(&audio_dir)
        .arg("--ground-truth")
        .arg(&gt_path)
        .arg("--output")
        .arg(&out_csv_path)
        .output()
        .expect("run validate binary");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("VALIDATION ACCURACY REPORT"));
    assert!(stdout.contains("Analyzed Audio Files:  2"));
    assert!(out_csv_path.is_file());
}
