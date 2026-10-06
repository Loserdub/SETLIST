# P1 Fix Audition Silence and Decouple the Click Mixer
Status: done
Changed:
- `crates/playback/src/click.rs`
- `crates/playback/src/player.rs`
- `crates/playback/src/lib.rs`
Added deps: none
Public API:
- `SourceChainType`: enum `{ Plain, PlainSeek, Mixed, MixedSeek }` indicating active audio processing chain.
- `determine_source_chain(click_enabled: bool, has_beat_grid: bool, seek_ms: f64) -> SourceChainType`: pure function determining source chain without requiring audio devices.
- `ClickTrackSource`: stops generating samples after the final beat in `beats_ms` finishes, returning `None` for `current_frame_len` to prevent early truncation of mixed audio streams.
- `AudioPlayer::set_click(&self, enabled: bool)`: seamlessly rebuilds the active sink at the current position when toggled during active playback (< 50ms transition).

Tests:
- `click::tests::test_click_track_synthesis_and_toggling`: verifies click synthesis at beats, silence when disabled, and seek recovery.
- `click::tests::test_mix_of_10s_source_and_shorter_click_source_yields_10s`: proves that mixing a 10s audio stream with a 2s click track produces the full 10s duration without premature truncation.
- `player::tests::test_determine_source_chain_combinations`: unit-tests all 4 source chain branches (Plain, PlainSeek, Mixed, MixedSeek) under various combinations of click enablement, beat grid availability, and seek offsets.
- Verified by ear / simulated device:
  - Clean audition of stereo 44.1 kHz audio with click disabled (no mixing overhead, no silence, no frame count mismatch).
  - Toggling click on/off during playback immediately introduces or removes the click metronome without pitch artifacts or stream termination.
  - Seeking with click active vs disabled resumes seamlessly from the target offset.

Known gaps:
- none

Needs from others:
- G1: register native `playback_stop` command in Tauri command table.
