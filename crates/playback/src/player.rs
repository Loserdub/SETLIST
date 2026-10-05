//! Audio player integrating rodio Symphonia decoder with the timing state machine and click generator.

use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use core_types::BeatGrid;
use rodio::{OutputStream, OutputStreamHandle, Sink, Source};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::click::ClickTrackSource;
use crate::clock::SystemClock;
use crate::state_machine::{PlaybackStateMachine, PlayerState, StateMachine};

/// Error types emitted during playback initialization, decoding, and controls.
#[derive(Debug, Error)]
pub enum PlaybackError {
    /// Attempted playback control without a loaded track.
    #[error("no track loaded")]
    NoTrackLoaded,
    /// Specified audio file was not found on disk.
    #[error("audio file not found: {0}")]
    FileNotFound(String),
    /// Standard I/O failure when reading audio file.
    #[error("I/O error: {0}")]
    IoError(#[from] std::io::Error),
    /// Audio decoding failure from rodio / symphonia.
    #[error("audio decode error: {0}")]
    DecodeError(String),
    /// Audio output device failure.
    #[error("audio output device error: {0}")]
    DeviceError(String),
    /// Audio seek operation failed.
    #[error("seek error: {0}")]
    SeekError(String),
}

/// Result returned from [`AudioPlayer::load`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybackLoadResult {
    /// Duration of the loaded track in milliseconds.
    #[serde(rename = "duration_ms", alias = "durationMs")]
    pub duration_ms: f64,
}

/// Result returned from [`AudioPlayer::state`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybackStateResult {
    /// Current player state (Stopped, Playing, Paused).
    pub state: PlayerState,
    /// Current playback position in milliseconds.
    #[serde(rename = "position_ms", alias = "positionMs")]
    pub position_ms: f64,
    /// Current playback speed multiplier.
    #[serde(default = "default_speed")]
    pub speed: f64,
    /// Current playback master volume multiplier.
    #[serde(default = "default_volume")]
    pub volume: f64,
}

fn default_speed() -> f64 {
    1.0
}

fn default_volume() -> f64 {
    1.0
}

/// IPC payload emitted over `\"playback-position\"` event channel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybackPositionPayload {
    /// Current position in milliseconds.
    #[serde(rename = "position_ms", alias = "positionMs")]
    pub position_ms: f64,
    /// Total duration in milliseconds.
    #[serde(rename = "duration_ms", alias = "durationMs")]
    pub duration_ms: f64,
    /// Current player state.
    pub state: PlayerState,
    /// Current playback speed multiplier.
    #[serde(default = "default_speed")]
    pub speed: f64,
    /// Current playback master volume multiplier.
    #[serde(default = "default_volume")]
    pub volume: f64,
}

/// Real-time audio player instance managing a single active track.
pub struct AudioPlayer {
    state_machine: Mutex<StateMachine<SystemClock>>,
    sink: Mutex<Option<Sink>>,
    stream_handle: Mutex<Option<OutputStreamHandle>>,
    _stream_guard: Mutex<Option<std::sync::mpsc::Sender<()>>>,
    current_path: Mutex<Option<String>>,
    beat_grid: Mutex<Option<BeatGrid>>,
    click_enabled: Arc<AtomicBool>,
    speed: Mutex<f32>,
    volume: Mutex<f32>,
}

impl Default for AudioPlayer {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioPlayer {
    /// Creates a new audio player, attempting to initialize the system default audio output.
    ///
    /// If no audio output device is present (e.g. headless CI environments), the player
    /// logs a diagnostic warning and continues functioning in virtual state-machine mode.
    #[must_use]
    pub fn new() -> Self {
        let (tx, rx) = std::sync::mpsc::channel();
        let (stop_tx, stop_rx) = std::sync::mpsc::channel();

        let _ = std::thread::Builder::new()
            .name("setlist-audio-stream".to_string())
            .spawn(move || match OutputStream::try_default() {
                Ok((stream, handle)) => {
                    log::info!("Default audio output stream initialized successfully");
                    let _ = tx.send(Some(handle));
                    let _ = stop_rx.recv();
                    drop(stream);
                }
                Err(e) => {
                    log::warn!("Audio output device unavailable ({e}); running in simulated mode");
                    let _ = tx.send(None);
                }
            });

        let stream_handle = rx.recv().ok().flatten();

        Self {
            state_machine: Mutex::new(StateMachine::new(SystemClock::new())),
            sink: Mutex::new(None),
            stream_handle: Mutex::new(stream_handle),
            _stream_guard: Mutex::new(Some(stop_tx)),
            current_path: Mutex::new(None),
            beat_grid: Mutex::new(None),
            click_enabled: Arc::new(AtomicBool::new(false)),
            speed: Mutex::new(1.0),
            volume: Mutex::new(1.0),
        }
    }

