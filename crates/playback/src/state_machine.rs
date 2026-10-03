//! Playback state machine managing play/pause/stop lifecycle, seek clamping, and timing calculations.

use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::clock::Clock;

/// High-level playback status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PlayerState {
    /// Playback is stopped and reset.
    #[serde(rename = "stopped", alias = "Stopped")]
    Stopped,
    /// Playback is actively proceeding forward in time.
    #[serde(rename = "playing", alias = "Playing")]
    Playing,
    /// Playback is suspended at a specific position.
    #[serde(rename = "paused", alias = "Paused")]
    Paused,
}

/// Abstract contract for the audio player state machine.
pub trait PlaybackStateMachine: Send + Sync {
    /// Loads a track duration in milliseconds, resetting state to [`PlayerState::Stopped`].
    fn load(&mut self, duration_ms: f64);

    /// Starts or resumes playback. Transitions from Stopped or Paused to Playing.
    fn play(&mut self);

    /// Pauses playback, preserving the exact position.
    fn pause(&mut self);

    /// Stops playback and resets position to `0.0`.
    fn stop(&mut self);

    /// Seeks to a position in milliseconds, clamped to `[0.0, duration_ms]`.
    fn seek(&mut self, position_ms: f64);

    /// Returns the current playback state.
    fn state(&self) -> PlayerState;

    /// Returns the current playback position in milliseconds.
    fn position_ms(&self) -> f64;

    /// Returns total track duration in milliseconds.
    fn duration_ms(&self) -> f64;
}

/// State machine implementation parameterised over a [`Clock`].
#[derive(Debug)]
pub struct StateMachine<C: Clock> {
    clock: C,
    state: PlayerState,
    duration_ms: f64,
    base_position_ms: f64,
    play_start_time: Duration,
}

impl<C: Clock> StateMachine<C> {
    /// Creates a new state machine bound to the provided clock.
    #[must_use]
    pub fn new(clock: C) -> Self {
        Self {
            clock,
            state: PlayerState::Stopped,
            duration_ms: 0.0,
            base_position_ms: 0.0,
            play_start_time: Duration::ZERO,
        }
    }

    /// Returns a reference to the underlying clock.
    #[must_use]
    pub fn clock(&self) -> &C {
        &self.clock
    }

    /// Internal calculation of the current position in milliseconds before state auto-stop.
    fn calculate_raw_position_ms(&self) -> f64 {
        match self.state {
            PlayerState::Stopped | PlayerState::Paused => self.base_position_ms,
            PlayerState::Playing => {
                let now = self.clock.now();
                let elapsed_duration = now.saturating_sub(self.play_start_time);
                let elapsed_ms = elapsed_duration.as_secs_f64() * 1000.0;
                let calculated = self.base_position_ms + elapsed_ms;
                calculated.clamp(0.0, self.duration_ms)
            }
        }
    }
}

impl<C: Clock> PlaybackStateMachine for StateMachine<C> {
    fn load(&mut self, duration_ms: f64) {
        self.duration_ms = duration_ms.max(0.0);
        self.base_position_ms = 0.0;
        self.state = PlayerState::Stopped;
        self.play_start_time = Duration::ZERO;
    }

    fn play(&mut self) {
        if self.duration_ms <= 0.0 {
            return;
        }

        if self.state == PlayerState::Playing {
            // Already playing
            return;
        }

        // If at or past duration, restart playback from beginning
        if self.base_position_ms >= self.duration_ms {
            self.base_position_ms = 0.0;
        }

        self.play_start_time = self.clock.now();
        self.state = PlayerState::Playing;
    }

    fn pause(&mut self) {
        if self.state == PlayerState::Playing {
            self.base_position_ms = self.calculate_raw_position_ms();
            self.state = PlayerState::Paused;
        }
    }

    fn stop(&mut self) {
        self.state = PlayerState::Stopped;
        self.base_position_ms = 0.0;
        self.play_start_time = Duration::ZERO;
    }

    fn seek(&mut self, position_ms: f64) {
        let clamped = position_ms.clamp(0.0, self.duration_ms);
        self.base_position_ms = clamped;
        if self.state == PlayerState::Playing {
            self.play_start_time = self.clock.now();
        }
    }

    fn state(&self) -> PlayerState {
        if self.state == PlayerState::Playing
            && self.calculate_raw_position_ms() >= self.duration_ms
            && self.duration_ms > 0.0
        {
            return PlayerState::Stopped;
        }
        self.state
    }

    fn position_ms(&self) -> f64 {
        self.calculate_raw_position_ms()
    }

