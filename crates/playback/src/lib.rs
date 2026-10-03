//! Audio playback engine for SETLIST.
//!
//! Provides local audio decoding and playback via rodio with Symphonia decoders,
//! an isolated timing state machine parameterised over clock traits for deterministic testing,
//! and synchronized beat click synthesis for auditory grid inspection.

pub mod click;
pub mod clock;
pub mod player;
pub mod state_machine;

pub use click::*;
pub use clock::*;
pub use player::*;
pub use state_machine::*;
