# P2 Playback Robustness
Status: done
Changed:
- `crates/playback/src/player.rs`
- `crates/playback/src/lib.rs`
- `crates/playback/Cargo.toml`
Added deps: `hound = "3.5"` (dev-dependency for generating synthetic test audio fixtures)
Public API:
- `AudioPlayer::stop(&self) -> Result<(), PlaybackError>`: drops the sink, releases file handles, and resets position to `0.0`.
- `AudioPlayer::reinitialize_device(&self) -> Result<(), PlaybackError>`: attempts to re-acquire the system default audio device after device change/loss without app restart.
- Poison-safe lock handling: all mutex acquisitions use `lock_mutex` recovering from poisoning without panicking.
- Position clock contract documented in `crates/playback/src/lib.rs`.

Tests:
- `player::tests::test_stop_drops_sink_and_resets_position`: verifies stop drops sink, clears file handles, resets position to 0.0, and sets state to Stopped.
- `player::tests::test_poison_safe_lock_recovery`: simulates mutex poisoning and proves recovery without panic.
- `player::tests::test_mono_and_sample_rate_resampling_clean_decode`: generates 48kHz mono and 96kHz stereo WAV audio fixtures and proves clean decoding and loading.
- `player::tests::test_accurate_seek_with_audio_fixture`: verifies seeking accuracy within < 1ms across audio fixtures.

Known gaps:
- none

Needs from others:
- G1: wire `AudioPlayer::stop` to Tauri command `playback_stop`.
