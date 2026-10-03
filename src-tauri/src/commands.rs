//! Tauri command handlers matching the UI Backend interface.

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::Arc;

use core_types::{
    validate_setlist, validate_song, AppError, AppSettings, BridgeCandidateAnalysis,
    CatalogCluster, CatalogOpenersAndClosers, CatalogOutlier, CatalogSummaryStats, CostWeights,
    DiscoveryCandidatePath, DiscoveryConstraints, EnergyProfile, ExportResult, ExportTarget,
    Setlist, SetlistEntry, SetlistItem, Song, SongRelationship, SongRelationshipsResponse, Track,
    TrackTags, TransitionAdvice, ValidationError,
};
use library_db::scan::ScanEvent;
use library_db::TrackFilter;
use sequencer::{evaluate_song_relationship, CatalogGraph, CostModelConfig};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::state::{AppState, ProgressEvent, ProgressStage};

/// Ping command returning `"pong"`.
#[tauri::command]
pub fn ping() -> &'static str {
    "pong"
}

/// Core implementation of folder scanning and analysis.
///
/// Accepts an event callback for progress reporting, allowing headless testing
/// as well as Tauri IPC event emission.
///
/// # Errors
/// Returns error text if the directory is missing, scanning fails, or database persistence fails.
pub async fn scan_folder_core<F>(
    state: &AppState,
    folder_path: PathBuf,
    mut on_progress: F,
) -> Result<Vec<Track>, String>
where
    F: FnMut(ProgressEvent) + Send + 'static,
{
    if !folder_path.is_dir() {
        return Err(format!(
            "Directory does not exist or is not a folder: {}",
            folder_path.display()
        ));
    }

    let scan_guard = state.job_queue.start_scan()?;
    let cancel_token = scan_guard.token();
    let analyzer = Arc::clone(&state.job_queue.analyzer);

    let settings = {
        let conn = state
            .db
            .lock()
            .map_err(|e| format!("database mutex error: {e}"))?;
        library_db::load_settings(&conn).map_err(|e| e.to_string())?
    };

    let config = library_db::scan::ScanConfig {
        num_workers: settings.worker_count.max(1) as usize,
        ..Default::default()
    };

    let (event_tx, event_rx) = mpsc::channel::<ScanEvent>();

    // Forward scanner events to progress callback
    let forwarder_handle = std::thread::spawn(move || {
        let mut total_found = 0;
        let mut processed = 0;

        while let Ok(event) = event_rx.recv() {
            match event {
                ScanEvent::Queued { path } => {
                    total_found += 1;
                    let file_name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("audio file")
                        .to_string();
                    on_progress(ProgressEvent {
                        stage: ProgressStage::Scanning,
                        current: processed,
                        total: total_found,
                        message: Some(format!("Discovered {file_name}")),
                        track_id: None,
                    });
                }
                ScanEvent::Started { path } => {
                    let file_name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("audio file")
                        .to_string();
                    on_progress(ProgressEvent {
                        stage: ProgressStage::Analyzing,
                        current: processed,
                        total: total_found.max(processed + 1),
                        message: Some(format!("Analyzing {file_name}...")),
                        track_id: None,
                    });
                }
                ScanEvent::Done { path, track_id } => {
                    processed += 1;
                    let file_name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("audio file")
                        .to_string();
                    on_progress(ProgressEvent {
                        stage: ProgressStage::Analyzing,
                        current: processed,
                        total: total_found.max(processed),
                        message: Some(format!("Completed {file_name}")),
                        track_id: Some(track_id),
                    });
                }
                ScanEvent::Skipped { path } => {
                    processed += 1;
                    let file_name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("audio file")
                        .to_string();
                    on_progress(ProgressEvent {
                        stage: ProgressStage::Analyzing,
                        current: processed,
                        total: total_found.max(processed),
                        message: Some(format!("Skipped (already analyzed) {file_name}")),
                        track_id: None,
                    });
                }
                ScanEvent::Failed { path, error } => {
                    processed += 1;
                    let file_name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("audio file")
                        .to_string();
                    on_progress(ProgressEvent {
                        stage: ProgressStage::Analyzing,
                        current: processed,
                        total: total_found.max(processed),
                        message: Some(format!("Failed {file_name}: {error}")),
                        track_id: None,
                    });
                }
            }
        }
        (processed, total_found)
    });

    // Execute scan in blocking thread with appropriate database connection
    let db_path_opt = state.db_path.clone();
    let db_mutex = Arc::clone(&state.db);
    let folder_clone = folder_path.clone();

    let scan_result = tauri::async_runtime::spawn_blocking(move || {
        if let Some(db_file) = db_path_opt {
            let conn = rusqlite::Connection::open(&db_file)
                .map_err(|e| format!("failed to open db for scanning: {e}"))?;
            conn.execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA foreign_keys = ON;
                 PRAGMA busy_timeout = 5000;",
            )
            .map_err(|e| format!("failed to set db pragmas: {e}"))?;
            library_db::scan_folder(
                &conn,
                &folder_clone,
                analyzer,
                &config,
                Some(cancel_token),
                Some(event_tx),
            )
            .map_err(|e| e.to_string())
        } else {
            let conn = db_mutex
                .lock()
                .map_err(|e| format!("database mutex error: {e}"))?;
            library_db::scan_folder(
                &conn,
                &folder_clone,
                analyzer,
                &config,
                Some(cancel_token),
                Some(event_tx),
            )
            .map_err(|e| e.to_string())
        }
    })
    .await
    .map_err(|e| format!("scan task join error: {e}"))?;

    // Wait for the forwarder thread to drain all queued events
    let (_processed, _total_found) = forwarder_handle
        .join()
        .map_err(|_| "event forwarder thread panicked".to_string())?;

    scan_result?;

    // Explicitly release scan guard before querying final track list
    drop(scan_guard);

    // Return current library tracks
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("database mutex error: {e}"))?;
    library_db::list_tracks(&conn, &TrackFilter::new()).map_err(|e| e.to_string())
}