    fn duration_ms(&self) -> f64 {
        self.duration_ms
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::FakeClock;

    #[test]
    fn test_initial_state_is_stopped() {
        let clock = FakeClock::new();
        let sm = StateMachine::new(clock);

        assert_eq!(sm.state(), PlayerState::Stopped);
        assert_eq!(sm.position_ms(), 0.0);
        assert_eq!(sm.duration_ms(), 0.0);
    }

    #[test]
    fn test_state_transitions() {
        let clock = FakeClock::new();
        let mut sm = StateMachine::new(clock);

        sm.load(60_000.0);
        assert_eq!(sm.state(), PlayerState::Stopped);
        assert_eq!(sm.duration_ms(), 60_000.0);
        assert_eq!(sm.position_ms(), 0.0);

        // Stopped -> Playing
        sm.play();
        assert_eq!(sm.state(), PlayerState::Playing);

        // Playing -> Paused
        sm.clock().advance_ms(5_000.0);
        assert_eq!(sm.position_ms(), 5_000.0);
        sm.pause();
        assert_eq!(sm.state(), PlayerState::Paused);
        assert_eq!(sm.position_ms(), 5_000.0);

        // Paused -> Playing
        sm.play();
        assert_eq!(sm.state(), PlayerState::Playing);
        sm.clock().advance_ms(2_000.0);
        assert_eq!(sm.position_ms(), 7_000.0);

        // Playing -> Stopped
        sm.stop();
        assert_eq!(sm.state(), PlayerState::Stopped);
        assert_eq!(sm.position_ms(), 0.0);

        // Stopped -> Playing -> Auto-stop at duration
        sm.play();
        assert_eq!(sm.state(), PlayerState::Playing);
        sm.clock().advance_ms(65_000.0);
        assert_eq!(sm.state(), PlayerState::Stopped);
        assert_eq!(sm.position_ms(), 60_000.0);
    }

    #[test]
    fn test_seek_clamping() {
        let clock = FakeClock::new();
        let mut sm = StateMachine::new(clock);

        sm.load(100_000.0);

        // Clamp negative seek to 0.0
        sm.seek(-500.0);
        assert_eq!(sm.position_ms(), 0.0);

        // Valid seek
        sm.seek(42_000.0);
        assert_eq!(sm.position_ms(), 42_000.0);

        // Clamp beyond duration to duration_ms
        sm.seek(150_000.0);
        assert_eq!(sm.position_ms(), 100_000.0);

        // Seeking while playing preserves playing state and clamps correctly
        sm.play();
        assert_eq!(sm.state(), PlayerState::Playing);
        sm.seek(10_000.0);
        assert_eq!(sm.position_ms(), 10_000.0);
        sm.clock().advance_ms(1_500.0);
        assert_eq!(sm.position_ms(), 11_500.0);

        // Seeking beyond duration while playing clamps to duration and transitions to Stopped
        sm.seek(200_000.0);
        assert_eq!(sm.position_ms(), 100_000.0);
        assert_eq!(sm.state(), PlayerState::Stopped);
    }

    #[test]
    fn test_position_after_pause_and_resume() {
        let clock = FakeClock::new();
        let mut sm = StateMachine::new(clock);

        sm.load(60_000.0);

        // Play for 3.5 seconds
        sm.play();
        sm.clock().advance_ms(3_500.0);
        assert_eq!(sm.position_ms(), 3_500.0);

        // Pause at 3.5 seconds
        sm.pause();
        assert_eq!(sm.state(), PlayerState::Paused);
        assert_eq!(sm.position_ms(), 3_500.0);

        // Advance clock by 20 seconds while paused: position MUST NOT advance
        sm.clock().advance_ms(20_000.0);
        assert_eq!(sm.state(), PlayerState::Paused);
        assert_eq!(sm.position_ms(), 3_500.0);

        // Resume: position should start from 3.5 seconds
        sm.play();
        assert_eq!(sm.state(), PlayerState::Playing);
        assert_eq!(sm.position_ms(), 3_500.0);

        // Advance 1.5 seconds: position should be 5.0 seconds
        sm.clock().advance_ms(1_500.0);
        assert_eq!(sm.position_ms(), 5_000.0);

        // Seek to 30s while paused and verify resume
        sm.pause();
        sm.seek(30_000.0);
        assert_eq!(sm.position_ms(), 30_000.0);
        sm.clock().advance_ms(10_000.0);
        assert_eq!(sm.position_ms(), 30_000.0);

        sm.play();
        sm.clock().advance_ms(2_000.0);
        assert_eq!(sm.position_ms(), 32_000.0);
    }
}
