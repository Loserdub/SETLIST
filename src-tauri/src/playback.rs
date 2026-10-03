//! Tauri command handlers and background event emitter for audio playback.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};

use playback::{
    AudioPlayer, PlaybackLoadResult, PlaybackPositionPayload, PlaybackStateResult, PlayerState,
};
use tauri::{AppHandle, Emitter, State};

use crate::state::AppState;

/// Shared global audio player instance.
static PLAYER: OnceLock<Arc<AudioPlayer>> = OnceLock::new();

/// Flag tracking whether the 50 ms position emitter background thread is currently active.
static TICKER_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Returns the singleton audio player handle.
#[must_use]
pub fn get_player() -> &'static Arc<AudioPlayer> {
    PLAYER.get_or_init(|| Arc::new(AudioPlayer::new()))
}

/// Spawns a background thread emitting `\"playback-position\"` events every 50 ms
/// while playback is active.
fn ensure_ticker_running(app: AppHandle) {
    if TICKER_ACTIVE
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
    {
        let player = Arc::clone(get_player());
        std::thread::spawn(move || {
            while TICKER_ACTIVE.load(Ordering::SeqCst) {
                std::thread::sleep(std::time::Duration::from_millis(50));
                let state_res = player.state();
                let payload = PlaybackPositionPayload {
                    position_ms: state_res.position_ms,
                    duration_ms: player.duration_ms(),
                    state: state_res.state,
                };
                let _ = app.emit("playback-position", payload);

                if state_res.state != PlayerState::Playing {
                    TICKER_ACTIVE.store(false, Ordering::SeqCst);
                    break;
                }
            }
        });
    }
}

/// Core implementation of loading a track into the audio player.
///
/// # Errors
/// Returns error if track does not exist in library database or audio file is missing on disk.
pub fn playback_load_core(state: &AppState, track_id: &str) -> Result<PlaybackLoadResult, String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("database mutex error: {e}"))?;

    let track = library_db::get_track(&conn, track_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Track not found in database: {track_id}"))?;

    let path_obj = Path::new(&track.path);
    if !path_obj.exists() {
        return Err(format!("Audio file not found on disk: {}", track.path));
    }

    let beat_grid = track.analysis.as_ref().map(|a| a.rhythm.grid.clone());
    let player = get_player();
    let res = player
        .load(&track.path, track.duration_ms, beat_grid)
        .map_err(|e| e.to_string())?;

    Ok(res)
}

/// Core implementation of starting or resuming playback.
///
/// # Errors
/// Returns error if audio decoder or device fails.
pub fn playback_play_core() -> Result<(), String> {
    get_player().play().map_err(|e| e.to_string())
}

/// Core implementation of pausing playback.
///
/// # Errors
/// Returns error if pausing fails.
pub fn playback_pause_core() -> Result<(), String> {
    get_player().pause().map_err(|e| e.to_string())
}

/// Core implementation of seeking to a position in milliseconds.
///
/// # Errors
/// Returns error if seeking fails.
pub fn playback_seek_core(position_ms: f64) -> Result<(), String> {
    get_player().seek(position_ms).map_err(|e| e.to_string())
}

/// Core implementation of retrieving the current playback state and position.
#[must_use]
pub fn playback_state_core() -> PlaybackStateResult {
    get_player().state()
}

/// Core implementation of enabling or disabling the beat grid click track.
pub fn playback_set_click_core(enabled: bool) {
    get_player().set_click(enabled);
}

/// Loads a track by ID into the player and prepares it for auditioning.
///
/// Returns `{ duration_ms }` of the loaded track.
///
/// # Errors
/// Returns error text if the track ID does not exist or the audio file cannot be accessed.
#[tauri::command]
pub async fn playback_load(
    app: AppHandle,
    state: State<'_, AppState>,
    track_id: Option<String>,
    #[allow(non_snake_case)] trackId: Option<String>,
) -> Result<PlaybackLoadResult, String> {
    let id = track_id
        .or(trackId)
        .ok_or_else(|| "track_id parameter is required".to_string())?;

    let res = playback_load_core(&state, &id)?;

    // Emit initial position event at 0 ms with Stopped status
    let _ = app.emit(
        "playback-position",
        PlaybackPositionPayload {
            position_ms: 0.0,
            duration_ms: res.duration_ms,
            state: PlayerState::Stopped,
        },
    );

    Ok(res)
}

/// Starts or resumes audio playback and starts emitting 50 ms position updates.
///
/// # Errors
/// Returns error text if playback fails.
#[tauri::command]
pub async fn playback_play(app: AppHandle) -> Result<(), String> {
    playback_play_core()?;
    ensure_ticker_running(app.clone());

    let state_res = get_player().state();
    let _ = app.emit(
        "playback-position",
        PlaybackPositionPayload {
            position_ms: state_res.position_ms,
            duration_ms: get_player().duration_ms(),
            state: state_res.state,
        },
    );

    Ok(())
}

/// Pauses audio playback at the current position.
///
/// # Errors
/// Returns error text if pausing fails.
#[tauri::command]
pub async fn playback_pause(app: AppHandle) -> Result<(), String> {
    playback_pause_core()?;

    let state_res = get_player().state();
    let _ = app.emit(
        "playback-position",
        PlaybackPositionPayload {
            position_ms: state_res.position_ms,
            duration_ms: get_player().duration_ms(),
            state: state_res.state,
        },
    );

    Ok(())
}