/// Recursively scans an audio directory, extracts metadata and full DSP analysis,
/// persists records to SQLite, and emits progress events over the `"progress"` IPC channel.
///
/// Accepts either `path` or `folder` for frontend invocation flexibility.
///
/// # Errors
/// Returns error text if the folder path is invalid or scanning fails.
#[tauri::command]
pub async fn scan_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    path: Option<String>,
    folder: Option<String>,
) -> Result<Vec<Track>, String> {
    let target_str = path
        .or(folder)
        .ok_or_else(|| "Missing 'path' or 'folder' parameter".to_string())?;
    let folder_path = PathBuf::from(&target_str);

    let app_handle = app.clone();
    let result = scan_folder_core(&state, folder_path, move |evt| {
        let _ = app_handle.emit("progress", evt);
    })
    .await;

    let _ = app.emit(
        "progress",
        ProgressEvent {
            stage: ProgressStage::Analyzing,
            current: 0,
            total: 0,
            message: Some("Folder scan complete".to_string()),
            track_id: None,
        },
    );

    result
}

/// Core implementation of retrieving all tracks in the library database.
///
/// # Errors
/// Returns error text if querying the database fails.
pub fn list_tracks_core(state: &AppState) -> Result<Vec<Track>, String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("database mutex error: {e}"))?;
    library_db::list_tracks(&conn, &TrackFilter::new()).map_err(|e| e.to_string())
}

/// Retrieves all tracks stored in the library database.
///
/// # Errors
/// Returns error text if querying the database fails.
#[tauri::command]
pub async fn list_tracks(state: State<'_, AppState>) -> Result<Vec<Track>, String> {
    list_tracks_core(&state)
}

/// Core implementation of retrieving a single track by identifier.
///
/// # Errors
/// Returns error text if querying the database fails.
pub fn get_track_core(
    state: &AppState,
    id: &str,
) -> Result<Option<library_db::TrackWithOverrides>, String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("database mutex error: {e}"))?;
    library_db::get_track_with_overrides(&conn, id).map_err(|e| e.to_string())
}

/// Retrieves a single track by identifier from the library database, including
/// field-level override flags.
///
/// Returns `Ok(None)` if no track with the given identifier exists.
///
/// # Errors
/// Returns error text if querying the database fails.
#[tauri::command]
pub async fn get_track(
    id: String,
    state: State<'_, AppState>,
) -> Result<Option<library_db::TrackWithOverrides>, String> {
    get_track_core(&state, &id)
}

