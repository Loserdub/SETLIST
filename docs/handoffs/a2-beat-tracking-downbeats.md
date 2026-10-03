# A2 Beat Tracking and Downbeats
Status: done
Changed:
- crates/audio-analysis/src/rhythm/beats.rs
- crates/audio-analysis/src/rhythm/downbeat.rs
- crates/audio-analysis/src/rhythm/mod.rs

Added deps:
- None. (Reused existing `rustfft`, `core-types`, and standard libraries).

Public API:
- `audio_analysis::rhythm::beats`:
  - `pub const DP_ALPHA: f64 = 100.0;`
  - `pub const STEADY_RESIDUAL_MS: f64 = 8.0;`
  - `pub struct BeatFrame { pub frame: usize }`
  - `pub struct TrackedBeats { pub beats: Vec<BeatFrame>, pub fitted_bpm: f64, pub fitted_offset_frames: f64, pub residual_ms: f64, pub steady: bool }`
  - `pub fn track_beats(novelty: &NoveltyCurve, seed_bpm: f64, alpha: f64) -> Result<TrackedBeats, AnalysisError>`
- `audio_analysis::rhythm::downbeat`:
  - `pub const LOW_BAND_MAX_HZ: f32 = 150.0;`
  - `pub fn low_band_energies(buffer: &AudioBuffer, beats: &TrackedBeats) -> Vec<f32>`
  - `pub fn pick_downbeat_phase(energies: &[f32]) -> usize`
- `audio_analysis::rhythm`:
  - `pub fn analyze_rhythm(buffer: &AudioBuffer, config: &RhythmConfig) -> Result<RhythmAnalysis, AnalysisError>`

Tests:
- `rhythm::beats::tests::test_beat_tracker_128_bpm`: Verifies DP tracking on 128 BPM synthetic novelty produces accurate BPM, low residual (< 5 ms), and `steady = true`.
- `rhythm::beats::tests::test_beat_tracker_start_offset`: Verifies 137 ms offset recovery within 10 ms at the beat tracker frame level.
- `rhythm::beats::tests::test_beat_tracker_slight_tempo_drift`: Verifies < 0.5% (0.4%) linear tempo drift produces `steady = true`.
- `rhythm::beats::tests::test_accented_downbeat_phase`: Verifies deterministic beat tracking on novelty with accented bar beats.
- `rhythm::downbeat::tests::test_pick_phase_identifies_loud_beat`: Verifies downbeat phase picker selects the phase index with largest mean energy.
- `rhythm::downbeat::tests::test_pick_phase_uniform`: Verifies picker behavior on uniform energy distribution.
- `rhythm::downbeat::tests::test_low_band_energies_silence`: Verifies zero energy on silence.
- `rhythm::downbeat::tests::test_low_band_energies_kick_accent`: Verifies low-band kick bursts (< 150 Hz) are reflected in energy calculations.
- `rhythm::tests::test_accented_downbeat_phase_correct`: Integrated test with 20s accented click track verifying downbeats are spaced every 4 beats and align with `first_downbeat_ms`.
- `rhythm::tests::test_start_offset_recovered_within_10ms`: Integrated test verifying a 137 ms click track offset is recovered within 10 ms (actual error < 1.0 ms) by accounting for STFT window onset delay.
- `rhythm::tests::test_tempo_drift_under_half_percent_is_steady`: Integrated test verifying audio click track with 0.4% tempo drift sets `steady = true`.
- `rhythm::tests::test_six_minute_buffer_performance`: Release benchmark completes in ~0.65s (requirement < 3.0s).

Known gaps:
- Dynamic/time-varying tempo tracking (non-constant grids) is out of scope for v1 per AGENTS.md; v1 produces fixed constant grids with `steady` flag.

Needs from others:
- Downstream crates (e.g. `crates/sequencer`, `crates/exporters`, UI) can directly invoke `analyze_rhythm` to obtain full `BeatGrid` information.