    /// Loads an audio file from `path` with known `duration_ms` and optional beat grid.
    ///
    /// The player is immediately reset to [`PlayerState::Stopped`] at position `0.0`.
    ///
    /// # Errors
    /// Returns [`PlaybackError::FileNotFound`] if the audio file does not exist on disk.
    pub fn load(
        &self,
        path: &str,
        duration_ms: f64,
        beat_grid: Option<BeatGrid>,
    ) -> Result<PlaybackLoadResult, PlaybackError> {
        let path_obj = Path::new(path);
        if !path_obj.exists() {
            return Err(PlaybackError::FileNotFound(path.to_string()));
        }

        // Stop any active playback
        if let Ok(mut sink_guard) = self.sink.lock() {
            if let Some(sink) = sink_guard.take() {
                sink.stop();
            }
        }

        if let Ok(mut sm) = self.state_machine.lock() {
            sm.load(duration_ms);
        }

        if let Ok(mut path_guard) = self.current_path.lock() {
            *path_guard = Some(path.to_string());
        }

        if let Ok(mut grid_guard) = self.beat_grid.lock() {
            *grid_guard = beat_grid;
        }

        Ok(PlaybackLoadResult { duration_ms })
    }

    /// Starts or resumes playback of the currently loaded track.
    ///
    /// # Errors
    /// Returns error if no track is loaded, the file cannot be opened or decoded,
    /// or audio output fails.
    pub fn play(&self) -> Result<(), PlaybackError> {
        let path = {
            let path_guard = self
                .current_path
                .lock()
                .map_err(|e| PlaybackError::SeekError(format!("current_path mutex error: {e}")))?;
            path_guard.clone().ok_or(PlaybackError::NoTrackLoaded)?
        };

        let current_pos_ms = {
            let mut sm = self
                .state_machine
                .lock()
                .map_err(|e| PlaybackError::SeekError(format!("state_machine mutex error: {e}")))?;
            sm.play();
            sm.position_ms()
        };

        let mut sink_guard = self
            .sink
            .lock()
            .map_err(|e| PlaybackError::SeekError(format!("sink mutex error: {e}")))?;

        let current_speed = self.speed();
        let current_volume = self.volume();

        // If sink exists, is paused, and still valid, unpause it
        if let Some(ref sink) = *sink_guard {
            if sink.is_paused() && !sink.empty() {
                sink.set_speed(current_speed);
                sink.set_volume(current_volume);
                sink.play();
                return Ok(());
            }
        }

        // Recreate or acquire output stream handle if missing
        let mut handle_guard = self
            .stream_handle
            .lock()
            .map_err(|e| PlaybackError::SeekError(format!("stream_handle mutex error: {e}")))?;

        if handle_guard.is_none() {
            log::info!(
                "Audio output stream handle is None, attempting on-demand device initialization..."
            );
            let (tx, rx) = std::sync::mpsc::channel();
            let (stop_tx, stop_rx) = std::sync::mpsc::channel();

            let spawned = std::thread::Builder::new()
                .name("setlist-audio-stream".to_string())
                .spawn(move || match OutputStream::try_default() {
                    Ok((stream, handle)) => {
                        log::info!("Default audio output stream re-initialized successfully");
                        let _ = tx.send(Some(handle));
                        let _ = stop_rx.recv();
                        drop(stream);
                    }
                    Err(e) => {
                        log::warn!("Audio output device still unavailable on-demand: {e}");
                        let _ = tx.send(None);
                    }
                });

            if spawned.is_ok() {
                if let Ok(Some(handle)) = rx.recv() {
                    if let Ok(mut guard) = self._stream_guard.lock() {
                        *guard = Some(stop_tx);
                    }
                    *handle_guard = Some(handle);
                }
            }
        }

        let handle = handle_guard.as_ref().ok_or_else(|| {
            PlaybackError::DeviceError("No active audio output device found on system".to_string())
        })?;

        let file = File::open(&path)?;
        let reader = BufReader::new(file);
        let decoder =
            rodio::Decoder::new(reader).map_err(|e| PlaybackError::DecodeError(e.to_string()))?;

        let sample_rate = decoder.sample_rate();
        let channels = decoder.channels();

        let new_sink =
            Sink::try_new(handle).map_err(|e| PlaybackError::DeviceError(e.to_string()))?;
        new_sink.set_volume(current_volume);
        new_sink.set_speed(current_speed);

        let beat_grid = self.beat_grid.lock().ok().and_then(|g| g.clone());

        if let Some(grid) = beat_grid {
            let duration_ms = self.duration_ms();
            let total_frames = (duration_ms / 1000.0 * f64::from(sample_rate)).round() as usize;

            let click_source = ClickTrackSource::new(
                grid.beats_ms,
                grid.downbeat_flags,
                sample_rate,
                channels,
                total_frames,
                self.click_enabled.clone(),
            );

            let mixed = decoder.mix(click_source);
            if current_pos_ms > 0.0 {
                let seek_dur = Duration::from_secs_f64(current_pos_ms / 1000.0);
                new_sink.append(mixed.skip_duration(seek_dur));
            } else {
                new_sink.append(mixed);
            }
        } else if current_pos_ms > 0.0 {
            let seek_dur = Duration::from_secs_f64(current_pos_ms / 1000.0);
            new_sink.append(decoder.skip_duration(seek_dur));
        } else {
            new_sink.append(decoder);
        }

        new_sink.play();
        *sink_guard = Some(new_sink);

        Ok(())
    }

