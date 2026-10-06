# C2 Remove unwrap and expect

Status: done
Changed:
- `crates/audio-io/src/lib.rs`
- `crates/library-db/src/lib.rs`

Added deps: none

Enforcement:
Added `#![deny(clippy::unwrap_used, clippy::expect_used)]` and `#![cfg_attr(test, allow(clippy::unwrap_used, clippy::expect_used))]` at crate roots of `crates/audio-io` and `crates/library-db`.

Audit of unwrap/expect removed:
1. `crates/audio-io/src/lib.rs`:
   - Replaced internal decoders unwrap with proper error propagation (`AudioIoError`).
   - Replaced symphonia codec unwraps with pattern matching returning `AudioIoError::UnsupportedFormat` or `DecodingFailed`.
   - Added corrupt/truncated input handling: zero-byte MP3 returns `EmptyAudioData`, truncated WAV returns clean error, never panicking.
2. `crates/library-db/src/lib.rs` and submodules:
   - Replaced mutex poisoning `.lock().unwrap()` with poison-safe `.into_inner()` fallback or error propagation.
   - Replaced unchecked conversions with explicit checked bounds or `unwrap_or`.

Tests:
- Corrupt and truncated file tests:
  - `tests::test_zero_byte_mp3_returns_error_without_panic`: passes cleanly.
  - `tests::test_truncated_wav_returns_error_without_panic`: passes cleanly.
- `cargo clippy -p audio-io -p library-db -- -D warnings`: 0 warnings, zero unwrap/expect in production code paths.

Known gaps: None.
Needs from others: None.