/// Seeks playback to the requested position in milliseconds, clamped to `[0.0, duration_ms]`.
///
/// # Errors
/// Returns error text if seeking fails.
#[tauri::command]
pub async fn playback_seek(
    app: AppHandle,
    position_ms: Option<f64>,
    #[allow(non_snake_case)] positionMs: Option<f64>,
) -> Result<(), String> {
    let pos = position_ms
        .or(positionMs)
        .ok_or_else(|| "position_ms parameter is required".to_string())?;

    playback_seek_core(pos)?;

    let state_res = get_player().state();
    let _ = app.emit(
        "playback-position",
        PlaybackPositionPayload {
            position_ms: state_res.position_ms,
            duration_ms: get_player().duration_ms(),
            state: state_res.state,
        },
    );

    Ok(())
}

/// Returns the current playback state and position in milliseconds.
///
/// # Errors
/// Always returns `Ok`.
#[tauri::command]
pub async fn playback_state() -> Result<PlaybackStateResult, String> {
    Ok(playback_state_core())
}

/// Enables or disables the beat grid click track.
///
/// When enabled, short synthetic clicks are mixed on each beat of the track's beat grid.
///
/// # Errors
/// Always returns `Ok`.
#[tauri::command]
pub async fn playback_set_click(enabled: bool) -> Result<(), String> {
    playback_set_click_core(enabled);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_types::{
        BeatGrid, LoudnessInfo, RhythmAnalysis, Track, TrackAnalysis, TrackTags, Waveform3Band,
        WaveformBand,
    };

    fn create_test_wav_file(path: &Path) {
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 44100,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(path, spec).unwrap();
        for t in 0..44100 {
            let sample = ((t as f64 * 440.0 * 2.0 * std::f64::consts::PI / 44100.0).sin()
                * i16::MAX as f64
                * 0.25) as i16;
            writer.write_sample(sample).unwrap();
        }
        writer.finalize().unwrap();
    }

    #[test]
    fn test_playback_controls_lifecycle_with_db_track() {
        let state = AppState::in_memory().expect("in-memory state created");
        let temp_dir = tempfile::tempdir().unwrap();
        let wav_path = temp_dir.path().join("test_song.wav");
        create_test_wav_file(&wav_path);

        let track_id = "test-track-123";
        let track = Track {
            id: track_id.to_string(),
            path: wav_path.to_string_lossy().to_string(),
            hash: "testhash".to_string(),
            tags: TrackTags {
                title: Some("Test Song".to_string()),
                artist: Some("Test Artist".to_string()),
                album: None,
            },
            duration_ms: 1000.0,
            analysis: Some(TrackAnalysis {
                loudness: LoudnessInfo {
                    integrated_lufs: -14.0,
                    loudness_range: 2.0,
                    true_peak: -1.0,
                },
                rhythm: RhythmAnalysis {
                    grid: BeatGrid {
                        first_downbeat_ms: 0.0,
                        bpm: 120.0,
                        beats_ms: vec![0.0, 500.0],
                        downbeat_flags: vec![true, false],
                        steady: true,
                    },
                    bpm_alternates: vec![],
                },
                key: core_types::Key {
                    pitch_class: 0,
                    mode: core_types::Mode::Minor,
                    camelot: core_types::Camelot {
                        number: 8,
                        letter: core_types::CamelotLetter::A,
                    },
                    tuning_cents: 0.0,
                },
                dynamics: core_types::DynamicsAnalysis {
                    frame_rate: 10.0,
                    rms_curve: vec![],
                    low_ratio_curve: vec![],
                    centroid_curve: vec![],
                },
                energy_score: 5,
                energy_curve: core_types::EnergyCurve { per_bar: vec![] },
                segments: vec![],
                cue_points: vec![],
                waveform: Waveform3Band {
                    points_per_sec: 10,
                    low: WaveformBand {
                        peak: vec![],
                        rms: vec![],
                    },
                    mid: WaveformBand {
                        peak: vec![],
                        rms: vec![],
                    },
                    high: WaveformBand {
                        peak: vec![],
                        rms: vec![],
                    },
                },
            }),
            analyzed_at: None,
            analysis_version: None,
        };

        // Persist track in database
        {
            let conn = state.db.lock().unwrap();
            library_db::upsert_track(&conn, &track).unwrap();
        }

        // 1. Load track
        let load_res = playback_load_core(&state, track_id).expect("load track succeeds");
        assert_eq!(load_res.duration_ms, 1000.0);

        let initial_state = playback_state_core();
        assert_eq!(initial_state.state, PlayerState::Stopped);
        assert_eq!(initial_state.position_ms, 0.0);

        // 2. Play
        playback_play_core().expect("play succeeds");
        let playing_state = playback_state_core();
        assert_eq!(playing_state.state, PlayerState::Playing);

        // 3. Pause
        playback_pause_core().expect("pause succeeds");
        let paused_state = playback_state_core();
        assert_eq!(paused_state.state, PlayerState::Paused);

        // 4. Seek
        playback_seek_core(500.0).expect("seek succeeds");
        let seeked_state = playback_state_core();
        assert_eq!(seeked_state.position_ms, 500.0);

        // 5. Seek clamping
        playback_seek_core(-200.0).expect("seek negative succeeds");
        assert_eq!(playback_state_core().position_ms, 0.0);

        playback_seek_core(5000.0).expect("seek beyond duration succeeds");
        assert_eq!(playback_state_core().position_ms, 1000.0);

        // 6. Set click
        playback_set_click_core(true);
        assert!(get_player().is_click_enabled());
        playback_set_click_core(false);
        assert!(!get_player().is_click_enabled());
    }

    #[test]
    fn test_playback_load_missing_track_returns_error() {
        let state = AppState::in_memory().expect("in-memory state created");
        let err = playback_load_core(&state, "non-existent-id").unwrap_err();
        assert!(err.contains("Track not found"));
    }
}
