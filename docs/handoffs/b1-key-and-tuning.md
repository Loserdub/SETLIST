# B1 Key Detection and Tuning
Status: done
Changed:
- crates/audio-analysis/src/tonal/mod.rs
- crates/audio-analysis/src/tonal/chroma.rs
- crates/audio-analysis/src/tonal/profiles.rs

Added deps:
- None (uses existing `rustfft` and pure Rust classical DSP)

Public API:
- `audio_analysis::tonal::chroma`:
  - `pub const WINDOW_SIZE: usize = 4096;` (~92.9 ms at 44.1 kHz)
  - `pub const FFT_SIZE: usize = 8192;` (~5.38 Hz bin resolution)
  - `pub const HOP_SIZE: usize = 2048;`
  - `pub const MIN_FREQ_HZ: f32 = 60.0;`
  - `pub const MAX_FREQ_HZ: f32 = 5000.0;`
  - `pub struct SpectralPeak { pub freq: f32, pub mag: f32 }`
  - `pub struct ChromagramResult { pub mean_chroma: [f32; 12], pub frames: Vec<[f32; 12]>, pub tuning_cents: f32 }`
  - `pub fn hann_window(length: usize) -> Vec<f32>`
  - `pub fn estimate_tuning(peaks_by_frame: &[Vec<SpectralPeak>]) -> f32`
  - `pub fn compute_chromagram(buffer: &AudioBuffer) -> Result<ChromagramResult, AnalysisError>`
- `audio_analysis::tonal::profiles`:
  - `pub enum KeyProfile { KrumhanslKessler, Temperley, Edma }`
  - `pub struct KeyCandidate { pub pitch_class: u8, pub mode: Mode, pub correlation: f32 }`
  - `pub fn pearson_correlation(x: &[f32; 12], y: &[f32; 12]) -> f32`
  - `pub fn correlate_chroma(mean_chroma: &[f32; 12], profile: KeyProfile) -> Vec<KeyCandidate>`
  - `pub fn compute_confidence(candidates: &[KeyCandidate]) -> f32`
- `audio_analysis::tonal`:
  - `pub struct KeyAnalysis { pub key: Key, pub confidence: f32, pub chroma: [f32; 12], pub candidates: Vec<KeyCandidate> }`
  - `pub fn analyze_key(buffer: &AudioBuffer) -> Result<Key, AnalysisError>`
  - `pub fn analyze_key_detailed(buffer: &AudioBuffer, profile: KeyProfile) -> Result<KeyAnalysis, AnalysisError>`
  - `pub fn analyze_key_with_confidence(buffer: &AudioBuffer) -> Result<(Key, f32), AnalysisError>`

Tests:
- `tonal::tests::test_silence_returns_error`: Verifies that silent audio buffer fails with an appropriate analysis error.
- `tonal::tests::test_empty_buffer_returns_invalid_input`: Verifies that empty audio buffer fails with `AnalysisError::InvalidInput`.
- `tonal::tests::test_all_24_additive_triads`: Evaluates synthetic additive-harmonic triads across all 24 musical keys (12 major, 12 minor) with 6 harmonics per note. 24 of 24 (100%) correctly and uniquely classified.
- `tonal::tests::test_432_hz_tuning_and_key`: Synthesizes an A major triad tuned to 432 Hz. Accurately estimates tuning deviation (-31.77 cents, within 0.01 cents of expected -31.7666 cents), compensates for it before chroma folding, and resolves the correct key (A Major, Camelot 11B).
- `tonal::tests::test_alternative_key_profiles`: Verifies that `KrumhanslKessler`, `Temperley`, and `Edma` profile templates all correctly classify musical keys.

Known gaps:
- Constant-Q transform (CQT) and deep neural chroma can be added in a future phase behind the existing chroma extraction interface.

Needs from others:
- Downstream crates (`sequencer`, `library-db`, Tauri commands) can invoke `audio_analysis::tonal::analyze_key` or `analyze_key_detailed`.
