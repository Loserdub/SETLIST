# 004-rhythm-novelty-tempo Novelty Curve and Global BPM Estimation
Status: done
Changed:
- crates/audio-analysis/Cargo.toml
- crates/audio-analysis/src/rhythm/mod.rs
- crates/audio-analysis/src/rhythm/onset.rs
- crates/audio-analysis/src/rhythm/tempo.rs
- crates/core-types/src/types.rs
- ui/src/bindings/RhythmConfig.ts

Added deps:
- `rustfft = "6.4"` in `crates/audio-analysis` for STFT and autocorrelation FFT computations.

Public API:
- `audio_analysis::rhythm::onset`:
  - `pub const WINDOW_SIZE: usize = 1411;` (approx 32 ms at 44.1 kHz)
  - `pub const FFT_SIZE: usize = 2048;`
  - `pub const HOP_SIZE: usize = 256;`
  - `pub const NUM_MEL_BANDS: usize = 40;`
  - `pub const MIN_FREQ_HZ: f32 = 20.0;`
  - `pub const MAX_FREQ_HZ: f32 = 22050.0;`
  - `pub struct NoveltyCurve { pub values: Vec<f32>, pub frame_rate: f64 }`
  - `pub struct MelFilterbank { ... }` with `new(num_bands, fft_size, sample_rate)` and `apply(&self, mag_spec, out_energies)`
  - `pub fn hann_window(size: usize) -> Vec<f32>`
  - `pub fn compute_novelty_curve(buffer: &AudioBuffer) -> Result<NoveltyCurve, AnalysisError>`
- `audio_analysis::rhythm::tempo`:
  - `pub fn estimate_tempo(novelty: &NoveltyCurve, config: &RhythmConfig) -> Result<(f64, Vec<f64>), AnalysisError>`
- `audio_analysis::rhythm`:
  - `pub fn analyze_rhythm(buffer: &AudioBuffer, config: &RhythmConfig) -> Result<RhythmAnalysis, AnalysisError>`
- `core_types::types`:
  - `RhythmConfig` updated with `bpm_prior_center: f64` (default 125.0) and `bpm_prior_width: f64` (default 0.6) to configure the log-normal tempo prior.

Tests:
- `rhythm::onset::tests::test_hann_window`: Verifies symmetry, endpoints at 0.0, and peak at 1.0.
- `rhythm::onset::tests::test_mel_filterbank_creation`: Verifies 40 non-empty triangular filters spanning 20 Hz to Nyquist.
- `rhythm::onset::tests::test_novelty_curve_silence`: Verifies zero spectral flux and correct frame rate (172.265625 Hz).
- `rhythm::tests::test_click_tracks_90_128_150_174`: Verifies synthetic click tracks at 90, 128, 150, and 174 BPM detect accurate BPM within 0.5 BPM or correct octave in alternates.
- `rhythm::tests::test_click_track_128_with_noise`: Verifies 128 BPM click track with additive deterministic pseudo-random noise passes.
- `rhythm::tests::test_six_minute_buffer_performance`: Benchmarks a full 6-minute audio buffer (15,876,000 samples, ~62,000 frames) in release mode, completing in ~0.63 - 0.91 seconds (threshold: < 3.0 seconds).

Known gaps:
- Dynamic/time-varying tempo tracking (non-steady beat grids) will be added in a later iteration; currently `steady: true`.

Needs from others:
- Downstream modules can consume `analyze_rhythm` or modularly invoke `compute_novelty_curve` and `estimate_tempo`.