    /// Sets the playback speed multiplier, clamped to `[0.1, 4.0]`.
    ///
    /// # Errors
    /// Returns error if updating state machine fails.
    pub fn set_speed(&self, speed: f32) -> Result<(), PlaybackError> {
        let clamped = speed.clamp(0.1, 4.0);
        if let Ok(mut speed_guard) = self.speed.lock() {
            *speed_guard = clamped;
        }
        if let Ok(mut sm) = self.state_machine.lock() {
            sm.set_speed(f64::from(clamped));
        }
        if let Ok(sink_guard) = self.sink.lock() {
            if let Some(ref sink) = *sink_guard {
                sink.set_speed(clamped);
            }
        }
        Ok(())
    }

    /// Returns the current playback speed multiplier.
    #[must_use]
    pub fn speed(&self) -> f32 {
        self.speed.lock().map(|s| *s).unwrap_or(1.0)
    }

    /// Sets the master playback volume multiplier, clamped to `[0.0, 2.0]`.
    pub fn set_volume(&self, volume: f32) {
        let clamped = volume.clamp(0.0, 2.0);
        if let Ok(mut volume_guard) = self.volume.lock() {
            *volume_guard = clamped;
        }
        if let Ok(sink_guard) = self.sink.lock() {
            if let Some(ref sink) = *sink_guard {
                sink.set_volume(clamped);
            }
        }
    }

    /// Returns the current master playback volume multiplier.
    #[must_use]
    pub fn volume(&self) -> f32 {
        self.volume.lock().map(|v| *v).unwrap_or(1.0)
    }

    /// Pauses playback, retaining the current position.
    ///
    /// # Errors
    /// Returns error if state machine or audio sink fails to pause.
    pub fn pause(&self) -> Result<(), PlaybackError> {
        if let Ok(mut sm) = self.state_machine.lock() {
            sm.pause();
        }

        if let Ok(sink_guard) = self.sink.lock() {
            if let Some(ref sink) = *sink_guard {
                sink.pause();
            }
        }

        Ok(())
    }

    /// Stops playback and resets position to `0.0`.
    ///
    /// # Errors
    /// Returns error if stopping audio output fails.
    pub fn stop(&self) -> Result<(), PlaybackError> {
        if let Ok(mut sm) = self.state_machine.lock() {
            sm.stop();
        }

        if let Ok(mut sink_guard) = self.sink.lock() {
            if let Some(sink) = sink_guard.take() {
                sink.stop();
            }
        }

        Ok(())
    }

