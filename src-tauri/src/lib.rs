//! Tauri backend application for SETLIST.

pub mod commands;
pub mod state;

pub use commands::*;
pub use state::*;

use tauri::Manager;

/// Runs the Tauri application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .setup(|app| {
            // Determine application data directory
            let app_data = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("failed to determine app data directory: {e}"))?;

            std::fs::create_dir_all(&app_data).map_err(|e| {
                format!(
                    "failed to create app data directory {}: {e}",
                    app_data.display()
                )
            })?;

            // Initialize structured file and stdout logging
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .targets([
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
                            path: app_data.clone(),
                            file_name: Some("setlist".to_string()),
                        }),
                    ])
                    .build(),
            )?;

            log::info!("========================================");
            log::info!("SETLIST Desktop Application Starting");
            log::info!("App Data Folder: {}", app_data.display());
            log::info!("Log File: {}", app_data.join("setlist.log").display());

            let db_path = app_data.join("library.db");
            log::info!("Connecting to library database at {}", db_path.display());

            let app_state = AppState::new(db_path)
                .map_err(|e| format!("failed to initialize application state: {e}"))?;

            // Load and log existing settings
            if let Ok(conn) = app_state.db.lock() {
                if let Ok(settings) = library_db::load_settings(&conn) {
                    log::info!(
                        "Loaded settings: workers={}, tempo_weight={:.2}, key_weight={:.2}, energy_weight={:.2}",
                        settings.worker_count,
                        settings.cost_weights.tempo,
                        settings.cost_weights.key,
                        settings.cost_weights.energy
                    );
                }
            }

            // Ensure window title and icon are set
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("SETLIST");
                if let Some(icon) = app.default_window_icon() {
                    let _ = window.set_icon(icon.clone());
                }
            }

            app.manage(app_state);
            log::info!("Application state initialized successfully");
            log::info!("========================================");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::scan_folder,
            commands::list_tracks,
            commands::get_track,
            commands::suggest_order,
            commands::get_advice,
            commands::export_set,
            commands::get_settings,
            commands::save_settings,
            commands::validate_song_command,
            commands::upsert_song,
            commands::get_song,
            commands::list_songs,
            commands::delete_song,
            commands::get_active_setlist,
            commands::save_active_setlist,
            commands::load_setlist,
            commands::list_setlists,
            commands::save_setlist,
            commands::delete_setlist,
            commands::add_setlist_item,
            commands::remove_setlist_item,
            commands::move_setlist_item,
            commands::update_setlist_item,
            commands::get_song_relationships,
            commands::get_song_relationship,
            commands::get_potential_bridges,
            commands::get_catalog_clusters,
            commands::get_catalog_openers_and_closers,
            commands::get_catalog_outliers,
            commands::get_unusual_transitions,
            commands::get_catalog_summary_stats,
            commands::explore_candidate_paths,
        ]);

    if let Err(err) = builder.run(tauri::generate_context!()) {
        eprintln!("error while running tauri application: {err}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ping() {
        assert_eq!(commands::ping(), "pong");
    }
}
