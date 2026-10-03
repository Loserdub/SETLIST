# C1 Decode and Loudness
Status: done
Changed:
- crates/audio-io/Cargo.toml
- crates/audio-io/src/lib.rs
- docs/handoffs/c1-audio-io-decode.md

Added deps:
- `symphonia` v0.5 with `features = ["all"]` in `audio-io` (multi-format decoding for MP3, FLAC, WAV, AIFF, AAC, M4A, OGG across 16, 24, and 32-bit sources)
- `ebur128` v0.1 in `audio-io` (ITU-R BS.1770 / EBU R128 loudness measurement for integrated LUFS, loudness range, and true peak dBTP)
- `rubato` v0.16 in `audio-io` (high-quality resampling to 44100 Hz mono analysis buffer)
- `lofty` v0.21 in `audio-io` (tag extraction for title, artist, album with fallback to None on missing tags)
- `hound` v3.5 in `audio-io` dev-dependencies (synthetic WAV audio fixture generation in unit tests)

Public API:
- `audio_io`:
  - `pub enum AudioIoError`: `FileNotFound(String)`, `UnsupportedFormat(String)`, `DecodeFailed(String)`
  - `pub fn decode_file<P: AsRef<Path>>(path: P) -> Result<DecodedAudio, AudioIoError>`
  - `pub fn extract_tags<P: AsRef<Path>>(path: P) -> TrackTags`
  - `pub fn resample_mono(samples: &[f32], source_rate: u32, target_rate: u32) -> Result<Vec<f32>, AudioIoError>`

Tests:
- `test_file_not_found`: verifies non-existent path returns `AudioIoError::FileNotFound`
- `test_corrupt_file`: verifies invalid file content returns `AudioIoError::DecodeFailed` / `UnsupportedFormat` and never panics
- `test_empty_audio_file`: verifies 0-byte file returns an error and never panics
- `test_decode_stereo_16bit_44100_sine_lufs`: verifies 16-bit 44.1 kHz stereo sine wave at 0.5 peak amplitude (-6.02 dBFS) matches expected LUFS within 0.5 LU and true peak in dBTP
- `test_decode_mono_24bit_48000`: verifies 24-bit 48 kHz mono source decoding, duration in ms, and rubato resampling to 44.1 kHz mono buffer
- `test_decode_stereo_24bit_48000`: verifies 24-bit 48 kHz stereo source decoding, downmixing, resampling, and loudness measurement within 0.5 LU
- `test_decode_32bit_float`: verifies 32-bit float stereo decoding, length, sample rate, and duration
- `test_decode_32bit_int`: verifies 32-bit integer mono decoding, length, sample rate, and duration
- `test_silence_lufs`: verifies silence input produces low/negative-infinity LUFS and dBTP without panics
- `test_extract_tags_missing_is_none`: verifies untagged files return `None` for title, artist, and album without error
- `test_extract_tags_present`: verifies tagged files return valid `Some(...)` strings
- `test_resample_mono_direct_cases`: verifies pass-through on identical sample rate, empty inputs, zero rate error handling, and 22050 to 44100 upsampling

Known gaps:
- None for v1 classical DSP decode pipeline

Needs from others:
- Workgroups A and B consume `DecodedAudio` for rhythm, tonal, dynamics, structure, and waveform analysis
