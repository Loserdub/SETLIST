//! Audio playback engine for SETLIST.
//!
//! Provides local audio decoding and playback via rodio with Symphonia decoders,
//! an isolated timing state machine parameterised over clock traits for deterministic testing,
//! and synchronized beat click synthesis for auditory grid inspection.
//!
//! # Position Clock Contract
//!
//! ### 1. Time Ownership & Authority
//! Time is owned and computed by [`StateMachine`] parameterized over the [`Clock`] trait
//! (specifically [`SystemClock`] in production, using monotonic [`std::time::Instant`]).
//! Audio output sinks run asynchronously on background threads; the state machine maintains
//! continuous, jitter-free position authority without polling audio hardware pointers.
//!
//! ### 2. Update Rate
//! The Tauri IPC bridge publishes position updates over the `playback-position` event channel
//! via a dedicated background ticker thread running at approximately 20–33 Hz (interval ~30–50 ms).
//! The frontend subscribes to these lightweight payloads to smoothly update scrub bars, waveforms,
//! and numerical playhead indicators.
//!
//! ### 3. Playback Speed Multipliers (e.g. 0.8x or 1.2x)
//! Playback speed multiplier $S \in [0.1, 4.0]$ scales progression rate according to:
//! $\Delta \text{position\_ms} = \Delta t_{\text{wall}} \times 1000.0 \times S$.
//! - At **0.8x**, position progresses at 800 ms per elapsed wall-clock second.
//! - At **1.2x**, position progresses at 1200 ms per elapsed wall-clock second.
//!
//! When speed is changed dynamically during active playback:
//! 1. The accumulated `base_position_ms` is frozen up to the current instant.
//! 2. `play_start_time` is re-anchored to `clock.now()` with the new multiplier.
//! 3. The underlying `rodio::Sink::set_speed` adjusts resampler rates in lockstep,
//!    ensuring audio output remains precisely synchronised with playhead tracking.
//!
//! ### 4. Device Failure and Re-acquisition
//! If the system default audio device disconnects or is replaced, [`AudioPlayer`]
//! surfaces typed [`PlaybackError::DeviceError`] and provides [`AudioPlayer::reinitialize_device`],
//! allowing seamless recovery without application restarts.

pub mod click;
pub mod clock;
pub mod player;
pub mod state_machine;

pub use click::*;
pub use clock::*;
pub use player::*;
pub use state_machine::*;
