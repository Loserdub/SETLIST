# B4 Multi-Band Waveform
Status: done
Changed:
- crates/audio-analysis/src/waveform/mod.rs
- docs/handoffs/b4-waveform-3band.md

Added deps: none

Public API:
- `audio_analysis::waveform`:
  - `pub const WAVEFORM_POINTS_PER_SEC: u32 = 150`
  - `pub const LOW_CUTOFF_HZ: f64 = 150.0`
  - `pub const HIGH_CUTOFF_HZ: f64 = 2500.0`
  - `pub struct Biquad`: `new`, `process`, `reset`
  - `pub struct Butterworth4`: `lowpass`, `highpass`, `process`, `reset`
  - `pub struct Bandpass4`: `new`, `process`, `reset`
  - `pub fn compute_waveform(buffer: &AudioBuffer) -> Result<Waveform3Band, AnalysisError>`
  - `pub fn encode_waveform(waveform: &Waveform3Band) -> Vec<u8>`
  - `pub fn decode_waveform(bytes: &[u8]) -> Result<Waveform3Band, AnalysisError>`
  - `pub fn encode_waveform_band(band: &WaveformBand) -> Vec<u8>`
  - `pub fn decode_waveform_band(bytes: &[u8]) -> Result<WaveformBand, AnalysisError>`

Tests:
- `test_sine_60hz_lights_up_low_band`: verifies 60 Hz sine wave produces dominant response (>5x mid, >10x high) in the low band (< 150 Hz).
- `test_sine_1000hz_lights_up_mid_band`: verifies 1000 Hz sine wave produces dominant response (>5x low, >5x high) in the mid band (150 - 2500 Hz).
- `test_sine_8000hz_lights_up_high_band`: verifies 8000 Hz sine wave produces dominant response (>10x low, >5x mid) in the high band (> 2500 Hz).
- `test_encode_decode_roundtrip`: verifies lossless binary serialization and deserialization of `Waveform3Band`.
- `test_encode_decode_band_roundtrip`: verifies byte serialization and deserialization of a single `WaveformBand`.
- `test_decode_invalid_payloads`: verifies error handling for truncated buffers, invalid magic headers, and mismatched lengths.
- `test_empty_buffer_and_invalid_sample_rate`: verifies validation of empty input buffers and invalid/low sample rates.
- `test_six_minute_buffer_performance`: verifies processing of 15.8M samples (6 minutes) in under 2 seconds.

Known gaps:
- None for v1 classical DSP 3-band waveform generation.

Needs from others:
- Workgroup Integration (pipeline::analyze_decoded) calls `waveform::compute_waveform`.
- Workgroup F (UI waveform canvas component) consumes `Waveform3Band` points.