/// Core implementation of setlist order suggestion with optional anchors and transition advice.
///
/// # Errors
/// Returns error text if track lookup or sequencer solving fails.
pub fn suggest_order_pins_core<F>(
    state: &AppState,
    track_ids: Option<Vec<String>>,
    profile: Option<EnergyProfile>,
    weights: Option<CostWeights>,
    first_id: Option<String>,
    last_id: Option<String>,
    mut on_progress: F,
) -> Result<Vec<SetlistEntry>, String>
where
    F: FnMut(ProgressEvent),
{
    let active_profile = profile.unwrap_or(EnergyProfile::PeakPlateau);

    let conn = state
        .db
        .lock()
        .map_err(|e| format!("database mutex error: {e}"))?;

    let settings = library_db::load_settings(&conn).map_err(|e| e.to_string())?;
    let cost_config = CostModelConfig::from_app_settings(&settings);
    let active_weights = weights.unwrap_or(settings.cost_weights);

    // Gather candidate tracks, preserving every track supplied in track_ids
    let tracks = match track_ids {
        Some(ref ids) if !ids.is_empty() => {
            // Deduplicate IDs while strictly preserving input order
            let mut seen = HashSet::new();
            let mut unique_ids = Vec::with_capacity(ids.len());
            for id in ids {
                if seen.insert(id.clone()) {
                    unique_ids.push(id.clone());
                }
            }

            let mut list = Vec::with_capacity(unique_ids.len());
            for id in &unique_ids {
                if let Some(track) = library_db::get_track(&conn, id).map_err(|e| e.to_string())? {
                    list.push(track);
                } else {
                    // Preserve track even if unpersisted stub
                    list.push(Track {
                        id: id.clone(),
                        path: String::new(),
                        hash: String::new(),
                        tags: TrackTags {
                            title: Some(id.clone()),
                            artist: None,
                            album: None,
                        },
                        duration_ms: 0.0,
                        analysis: None,
                        analyzed_at: None,
                        analysis_version: None,
                    });
                }
            }
            list
        }
        _ => library_db::list_tracks(&conn, &TrackFilter::new()).map_err(|e| e.to_string())?,
    };

    drop(conn);

    if tracks.is_empty() {
        return Ok(vec![]);
    }

    on_progress(ProgressEvent {
        stage: ProgressStage::Sequencing,
        current: 0,
        total: tracks.len(),
        message: Some(format!(
            "Sequencing {} tracks with {:?} profile...",
            tracks.len(),
            active_profile
        )),
        track_id: None,
    });

    // Partition into analyzed and unanalyzed tracks.
    // Unanalyzed tracks are never passed to the sequencer.
    let (analyzed_tracks, unanalyzed_tracks): (Vec<Track>, Vec<Track>) =
        tracks.into_iter().partition(|t| t.analysis.is_some());

    let mut ordered_tracks = if analyzed_tracks.is_empty() {
        Vec::new()
    } else {
        let analyses: Vec<core_types::TrackAnalysis> = analyzed_tracks
            .iter()
            .filter_map(|t| t.analysis.clone())
            .collect();

        let mut pins = sequencer::TrackPins::new();
        if let Some(ref fid) = first_id {
            if let Some(pos) = analyzed_tracks.iter().position(|t| &t.id == fid) {
                pins = pins.with_first(pos);
            }
        }
        if let Some(ref lid) = last_id {
            if let Some(pos) = analyzed_tracks.iter().position(|t| &t.id == lid) {
                pins = pins.with_last(pos);
            }
        }

        let seed = 42; // Deterministic seed per AGENTS.md

        let ordered = sequencer::order_tracks_with_config(
            &analyses,
            &active_weights,
            active_profile,
            &pins,
            seed,
            Some(&cost_config),
        )
        .map_err(|e| format!("sequencer solver error: {e}"))?;

        ordered
            .order
            .iter()
            .map(|&idx| analyzed_tracks[idx].clone())
            .collect()
    };

    // After sequencing analyzed tracks, merge the unoptimized tracks back into the result deterministically.
    ordered_tracks.extend(unanalyzed_tracks);

    let total = ordered_tracks.len();
    let mut entries: Vec<SetlistEntry> = Vec::with_capacity(total);

    for (pos_idx, track) in ordered_tracks.into_iter().enumerate() {
        // Recalculate transition advice for every adjacent pair where both tracks have usable analysis.
        // If either track lacks analysis, set transition to None rather than failing.
        let transition = if pos_idx > 0 {
            let prev_analysis = entries
                .get(pos_idx - 1)
                .and_then(|e| e.track.as_ref())
                .and_then(|t| t.analysis.as_ref());
            let curr_analysis = track.analysis.as_ref();

            if let (Some(prev), Some(curr)) = (prev_analysis, curr_analysis) {
                let de = sequencer::dE_target(active_profile, pos_idx - 1, total);
                sequencer::advise_transition_with_cost_and_config(
                    prev,
                    curr,
                    Some(active_weights.clone()),
                    Some(active_profile),
                    Some(de),
                    Some(&cost_config),
                )
                .ok()
            } else {
                None
            }
        } else {
            None
        };

        let target_e = sequencer::target_energy(active_profile, pos_idx, total);

        entries.push(SetlistEntry {
            position: (pos_idx + 1) as u32,
            track_id: track.id.clone(),
            track: Some(track),
            transition,
            target_energy: Some(target_e),
        });
    }

    on_progress(ProgressEvent {
        stage: ProgressStage::Sequencing,
        current: total,
        total,
        message: Some("Setlist sequencing complete".to_string()),
        track_id: None,
    });

    Ok(entries)
}

/// Core implementation of setlist order suggestion with transition advice.
///
/// Backwards-compatible convenience wrapper around [`suggest_order_pins_core`].
///
/// # Errors
/// Returns error text if track lookup or sequencer solving fails.
pub fn suggest_order_core<F>(
    state: &AppState,
    track_ids: Option<Vec<String>>,
    profile: Option<EnergyProfile>,
    weights: Option<CostWeights>,
    on_progress: F,
) -> Result<Vec<SetlistEntry>, String>
where
    F: FnMut(ProgressEvent),
{
    suggest_order_pins_core(state, track_ids, profile, weights, None, None, on_progress)
}

