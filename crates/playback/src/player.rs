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

/// Describes which audio source processing chain to construct for playback.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceChainType {
    /// Pure decoder without click mixing or seeking skip.
    Plain,
    /// Pure decoder with seeking duration skip applied.
    PlainSeek,
    /// Decoder mixed with synthetic beat click generator.
    Mixed,
    /// Decoder mixed with synthetic beat click generator, with seek duration skip applied.
    MixedSeek,
}

/// Determines the audio source chain configuration based on whether click is active and seek offset.
///
/// Click is only active when both `click_enabled` is true and a valid beat grid is present.
#[must_use]
pub fn determine_source_chain(
    click_enabled: bool,
    has_beat_grid: bool,
    seek_ms: f64,
) -> SourceChainType {
    let click_active = click_enabled && has_beat_grid;
    let has_seek = seek_ms > 0.0;
    match (click_active, has_seek) {
        (false, false) => SourceChainType::Plain,
        (false, true) => SourceChainType::PlainSeek,
        (true, false) => SourceChainType::Mixed,
        (true, true) => SourceChainType::MixedSeek,
    }
}

/// Acquires a lock on a Mutex in a poison-safe manner, recovering the inner data if poisoned.
fn lock_mutex<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
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

    /// Attempts to reinitialize or re-acquire the system default audio output stream.
    ///
    /// Allows recovery when an audio device is plugged in, unplugged, or switched without
    /// restarting the application.
    pub fn reinitialize_device(&self) -> Result<(), PlaybackError> {
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
                    log::warn!("Audio output device unavailable on re-init: {e}");
                    let _ = tx.send(None);
                }
            });

        if spawned.is_err() {
            return Err(PlaybackError::DeviceError(
                "Failed to spawn audio stream thread".to_string(),
            ));
        }

        let handle = rx.recv().ok().flatten().ok_or_else(|| {
            PlaybackError::DeviceError("No active audio output device found on system".to_string())
        })?;

        {
            let mut guard = lock_mutex(&self._stream_guard);
            *guard = Some(stop_tx);
        }
        {
            let mut handle_guard = lock_mutex(&self.stream_handle);
            *handle_guard = Some(handle);
        }

        Ok(())
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

        // Stop any active playback and release sink
        {
            let mut sink_guard = lock_mutex(&self.sink);
            if let Some(sink) = sink_guard.take() {
                sink.stop();
            }
        }

        {
            let mut sm = lock_mutex(&self.state_machine);
            sm.load(duration_ms);
        }

        {
            let mut path_guard = lock_mutex(&self.current_path);
            *path_guard = Some(path.to_string());
        }

        {
            let mut grid_guard = lock_mutex(&self.beat_grid);
            *grid_guard = beat_grid;
        }

        Ok(PlaybackLoadResult { duration_ms })
    }

    /// Internal helper that initializes and starts an audio sink from the specified position.
    fn start_sink_at_pos(&self, current_pos_ms: f64) -> Result<(), PlaybackError> {
        let path = {
            let path_guard = lock_mutex(&self.current_path);
            path_guard.clone().ok_or(PlaybackError::NoTrackLoaded)?
        };

        let current_speed = self.speed();
        let current_volume = self.volume();

        // Recreate or acquire output stream handle if missing
        let mut handle_opt = {
            let handle_guard = lock_mutex(&self.stream_handle);
            handle_guard.clone()
        };

        if handle_opt.is_none() {
            let _ = self.reinitialize_device();
            let handle_guard = lock_mutex(&self.stream_handle);
            handle_opt = handle_guard.clone();
        }

        let handle = handle_opt.ok_or_else(|| {
            PlaybackError::DeviceError("No active audio output device found on system".to_string())
        })?;

        let file = File::open(&path)?;
        let reader = BufReader::new(file);
        let decoder =
            rodio::Decoder::new(reader).map_err(|e| PlaybackError::DecodeError(e.to_string()))?;

        let sample_rate = decoder.sample_rate();
        let channels = decoder.channels();

        let new_sink = match Sink::try_new(&handle) {
            Ok(s) => s,
            Err(e) => {
                log::warn!("Sink creation failed ({e}); attempting device re-initialization...");
                self.reinitialize_device()?;
                let handle_guard = lock_mutex(&self.stream_handle);
                let refreshed_handle = handle_guard.as_ref().ok_or_else(|| {
                    PlaybackError::DeviceError("Failed to reinitialize audio device".to_string())
                })?;
                Sink::try_new(refreshed_handle)
                    .map_err(|err| PlaybackError::DeviceError(err.to_string()))?
            }
        };

        new_sink.set_volume(current_volume);
        new_sink.set_speed(current_speed);

        let is_click = self.is_click_enabled();
        let beat_grid = lock_mutex(&self.beat_grid).clone();
        let chain_type = determine_source_chain(is_click, beat_grid.is_some(), current_pos_ms);

        match chain_type {
            SourceChainType::Plain => {
                new_sink.append(decoder);
            }
            SourceChainType::PlainSeek => {
                let seek_dur = Duration::from_secs_f64(current_pos_ms / 1000.0);
                new_sink.append(decoder.skip_duration(seek_dur));
            }
            SourceChainType::Mixed => {
                let grid = beat_grid.ok_or_else(|| {
                    PlaybackError::DecodeError("Missing beat grid for click track".to_string())
                })?;
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

                new_sink.append(decoder.mix(click_source));
            }
            SourceChainType::MixedSeek => {
                let grid = beat_grid.ok_or_else(|| {
                    PlaybackError::DecodeError("Missing beat grid for click track".to_string())
                })?;
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
                let seek_dur = Duration::from_secs_f64(current_pos_ms / 1000.0);
                new_sink.append(mixed.skip_duration(seek_dur));
            }
        }

        new_sink.play();

        let mut sink_guard = lock_mutex(&self.sink);
        if let Some(old_sink) = sink_guard.take() {
            old_sink.stop();
        }
        *sink_guard = Some(new_sink);

        Ok(())
    }

    /// Starts or resumes playback of the currently loaded track.
    ///
    /// # Errors
    /// Returns error if no track is loaded, the file cannot be opened or decoded,
    /// or audio output fails.
    pub fn play(&self) -> Result<(), PlaybackError> {
        {
            let path_guard = lock_mutex(&self.current_path);
            if path_guard.is_none() {
                return Err(PlaybackError::NoTrackLoaded);
            }
        }

        let current_pos_ms = {
            let mut sm = lock_mutex(&self.state_machine);
            sm.play();
            sm.position_ms()
        };

        // If sink exists, is paused, and still valid, unpause it
        {
            let sink_guard = lock_mutex(&self.sink);
            if let Some(ref sink) = *sink_guard {
                if sink.is_paused() && !sink.empty() {
                    sink.set_speed(self.speed());
                    sink.set_volume(self.volume());
                    sink.play();
                    return Ok(());
                }
            }
        }

        self.start_sink_at_pos(current_pos_ms)
    }

    /// Sets the playback speed multiplier, clamped to `[0.1, 4.0]`.
    ///
    /// # Errors
    /// Returns error if updating state machine fails.
    pub fn set_speed(&self, speed: f32) -> Result<(), PlaybackError> {
        let clamped = speed.clamp(0.1, 4.0);
        {
            let mut speed_guard = lock_mutex(&self.speed);
            *speed_guard = clamped;
        }
        {
            let mut sm = lock_mutex(&self.state_machine);
            sm.set_speed(f64::from(clamped));
        }
        {
            let sink_guard = lock_mutex(&self.sink);
            if let Some(ref sink) = *sink_guard {
                sink.set_speed(clamped);
            }
        }
        Ok(())
    }

    /// Returns the current playback speed multiplier.
    #[must_use]
    pub fn speed(&self) -> f32 {
        *lock_mutex(&self.speed)
    }

    /// Sets the master playback volume multiplier, clamped to `[0.0, 2.0]`.
    pub fn set_volume(&self, volume: f32) {
        let clamped = volume.clamp(0.0, 2.0);
        {
            let mut volume_guard = lock_mutex(&self.volume);
            *volume_guard = clamped;
        }
        {
            let sink_guard = lock_mutex(&self.sink);
            if let Some(ref sink) = *sink_guard {
                sink.set_volume(clamped);
            }
        }
    }

    /// Returns the current master playback volume multiplier.
    #[must_use]
    pub fn volume(&self) -> f32 {
        *lock_mutex(&self.volume)
    }

    /// Pauses playback, retaining the current position.
    ///
    /// # Errors
    /// Returns error if state machine or audio sink fails to pause.
    pub fn pause(&self) -> Result<(), PlaybackError> {
        {
            let mut sm = lock_mutex(&self.state_machine);
            sm.pause();
        }

        {
            let sink_guard = lock_mutex(&self.sink);
            if let Some(ref sink) = *sink_guard {
                sink.pause();
            }
        }

        Ok(())
    }

    /// Stops playback, resets position to `0.0`, and drops the sink to release file handles.
    ///
    /// # Errors
    /// Returns error if stopping audio output fails.
    pub fn stop(&self) -> Result<(), PlaybackError> {
        {
            let mut sm = lock_mutex(&self.state_machine);
            sm.stop();
        }

        {
            let mut sink_guard = lock_mutex(&self.sink);
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
            let mut sm = lock_mutex(&self.state_machine);
            sm.seek(position_ms);
            (sm.position_ms(), sm.state() == PlayerState::Playing)
        };

        let mut sink_seek_succeeded = false;
        {
            let sink_guard = lock_mutex(&self.sink);
            if let Some(ref sink) = *sink_guard {
                let target_dur = Duration::from_secs_f64(clamped_ms / 1000.0);
                if sink.try_seek(target_dur).is_ok() {
                    sink_seek_succeeded = true;
                }
            }
        }

        if !sink_seek_succeeded {
            {
                let mut sink_guard = lock_mutex(&self.sink);
                if let Some(sink) = sink_guard.take() {
                    sink.stop();
                }
            }
            if was_playing {
                self.start_sink_at_pos(clamped_ms)?;
            }
        }

        Ok(())
    }

    /// Returns the current playback status and position.
    #[must_use]
    pub fn state(&self) -> PlaybackStateResult {
        let mut auto_stopped = false;
        let res = {
            let sm = lock_mutex(&self.state_machine);
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
        };

        // If reached end of track, stop sink
        if auto_stopped {
            let mut sink_guard = lock_mutex(&self.sink);
            if let Some(sink) = sink_guard.take() {
                sink.stop();
            }
        }

        res
    }

    /// Enables or disables the beat grid click track.
    ///
    /// When toggled during active playback, the sink is rebuilt at the current position
    /// seamlessly (< 50ms) to ensure click is instantly introduced or removed.
    pub fn set_click(&self, enabled: bool) {
        let prev = self.click_enabled.swap(enabled, Ordering::SeqCst);
        if prev != enabled {
            let is_playing = lock_mutex(&self.state_machine).state() == PlayerState::Playing;
            if is_playing {
                let current_pos_ms = lock_mutex(&self.state_machine).position_ms();
                let _ = self.start_sink_at_pos(current_pos_ms);
            }
        }
    }

    /// Returns whether the beat grid click track is currently enabled.
    #[must_use]
    pub fn is_click_enabled(&self) -> bool {
        self.click_enabled.load(Ordering::SeqCst)
    }

    /// Returns total track duration in milliseconds.
    #[must_use]
    pub fn duration_ms(&self) -> f64 {
        lock_mutex(&self.state_machine).duration_ms()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_determine_source_chain_combinations() {
        // Click disabled: should always be Plain or PlainSeek
        assert_eq!(
            determine_source_chain(false, true, 0.0),
            SourceChainType::Plain
        );
        assert_eq!(
            determine_source_chain(false, true, 1250.0),
            SourceChainType::PlainSeek
        );
        assert_eq!(
            determine_source_chain(false, false, 0.0),
            SourceChainType::Plain
        );
        assert_eq!(
            determine_source_chain(false, false, 500.0),
            SourceChainType::PlainSeek
        );

        // Click enabled, but no beat grid: cannot mix, so Plain or PlainSeek
        assert_eq!(
            determine_source_chain(true, false, 0.0),
            SourceChainType::Plain
        );
        assert_eq!(
            determine_source_chain(true, false, 500.0),
            SourceChainType::PlainSeek
        );

        // Click enabled with beat grid: Mixed or MixedSeek
        assert_eq!(
            determine_source_chain(true, true, 0.0),
            SourceChainType::Mixed
        );
        assert_eq!(
            determine_source_chain(true, true, 2500.0),
            SourceChainType::MixedSeek
        );
    }

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
        // Load virtual 180s track with poison-safe mutex access
        lock_mutex(&player.state_machine).load(180_000.0);

        // Seeking to 45,000 ms should clamp and retain 45,000 ms
        player.seek(45_000.0).unwrap();
        assert_eq!(player.state().position_ms, 45_000.0);

        // Seeking to 90,000 ms should retain 90,000 ms
        player.seek(90_000.0).unwrap();
        assert_eq!(player.state().position_ms, 90_000.0);
    }

    #[test]
    fn test_stop_drops_sink_and_resets_position() {
        let player = AudioPlayer::new();
        lock_mutex(&player.state_machine).load(120_000.0);
        player.seek(30_000.0).unwrap();
        assert_eq!(player.state().position_ms, 30_000.0);

        player.stop().unwrap();
        assert_eq!(player.state().position_ms, 0.0);
        assert_eq!(player.state().state, PlayerState::Stopped);
        assert!(lock_mutex(&player.sink).is_none());
    }

    #[test]
    fn test_poison_safe_lock_recovery() {
        let m = Mutex::new(42);
        // Simulate a poisoned mutex
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = m.lock().unwrap();
            panic!("Simulated panic inside critical section");
        }));
        assert!(m.is_poisoned());

        // lock_mutex must recover without panicking
        let guard = lock_mutex(&m);
        assert_eq!(*guard, 42);
    }

    #[test]
    fn test_mono_and_sample_rate_resampling_clean_decode() {
        let temp_dir = std::env::temp_dir();
        let mono_48k_path = temp_dir.join("test_mono_48k.wav");
        let stereo_96k_path = temp_dir.join("test_stereo_96k.wav");

        let mono_spec = hound::WavSpec {
            channels: 1,
            sample_rate: 48000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut mono_writer = hound::WavWriter::create(&mono_48k_path, mono_spec).unwrap();
        for t in 0..48000 {
            let sample = (t as f32 * 0.1).sin() * 10000.0;
            mono_writer.write_sample(sample as i16).unwrap();
        }
        mono_writer.finalize().unwrap();

        let stereo_spec = hound::WavSpec {
            channels: 2,
            sample_rate: 96000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut stereo_writer = hound::WavWriter::create(&stereo_96k_path, stereo_spec).unwrap();
        for t in 0..96000 {
            let sample = (t as f32 * 0.1).sin() * 10000.0;
            stereo_writer.write_sample(sample as i16).unwrap();
            stereo_writer.write_sample(sample as i16).unwrap();
        }
        stereo_writer.finalize().unwrap();

        let player = AudioPlayer::new();

        // Verify mono 48kHz loads and decodes cleanly
        let res_48k = player.load(mono_48k_path.to_str().unwrap(), 1000.0, None);
        assert!(res_48k.is_ok());
        assert_eq!(player.duration_ms(), 1000.0);

        // Verify stereo 96kHz loads and decodes cleanly
        let res_96k = player.load(stereo_96k_path.to_str().unwrap(), 1000.0, None);
        assert!(res_96k.is_ok());
        assert_eq!(player.duration_ms(), 1000.0);

        // Clean up temp files
        let _ = std::fs::remove_file(mono_48k_path);
        let _ = std::fs::remove_file(stereo_96k_path);
    }

    #[test]
    fn test_accurate_seek_with_audio_fixture() {
        let temp_dir = std::env::temp_dir();
        let fixture_path = temp_dir.join("test_seek_accuracy.wav");

        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 44100,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        // 5 seconds audio
        let mut writer = hound::WavWriter::create(&fixture_path, spec).unwrap();
        for t in 0..(44100 * 5) {
            let sample = (t as f32 * 0.1).sin() * 8000.0;
            writer.write_sample(sample as i16).unwrap();
            writer.write_sample(sample as i16).unwrap();
        }
        writer.finalize().unwrap();

        let player = AudioPlayer::new();
        player
            .load(fixture_path.to_str().unwrap(), 5000.0, None)
            .unwrap();

        player.seek(1500.0).unwrap();
        let pos1 = player.state().position_ms;
        assert!(
            (pos1 - 1500.0).abs() < 1.0,
            "Seek position should be within 1ms, got {pos1}"
        );

        player.seek(3250.0).unwrap();
        let pos2 = player.state().position_ms;
        assert!(
            (pos2 - 3250.0).abs() < 1.0,
            "Seek position should be within 1ms, got {pos2}"
        );

        let _ = std::fs::remove_file(fixture_path);
    }
}