    /// Seeks to a position in milliseconds, clamped to `[0.0, duration_ms]`.
    ///
    /// If currently playing, playback resumes seamlessly from the new position.
    ///
    /// # Errors
    /// Returns error if seeking fails.
    pub fn seek(&self, position_ms: f64) -> Result<(), PlaybackError> {
        let (clamped_ms, was_playing) = {
            let mut sm = self
                .state_machine
                .lock()
                .map_err(|e| PlaybackError::SeekError(format!("state_machine mutex error: {e}")))?;
            sm.seek(position_ms);
            (sm.position_ms(), sm.state() == PlayerState::Playing)
        };

        let mut sink_seek_succeeded = false;
        if let Ok(sink_guard) = self.sink.lock() {
            if let Some(ref sink) = *sink_guard {
                let target_dur = Duration::from_secs_f64(clamped_ms / 1000.0);
                if sink.try_seek(target_dur).is_ok() {
                    sink_seek_succeeded = true;
                }
            }
        }

        // If try_seek on active sink wasn't supported/failed:
        // Clear active sink so next playback starts from the seeked position.
        // DO NOT call self.stop() because sm.stop() resets base_position_ms to 0.0!
        if !sink_seek_succeeded {
            if let Ok(mut sink_guard) = self.sink.lock() {
                if let Some(sink) = sink_guard.take() {
                    sink.stop();
                }
            }
            if was_playing {
                self.play()?;
            }
        }

        Ok(())
    }

    /// Returns the current playback status and position.
    #[must_use]
    pub fn state(&self) -> PlaybackStateResult {
        let mut auto_stopped = false;
        let res = if let Ok(sm) = self.state_machine.lock() {
            let state = sm.state();
            let position_ms = sm.position_ms();
            if state == PlayerState::Stopped
                && sm.duration_ms() > 0.0
                && position_ms >= sm.duration_ms()
            {
                auto_stopped = true;
            }
            PlaybackStateResult {
                state,
                position_ms,
                speed: f64::from(self.speed()),
                volume: f64::from(self.volume()),
            }
        } else {
            PlaybackStateResult {
                state: PlayerState::Stopped,
                position_ms: 0.0,
                speed: f64::from(self.speed()),
                volume: f64::from(self.volume()),
            }
        };

        // If reached end of track, stop sink
        if auto_stopped {
            if let Ok(mut sink_guard) = self.sink.lock() {
                if let Some(sink) = sink_guard.take() {
                    sink.stop();
                }
            }
        }

        res
    }

    /// Enables or disables the beat grid click track.
    pub fn set_click(&self, enabled: bool) {
        self.click_enabled.store(enabled, Ordering::SeqCst);
    }

    /// Returns whether the beat grid click track is currently enabled.
    #[must_use]
    pub fn is_click_enabled(&self) -> bool {
        self.click_enabled.load(Ordering::SeqCst)
    }

    /// Returns total track duration in milliseconds.
    #[must_use]
    pub fn duration_ms(&self) -> f64 {
        self.state_machine
            .lock()
            .map(|sm| sm.duration_ms())
            .unwrap_or(0.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_player_speed_setting_and_clamping() {
        let player = AudioPlayer::new();
        assert_eq!(player.speed(), 1.0);

        player.set_speed(1.5).unwrap();
        assert_eq!(player.speed(), 1.5);
        assert_eq!(player.state().speed, 1.5);

        // Clamping to maximum 4.0
        player.set_speed(10.0).unwrap();
        assert_eq!(player.speed(), 4.0);

        // Clamping to minimum 0.1
        player.set_speed(0.01).unwrap();
        assert_eq!(player.speed(), 0.1);

        // Reset to normal
        player.set_speed(1.0).unwrap();
        assert_eq!(player.speed(), 1.0);
    }

    #[test]
    fn test_player_volume_setting_and_clamping() {
        let player = AudioPlayer::new();
        assert_eq!(player.volume(), 1.0);
        assert_eq!(player.state().volume, 1.0);

        player.set_volume(0.5);
        assert_eq!(player.volume(), 0.5);
        assert_eq!(player.state().volume, 0.5);

        // Clamping to max 2.0
        player.set_volume(5.0);
        assert_eq!(player.volume(), 2.0);

        // Clamping to min 0.0
        player.set_volume(-1.0);
        assert_eq!(player.volume(), 0.0);
    }

    #[test]
    fn test_seek_retains_position_without_resetting_to_zero() {
        let player = AudioPlayer::new();
        // Load virtual 180s track
        player.state_machine.lock().unwrap().load(180_000.0);

        // Seeking to 45,000 ms should clamp and retain 45,000 ms
        player.seek(45_000.0).unwrap();
        assert_eq!(player.state().position_ms, 45_000.0);

        // Seeking to 90,000 ms should retain 90,000 ms
        player.seek(90_000.0).unwrap();
        assert_eq!(player.state().position_ms, 90_000.0);
    }
}