/// Computes an optimal harmonic and energy sequence across requested tracks with optional anchors.
///
/// Emits progress events and calculates transition advice between adjacent tracks.
///
/// # Errors
/// Returns error text if track lookup or sequencer solving fails.
#[tauri::command]
pub async fn suggest_order(
    app: AppHandle,
    state: State<'_, AppState>,
    track_ids: Option<Vec<String>>,
    profile: Option<EnergyProfile>,
    weights: Option<CostWeights>,
    first_id: Option<String>,
    last_id: Option<String>,
) -> Result<Vec<SetlistEntry>, String> {
    let app_handle = app.clone();
    suggest_order_pins_core(
        &state,
        track_ids,
        profile,
        weights,
        first_id,
        last_id,
        move |evt| {
            let _ = app_handle.emit("progress", evt);
        },
    )
}

/// Core implementation of retrieving transition advice between two tracks.
///
/// # Errors
/// Returns error text if either track is not found or lacks analysis data.
pub fn get_advice_core(
    state: &AppState,
    track_a_id: &str,
    track_b_id: &str,
    profile: Option<EnergyProfile>,
    weights: Option<CostWeights>,
    de_target: Option<f32>,
) -> Result<TransitionAdvice, String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("database mutex error: {e}"))?;

    let track_a = library_db::get_track(&conn, track_a_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Outgoing track not found: {track_a_id}"))?;

    let track_b = library_db::get_track(&conn, track_b_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Incoming track not found: {track_b_id}"))?;

    let analysis_a = track_a
        .analysis
        .ok_or_else(|| format!("Outgoing track has no analysis: {track_a_id}"))?;

    let analysis_b = track_b
        .analysis
        .ok_or_else(|| format!("Incoming track has no analysis: {track_b_id}"))?;

    let settings = library_db::load_settings(&conn).map_err(|e| e.to_string())?;
    let cost_config = CostModelConfig::from_app_settings(&settings);
    let active_weights = weights.unwrap_or(settings.cost_weights);

    sequencer::advise_transition_with_cost_and_config(
        &analysis_a,
        &analysis_b,
        Some(active_weights),
        profile,
        de_target,
        Some(&cost_config),
    )
    .map_err(|e| e.to_string())
}

/// Evaluates transition advice between two tracks given their IDs.
///
/// # Errors
/// Returns error text if either track is not found or lacks analysis data.
#[tauri::command]
pub async fn get_advice(
    state: State<'_, AppState>,
    track_a_id: String,
    track_b_id: String,
    profile: Option<EnergyProfile>,
    weights: Option<CostWeights>,
    de_target: Option<f32>,
) -> Result<TransitionAdvice, String> {
    get_advice_core(
        &state,
        &track_a_id,
        &track_b_id,
        profile,
        weights,
        de_target,
    )
}

/// Core implementation of exporting a setlist to disk.
///
/// # Errors
/// Returns error text if the file exists without overwrite, or if serialization/writing fails.
pub fn export_set_core<F>(
    entries: &[SetlistEntry],
    target: ExportTarget,
    dest_path: PathBuf,
    overwrite: bool,
    mut on_progress: F,
) -> Result<ExportResult, String>
where
    F: FnMut(ProgressEvent),
{
    let total = entries.len();

    if dest_path.exists() && !overwrite {
        return Err(format!(
            "Destination file already exists: {}",
            dest_path.display()
        ));
    }

    on_progress(ProgressEvent {
        stage: ProgressStage::Exporting,
        current: 0,
        total,
        message: Some(format!("Exporting setlist to {target:?}...")),
        track_id: None,
    });

    if let Some(parent) = dest_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory {}: {e}", parent.display()))?;
        }
    }

    match target {
        ExportTarget::RekordboxXml => {
            let options = exporters::RekordboxExportOptions {
                playlist_name: "DJ Set Assistant Export".to_string(),
                overwrite,
                ..Default::default()
            };
            exporters::export_rekordbox_xml_with_options(entries, &dest_path, &options)
                .map_err(|e| e.to_string())?;
        }
        ExportTarget::M3u8 => {
            exporters::export_m3u8_with_options(entries, &dest_path, overwrite)
                .map_err(|e| e.to_string())?;
        }
        ExportTarget::SetSheetCsv => {
            exporters::export_set_sheet_csv_with_options(entries, &dest_path, overwrite)
                .map_err(|e| e.to_string())?;
        }
        ExportTarget::SetSheetMarkdown => {
            exporters::export_set_sheet_markdown_with_options(entries, &dest_path, overwrite)
                .map_err(|e| e.to_string())?;
        }
    }

    on_progress(ProgressEvent {
        stage: ProgressStage::Exporting,
        current: total,
        total,
        message: Some(format!("Exported to {}", dest_path.display())),
        track_id: None,
    });

    Ok(ExportResult {
        path: dest_path.to_string_lossy().to_string(),
        format: target,
        track_count: total,
    })
}

