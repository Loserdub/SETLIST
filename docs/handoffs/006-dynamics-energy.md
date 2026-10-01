# 006-dynamics-energy Dynamics Analysis and Energy Score
Status: done
Changed:
- crates/audio-analysis/src/dynamics/mod.rs

Added deps:
- None (uses existing `rustfft` already in `crates/audio-analysis`)

Public API:
- `audio_analysis::dynamics`:
  - `pub const WINDOW_SIZE: usize = 2048;` (~46.4 ms at 44.1 kHz)
  - `pub const FFT_SIZE: usize = 2048;`
  - `pub const HOP_SIZE: usize = 1024;`
  - `pub const LOW_FREQ_HZ: f32 = 150.0;`
  - `pub const FRAME_RATE: f64 = 44100.0 / 1024.0;` (≈ 43.07 Hz)
  - `pub struct EnergyModel { w_lufs, lufs_lo, lufs_hi, w_rms, rms_lo, rms_hi, w_low, low_lo, low_hi, w_centroid, centroid_lo, centroid_hi }`
    - Implements `Default` with documented per-feature weights and absolute fixed bounds.
    - `pub fn compute_score(&self, integrated_lufs, mean_rms, mean_low_ratio, mean_centroid_hz) -> f32`
    - `pub fn to_energy_level(score: f32) -> u8`
  - `pub fn analyze_dynamics(buffer: &AudioBuffer) -> Result<DynamicsAnalysis, AnalysisError>`
  - `pub fn energy_curve(dynamics: &DynamicsAnalysis, grid: &BeatGrid) -> Result<EnergyCurve, AnalysisError>`
  - `pub fn energy_score(dynamics: &DynamicsAnalysis, grid: &BeatGrid) -> Result<u8, AnalysisError>`
  - `pub fn energy_score_with_lufs(dynamics: &DynamicsAnalysis, integrated_lufs: f32, model: &EnergyModel) -> Result<u8, AnalysisError>`

Implementation notes:
- `analyze_dynamics`: STFT with Hann window, hop = 1024. Per frame computes: (a) RMS over time-domain block; (b) low-frequency power ratio below 150 Hz via magnitude spectrum; (c) spectral centroid weighted by power.
- `energy_curve`: groups frames by downbeat boundaries from `BeatGrid.downbeat_flags`. Averages RMS per bar, normalises so peak bar = 1.0. Falls back to single bar if fewer than 2 downbeats.
- `energy_score`: matches the locked contract signature (no LUFS param). Uses LUFS at the neutral midpoint `(lufs_lo + lufs_hi) / 2`. Call `energy_score_with_lufs` when LUFS is available from `audio-io`.
- `EnergyModel` centroid weight is **inverted**: high centroid (bright/thin) → lower score, matching DJ domain where bass-heavy tracks are high-energy.

Tests:
- `test_silence_rms_is_zero`: Mean RMS of a silent buffer is < 1e-6.
- `test_empty_buffer_returns_error`: Empty buffer returns `InvalidInput`.
- `test_frame_rate_is_correct`: Frame rate matches `44100 / HOP_SIZE`.
- `test_low_ratio_high_for_bass_signal`: 60 Hz tone → mean low ratio > 0.8.
- `test_low_ratio_low_for_high_freq_signal`: 5 kHz tone → mean low ratio < 0.1.
- `test_centroid_high_for_high_freq_signal`: 4 kHz tone → mean centroid > 2000 Hz.
- `test_energy_model_scale_bounds`: Scale clamping and boundary mapping verified.
- `test_energy_level_mapping`: `to_energy_level(0.0) == 1`, `to_energy_level(1.0) == 10`.
- `test_energy_score_stub_compat`: Locked contract signature returns a value in [1, 10].
- `test_monotonic_energy_score_across_five_signals`: 5 synthetic signals progressing from quiet/thin to loud/bass-heavy (LUFS -28 → -6) yield strictly monotonic scores [2, 4, 6, 9, 10].
- `test_quiet_middle_shows_dip_in_energy_curve`: A 440 Hz tone with a quiet middle third shows per-bar values where the middle bars average lower than the outer bars.

Known gaps:
- `energy_score` uses a neutral LUFS when LUFS is not passed; call `energy_score_with_lufs` with the value from `audio-io` for the most accurate score.
- Dynamic LUFS compensation inside `analyze_dynamics` is deferred to a later phase; loudness gating could improve per-frame features.

Needs from others:
- Pre-existing failure in `rhythm::tests::test_start_offset_recovered_within_15ms` is in Workgroup A's rhythm module (downbeat offset phase detection), not in dynamics. Not caused by this task.
- Integration path: `sequencer` and `src-tauri` should call `energy_score_with_lufs` passing the `LoudnessInfo.integrated_lufs` from `audio-io::decode_file`.