/// Exports a setlist sequence to the specified target format (Rekordbox XML, M3U8, or Set Sheet).
///
/// Emits progress events and returns a structured `ExportResult` with path, format, and track count.
/// If `output_path` is not provided, generates a collision-free path with millisecond precision.
///
/// # Errors
/// Returns error text if export serialization or file writing fails, or if the file already exists without `overwrite`.
#[tauri::command]
pub async fn export_set(
    app: AppHandle,
    _state: State<'_, AppState>,
    entries: Vec<SetlistEntry>,
    target: ExportTarget,
    output_path: Option<String>,
    overwrite: Option<bool>,
) -> Result<ExportResult, String> {
    let allow_overwrite = overwrite.unwrap_or(false);
    let dest_path = if let Some(ref p) = output_path {
        PathBuf::from(p)
    } else {
        let app_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        let ext = match target {
            ExportTarget::RekordboxXml => "xml",
            ExportTarget::M3u8 => "m3u8",
            ExportTarget::SetSheetCsv => "csv",
            ExportTarget::SetSheetMarkdown => "md",
        };
        let millis = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let mut candidate = app_dir.join(format!("setlist_export_{millis}.{ext}"));
        let mut counter = 1;
        while candidate.exists() {
            candidate = app_dir.join(format!("setlist_export_{millis}_{counter}.{ext}"));
            counter += 1;
        }
        candidate
    };

    let app_handle = app.clone();
    export_set_core(&entries, target, dest_path, allow_overwrite, move |evt| {
        let _ = app_handle.emit("progress", evt);
    })
}

/// Retrieves application settings from the database.
///
/// # Errors
/// Returns error text if database lock or load fails.
#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    library_db::load_settings(&conn).map_err(|e| e.to_string())
}

/// Persists application settings to the database.
///
/// # Errors
/// Returns error text if database lock or save fails.
#[tauri::command]
pub fn save_settings(state: State<'_, AppState>, settings: AppSettings) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    library_db::save_settings(&conn, &settings).map_err(|e| e.to_string())?;
    log::info!(
        "Application settings updated: workers={}, tempo={:.2}, key={:.2}, energy={:.2}",
        settings.worker_count,
        settings.cost_weights.tempo,
        settings.cost_weights.key,
        settings.cost_weights.energy
    );
    Ok(())
}

fn map_db_error(e: library_db::DbError) -> AppError {
    match e {
        library_db::DbError::TrackNotFound(id) => AppError::NotFound {
            entity: "Track".to_string(),
            id,
        },
        library_db::DbError::SetlistNotFound(id) => AppError::NotFound {
            entity: "Setlist".to_string(),
            id,
        },
        library_db::DbError::DataIntegrity(msg) => {
            AppError::Validation(vec![ValidationError::new("data_integrity", msg, None)])
        }
        other => AppError::Database {
            message: other.to_string(),
        },
    }
}

/// Validates song fields according to domain rules.
///
/// # Errors
/// Returns `AppError::Validation` if any validation checks fail.
#[tauri::command]
pub fn validate_song_command(song: Song) -> Result<(), AppError> {
    validate_song(&song).map_err(AppError::from)
}

/// Persists or updates a musical Song record in the database after validation.
///
/// # Errors
/// Returns `AppError` on validation or database error.
#[tauri::command]
pub fn upsert_song(state: State<'_, AppState>, song: Song) -> Result<String, AppError> {
    validate_song(&song).map_err(AppError::from)?;
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    library_db::upsert_song(&conn, &song).map_err(map_db_error)
}

/// Retrieves a Song by its identifier.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn get_song(state: State<'_, AppState>, id: String) -> Result<Option<Song>, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    library_db::get_song(&conn, &id).map_err(map_db_error)
}

/// Lists all songs ordered by artist and title.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn list_songs(state: State<'_, AppState>) -> Result<Vec<Song>, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    library_db::list_songs(&conn).map_err(map_db_error)
}

/// Deletes a song by its identifier.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn delete_song(state: State<'_, AppState>, id: String) -> Result<bool, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    library_db::delete_song(&conn, &id).map_err(map_db_error)
}

/// Retrieves the active working setlist.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn get_active_setlist(state: State<'_, AppState>) -> Result<Option<Setlist>, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    library_db::get_active_setlist(&conn).map_err(map_db_error)
}

/// Saves and sets the active working setlist.
///
/// # Errors
/// Returns `AppError` on validation or database error.
#[tauri::command]
pub fn save_active_setlist(state: State<'_, AppState>, setlist: Setlist) -> Result<(), AppError> {
    validate_setlist(&setlist).map_err(AppError::from)?;
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    library_db::save_active_setlist(&conn, &setlist).map_err(map_db_error)
}

/// Loads a setlist by its identifier.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn load_setlist(state: State<'_, AppState>, id: String) -> Result<Option<Setlist>, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    library_db::load_setlist(&conn, &id).map_err(map_db_error)
}

/// Lists all saved setlists in descending order of update time.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn list_setlists(state: State<'_, AppState>) -> Result<Vec<Setlist>, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    library_db::list_setlists(&conn).map_err(map_db_error)
}

/// Persists a setlist and its ordered performance items.
///
/// # Errors
/// Returns `AppError` on validation or database error.
#[tauri::command]
pub fn save_setlist(state: State<'_, AppState>, setlist: Setlist) -> Result<(), AppError> {
    validate_setlist(&setlist).map_err(AppError::from)?;
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    library_db::save_setlist(&conn, &setlist).map_err(map_db_error)
}

/// Deletes a setlist by its identifier.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn delete_setlist(state: State<'_, AppState>, id: String) -> Result<bool, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    library_db::delete_setlist(&conn, &id).map_err(map_db_error)
}

/// Fine-grained insertion of an item into a setlist.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn add_setlist_item(
    state: State<'_, AppState>,
    setlist_id: String,
    item: SetlistItem,
) -> Result<(), AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    library_db::add_setlist_item(&conn, &setlist_id, &item).map_err(map_db_error)
}

/// Fine-grained removal of an item from a setlist.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn remove_setlist_item(
    state: State<'_, AppState>,
    setlist_id: String,
    position: u32,
) -> Result<(), AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    library_db::remove_setlist_item(&conn, &setlist_id, position).map_err(map_db_error)
}

/// Fine-grained reordering of an item within a setlist.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn move_setlist_item(
    state: State<'_, AppState>,
    setlist_id: String,
    from_pos: u32,
    to_pos: u32,
) -> Result<(), AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    library_db::move_setlist_item(&conn, &setlist_id, from_pos, to_pos).map_err(map_db_error)
}

/// Fine-grained update of a setlist item's metadata and notes.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn update_setlist_item(state: State<'_, AppState>, item: SetlistItem) -> Result<(), AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    library_db::update_setlist_item(&conn, &item).map_err(map_db_error)
}

/// Retrieves all incoming and outgoing song relationships for a catalog song.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn get_song_relationships(
    state: State<'_, AppState>,
    song_id: String,
) -> Result<SongRelationshipsResponse, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    let songs = library_db::list_songs(&conn).map_err(map_db_error)?;
    let graph = CatalogGraph::new(songs);
    Ok(graph.get_song_relationships(&song_id))
}

/// Evaluates the directional relationship between two songs (from -> to).
///
/// # Errors
/// Returns `AppError` on database or missing song error.
#[tauri::command]
pub fn get_song_relationship(
    state: State<'_, AppState>,
    from_song_id: String,
    to_song_id: String,
) -> Result<SongRelationship, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    let from_song = library_db::get_song(&conn, &from_song_id)
        .map_err(map_db_error)?
        .ok_or_else(|| AppError::not_found("Song", from_song_id))?;
    let to_song = library_db::get_song(&conn, &to_song_id)
        .map_err(map_db_error)?
        .ok_or_else(|| AppError::not_found("Song", to_song_id))?;
    Ok(evaluate_song_relationship(&from_song, &to_song))
}

/// Identifies candidate bridge songs that connect two disparate songs in the catalog.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn get_potential_bridges(
    state: State<'_, AppState>,
    song_a_id: String,
    song_b_id: String,
    limit: Option<usize>,
) -> Result<Vec<BridgeCandidateAnalysis>, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    let songs = library_db::list_songs(&conn).map_err(map_db_error)?;
    let graph = CatalogGraph::new(songs);
    Ok(graph.get_potential_bridges(&song_a_id, &song_b_id, limit.unwrap_or(5)))
}

/// Discovers natural clusters of compatible songs within the artist's catalog.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn get_catalog_clusters(state: State<'_, AppState>) -> Result<Vec<CatalogCluster>, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    let songs = library_db::list_songs(&conn).map_err(map_db_error)?;
    let graph = CatalogGraph::new(songs);
    Ok(graph.find_clusters())
}

/// Recommends candidate openers and closers across the artist's catalog.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn get_catalog_openers_and_closers(
    state: State<'_, AppState>,
) -> Result<CatalogOpenersAndClosers, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    let songs = library_db::list_songs(&conn).map_err(map_db_error)?;
    let graph = CatalogGraph::new(songs);
    Ok(graph.get_openers_and_closers())
}

/// Identifies low-connectivity songs / outliers in the artist's catalog with reasons.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn get_catalog_outliers(state: State<'_, AppState>) -> Result<Vec<CatalogOutlier>, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    let songs = library_db::list_songs(&conn).map_err(map_db_error)?;
    let graph = CatalogGraph::new(songs);
    Ok(graph.find_outliers())
}

/// Discovers unusual, high-contrast transition possibilities from a song.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn get_unusual_transitions(
    state: State<'_, AppState>,
    song_id: String,
    limit: Option<usize>,
) -> Result<Vec<SongRelationship>, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    let songs = library_db::list_songs(&conn).map_err(map_db_error)?;
    let graph = CatalogGraph::new(songs);
    Ok(graph.get_unusual_transitions(&song_id, limit.unwrap_or(5)))
}

/// Computes high-level catalog connectivity and discovery health statistics.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn get_catalog_summary_stats(
    state: State<'_, AppState>,
) -> Result<CatalogSummaryStats, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    let songs = library_db::list_songs(&conn).map_err(map_db_error)?;
    let graph = CatalogGraph::new(songs);
    Ok(graph.get_catalog_summary_stats())
}

/// Explores candidate sequenced paths through the catalog matching discovery constraints.
///
/// # Errors
/// Returns `AppError` on database error.
#[tauri::command]
pub fn explore_candidate_paths(
    state: State<'_, AppState>,
    constraints: DiscoveryConstraints,
) -> Result<Vec<DiscoveryCandidatePath>, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|e| AppError::database(e.to_string()))?;
    let songs = library_db::list_songs(&conn).map_err(map_db_error)?;
    let graph = CatalogGraph::new(songs);
    Ok(graph.find_candidate_paths(&constraints))
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_types::{
        BeatGrid, Camelot, CamelotLetter, DynamicsAnalysis, EnergyCurve, Key, LoudnessInfo, Mode,
        RhythmAnalysis, TrackAnalysis, Waveform3Band, WaveformBand,
    };

    fn make_test_track(
        id: &str,
        bpm: f64,
        camelot_num: u8,
        camelot_letter: CamelotLetter,
        energy: u8,
        analyzed: bool,
    ) -> Track {
        let analysis = if analyzed {
            let camelot = Camelot::new(camelot_num, camelot_letter)
                .unwrap_or_else(|_| Camelot::new(8, CamelotLetter::A).expect("default camelot"));
            Some(TrackAnalysis {
                loudness: LoudnessInfo {
                    integrated_lufs: -14.0,
                    loudness_range: 6.0,
                    true_peak: -1.0,
                },
                rhythm: RhythmAnalysis {
                    grid: BeatGrid {
                        first_downbeat_ms: 100.0,
                        bpm,
                        beats_ms: vec![100.0, 100.0 + 60000.0 / bpm],
                        downbeat_flags: vec![true, false],
                        steady: true,
                    },
                    bpm_alternates: vec![bpm * 0.5, bpm * 2.0],
                },
                key: Key {
                    pitch_class: (camelot_num * 7) % 12,
                    mode: if camelot_letter == CamelotLetter::A {
                        Mode::Minor
                    } else {
                        Mode::Major
                    },
                    camelot,
                    tuning_cents: 0.0,
                },
                dynamics: DynamicsAnalysis {
                    frame_rate: 86.13,
                    rms_curve: vec![0.5],
                    low_ratio_curve: vec![0.5],
                    centroid_curve: vec![1000.0],
                },
                energy_score: energy,
                energy_curve: EnergyCurve {
                    per_bar: vec![energy as f32],
                },
                segments: vec![],
                cue_points: vec![],
                waveform: Waveform3Band {
                    points_per_sec: 10,
                    low: WaveformBand {
                        peak: vec![100],
                        rms: vec![50],
                    },
                    mid: WaveformBand {
                        peak: vec![100],
                        rms: vec![50],
                    },
                    high: WaveformBand {
                        peak: vec![100],
                        rms: vec![50],
                    },
                },
            })
        } else {
            None
        };

        Track {
            id: id.to_string(),
            path: format!("/music/{id}.mp3"),
            hash: format!("hash_{id}"),
            tags: TrackTags {
                title: Some(format!("Track {id}")),
                artist: Some("Test Artist".to_string()),
                album: Some("Test Album".to_string()),
            },
            duration_ms: 180_000.0,
            analysis,
            analyzed_at: if analyzed {
                Some("2026-01-01T00:00:00Z".to_string())
            } else {
                None
            },
            analysis_version: if analyzed {
                Some("v1".to_string())
            } else {
                None
            },
        }
    }

    #[test]
    fn test_suggest_order_pins_anchor_placement() {
        let state = AppState::in_memory().expect("in-memory state");
        let t1 = make_test_track("T1", 120.0, 8, CamelotLetter::A, 3, true);
        let t2 = make_test_track("T2", 124.0, 9, CamelotLetter::A, 5, true);
        let t3 = make_test_track("T3", 128.0, 10, CamelotLetter::A, 7, true);
        let t4 = make_test_track("T4", 132.0, 11, CamelotLetter::A, 9, true);

        {
            let conn = state.db.lock().expect("db lock");
            library_db::upsert_track(&conn, &t1).expect("save t1");
            library_db::upsert_track(&conn, &t2).expect("save t2");
            library_db::upsert_track(&conn, &t3).expect("save t3");
            library_db::upsert_track(&conn, &t4).expect("save t4");
        }

        let ids = vec![
            "T1".to_string(),
            "T2".to_string(),
            "T3".to_string(),
            "T4".to_string(),
        ];

        // 1. Pin first=T3, last=T1
        let result = suggest_order_pins_core(
            &state,
            Some(ids.clone()),
            Some(EnergyProfile::LinearRamp),
            None,
            Some("T3".to_string()),
            Some("T1".to_string()),
            |_| {},
        )
        .expect("sequencer with pins succeeds");

        assert_eq!(result.len(), 4);
        assert_eq!(result[0].track_id, "T3", "First track must be T3");
        assert_eq!(result[3].track_id, "T1", "Last track must be T1");
        for (i, entry) in result.iter().enumerate() {
            assert_eq!(entry.position, (i + 1) as u32);
        }

        // 2. Pin first only (T4)
        let result_first_only = suggest_order_pins_core(
            &state,
            Some(ids.clone()),
            Some(EnergyProfile::LinearRamp),
            None,
            Some("T4".to_string()),
            None,
            |_| {},
        )
        .expect("sequencer with first pin succeeds");

        assert_eq!(result_first_only.len(), 4);
        assert_eq!(result_first_only[0].track_id, "T4");

        // 3. Pin last only (T2)
        let result_last_only = suggest_order_pins_core(
            &state,
            Some(ids),
            Some(EnergyProfile::LinearRamp),
            None,
            None,
            Some("T2".to_string()),
            |_| {},
        )
        .expect("sequencer with last pin succeeds");

        assert_eq!(result_last_only.len(), 4);
        assert_eq!(result_last_only[3].track_id, "T2");
    }

    #[test]
    fn test_suggest_order_pins_with_unanalyzed_tracks() {
        let state = AppState::in_memory().expect("in-memory state");
        let t1 = make_test_track("A1", 120.0, 8, CamelotLetter::A, 4, true);
        let t2 = make_test_track("A2", 124.0, 9, CamelotLetter::A, 6, true);
        let t3 = make_test_track("A3", 128.0, 10, CamelotLetter::A, 8, true);
        let u1 = make_test_track("U1", 120.0, 8, CamelotLetter::A, 5, false);
        let u2 = make_test_track("U2", 120.0, 8, CamelotLetter::A, 5, false);

        {
            let conn = state.db.lock().expect("db lock");
            library_db::upsert_track(&conn, &t1).expect("save a1");
            library_db::upsert_track(&conn, &t2).expect("save a2");
            library_db::upsert_track(&conn, &t3).expect("save a3");
            library_db::upsert_track(&conn, &u1).expect("save u1");
            library_db::upsert_track(&conn, &u2).expect("save u2");
        }

        let ids = vec![
            "A1".to_string(),
            "U1".to_string(),
            "A2".to_string(),
            "U2".to_string(),
            "A3".to_string(),
        ];

        let result = suggest_order_pins_core(
            &state,
            Some(ids),
            Some(EnergyProfile::PeakPlateau),
            None,
            Some("A3".to_string()),
            Some("A1".to_string()),
            |_| {},
        )
        .expect("sequencing with unanalyzed tracks and pins succeeds");

        assert_eq!(result.len(), 5);
        // Pinned first analyzed track
        assert_eq!(result[0].track_id, "A3");
        // Pinned last analyzed track
        assert_eq!(result[2].track_id, "A1");
        // Unanalyzed tracks appended deterministically
        assert_eq!(result[3].track_id, "U1");
        assert_eq!(result[4].track_id, "U2");
    }

    #[tokio::test]
    async fn test_scan_settings_num_workers_and_failure_recovery() {
        let state = AppState::in_memory().expect("in-memory state");

        // Set custom worker_count in database settings
        {
            let conn = state.db.lock().expect("db lock");
            let mut settings = library_db::load_settings(&conn).expect("load settings");
            settings.worker_count = 7;
            library_db::save_settings(&conn, &settings).expect("save settings");
        }

        // Verify settings persisted
        {
            let conn = state.db.lock().expect("db lock");
            let loaded = library_db::load_settings(&conn).expect("reload settings");
            assert_eq!(loaded.worker_count, 7);
        }

        // Scan a non-existent folder -> fails immediately
        let non_existent = PathBuf::from("non_existent_folder_path_xyz_12345");
        let scan_result = scan_folder_core(&state, non_existent, |_| {}).await;
        assert!(scan_result.is_err());

        // Verify running flag is not stuck
        assert!(!state.job_queue.is_running());

        // Second scan starts cleanly without error
        let guard = state
            .job_queue
            .start_scan()
            .expect("second scan starts cleanly");
        assert!(state.job_queue.is_running());
        drop(guard);
        assert!(!state.job_queue.is_running());
    }
}
