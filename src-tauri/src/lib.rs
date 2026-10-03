//! Tauri backend application for SETLIST.

pub mod commands;
pub mod overrides;
pub mod playback;
pub mod state;

pub use commands::*;
pub use state::*;

use tauri::Manager;

/// Resolves the application data directory where logs and SQLite database are stored.
pub fn resolve_app_data_dir() -> std::path::PathBuf {
    if let Some(appdata) = std::env::var_os("APPDATA") {
        std::path::PathBuf::from(appdata).join("com.setlist.desktop")
    } else if let Ok(profile) = std::env::var("USERPROFILE") {
        std::path::PathBuf::from(profile)
            .join("AppData")
            .join("Roaming")
            .join("com.setlist.desktop")
    } else {
        std::path::PathBuf::from(".setlist")
    }
}

/// Appends a diagnostic message directly to setlist.log on disk.
/// This works even if the log plugin has not initialized or during a fatal panic.
pub fn append_to_setlist_log(msg: &str) {
    let dir = resolve_app_data_dir();
    let _ = std::fs::create_dir_all(&dir);
    let log_file = dir.join("setlist.log");
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
    {
        use std::io::Write;
        let _ = writeln!(file, "{}", msg);
    }
}

/// Shows a native OS error dialog using `rfd` (without requiring any webview).
pub fn show_native_error_dialog(title: &str, description: &str) {
    rfd::MessageDialog::new()
        .set_title(title)
        .set_description(description)
        .set_level(rfd::MessageLevel::Error)
        .show();
}

/// Handles a panic, scoping fatal termination and native modal dialogs to the "main" thread only.
/// On any other thread (e.g. background scan workers or analysis threads), the panic is logged
/// with the thread name and the function returns without showing a dialog or terminating the process.
///
/// Both `show_dialog` and `exit_fn` are injectable to support deterministic unit testing.
pub fn handle_panic_scoped<D, E, R>(
    panic_info: &std::panic::PanicHookInfo<'_>,
    mut show_dialog: D,
    mut exit_fn: E,
) where
    D: FnMut(&str, &str),
    E: FnMut(i32) -> R,
{
    let current_thread = std::thread::current();
    let thread_name = current_thread.name().unwrap_or("<unnamed>");
    let pid = std::process::id();
    let location = panic_info
        .location()
        .map(|loc| format!("{}:{}:{}", loc.file(), loc.line(), loc.column()))
        .unwrap_or_else(|| "unknown location".to_string());

    let payload = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
        s.clone()
    } else {
        "Internal panic with unspecified payload".to_string()
    };

    if thread_name != "main" {
        let log_msg =
            format!("[WORKER PANIC] (PID: {pid}) Thread '{thread_name}': {payload} at {location}");
        eprintln!("{log_msg}");
        log::error!("{log_msg}");
        append_to_setlist_log(&log_msg);
        return;
    }

    let log_msg =
        format!("[FATAL PANIC] (PID: {pid}) Thread '{thread_name}': {payload} at {location}");
    eprintln!("{log_msg}");
    log::error!("{log_msg}");
    append_to_setlist_log(&log_msg);

    let log_path = resolve_app_data_dir().join("setlist.log");
    let dialog_msg = format!(
        "SETLIST encountered an unrecoverable error on thread '{thread_name}' and must terminate.\n\n\
         Error: {payload}\n\
         Location: {location}\n\
         Process ID: {pid}\n\n\
         Log file:\n{}",
        log_path.display()
    );

    show_dialog("SETLIST - Fatal Error", &dialog_msg);
    exit_fn(1);
}

/// Installs the panic hook with default native dialog and process termination handlers.
pub fn install_panic_hook() {
    std::panic::set_hook(Box::new(|panic_info| {
        handle_panic_scoped(panic_info, show_native_error_dialog, std::process::exit);
    }));
}

/// Runs the Tauri application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Install panic hook early so any unhandled panic displays a native dialog and logs to setlist.log
    install_panic_hook();

    let builder = tauri::Builder::default()
        // 7. Register single-instance plugin first in the builder
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            log::info!("Second instance launch detected; focusing existing main window");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let pid = std::process::id();

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
            log::info!("SETLIST Desktop Application Starting (PID: {pid})");
            log::info!("App Data Folder: {}", app_data.display());
            log::info!("Log File: {}", app_data.join("setlist.log").display());
            append_to_setlist_log(&format!("[STARTUP] SETLIST started (PID: {pid})"));

            // Deliberate test failure switch for manual verification of startup error handling
            if std::env::var("SETLIST_TEST_STARTUP_ERROR")
                .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
                .unwrap_or(false)
            {
                let err_msg = "Deliberate startup error triggered by SETLIST_TEST_STARTUP_ERROR=1";
                log::error!("{err_msg}");
                append_to_setlist_log(&format!("[TEST ERROR] {err_msg}"));
                return Err(err_msg.into());
            }

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

            // Catch webview creation and setup errors: ensure main window is created
            let main_window = app.get_webview_window("main").ok_or_else(|| {
                "Failed to find or create main webview window. Ensure Microsoft Edge WebView2 is installed.".to_string()
            })?;

            let _ = main_window.set_title("SETLIST");
            if let Some(icon) = app.default_window_icon() {
                let _ = main_window.set_icon(icon.clone());
            }
            let _ = main_window.show();
            let _ = main_window.unminimize();
            let _ = main_window.set_focus();

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
            overrides::set_track_override,
            overrides::clear_track_override,
            overrides::get_track_override,
            overrides::get_track_override_flags,
            playback::playback_load,
            playback::playback_play,
            playback::playback_pause,
            playback::playback_seek,
            playback::playback_state,
            playback::playback_set_click,
            playback::playback_set_speed,
            playback::playback_get_speed,
        ]);

    // Catch initialization / webview creation errors
    let app = match builder.build(tauri::generate_context!()) {
        Ok(app) => app,
        Err(err) => {
            let pid = std::process::id();
            let log_msg = format!("[STARTUP ERROR] (PID: {pid}) Application build failed: {err}");
            eprintln!("{log_msg}");
            log::error!("{log_msg}");
            append_to_setlist_log(&log_msg);

            let log_path = resolve_app_data_dir().join("setlist.log");
            let dialog_msg = format!(
                "SETLIST failed to start during initialization.\n\n\
                 Error: {}\n\
                 Process ID: {}\n\n\
                 Log file:\n{}",
                err,
                pid,
                log_path.display()
            );
            show_native_error_dialog("SETLIST - Startup Error", &dialog_msg);
            std::process::exit(1);
        }
    };

    // Log clean exit with PID when application terminates
    app.run(move |_app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            let pid = std::process::id();
            log::info!("SETLIST cleanly exiting (PID: {pid})");
            log::info!("========================================");
            append_to_setlist_log(&format!("[CLEAN EXIT] SETLIST cleanly exited (PID: {pid})"));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ping() {
        assert_eq!(commands::ping(), "pong");
    }

    #[test]
    fn test_resolve_app_data_dir() {
        let dir = resolve_app_data_dir();
        assert!(dir.to_string_lossy().contains("com.setlist.desktop"));
    }

    #[test]
    fn test_append_to_setlist_log() {
        let test_msg = format!("[TEST] Unit test diagnostic message {}", std::process::id());
        append_to_setlist_log(&test_msg);
        let log_file = resolve_app_data_dir().join("setlist.log");
        assert!(log_file.exists());
        let content = std::fs::read_to_string(&log_file).unwrap();
        assert!(content.contains(&test_msg));
    }

    #[test]
    fn test_panic_in_spawned_thread_does_not_call_exit() {
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;

        let dialog_called = Arc::new(AtomicBool::new(false));
        let exit_called = Arc::new(AtomicBool::new(false));

        let d_clone = Arc::clone(&dialog_called);
        let e_clone = Arc::clone(&exit_called);

        let handle = std::thread::Builder::new()
            .name("scan-worker-test".to_string())
            .spawn(move || {
                let prev_hook = std::panic::take_hook();
                std::panic::set_hook(Box::new(move |info| {
                    handle_panic_scoped(
                        info,
                        |_title, _desc| {
                            d_clone.store(true, Ordering::SeqCst);
                        },
                        |_code| {
                            e_clone.store(true, Ordering::SeqCst);
                        },
                    );
                }));

                let _ = std::panic::catch_unwind(|| {
                    panic!("Simulated scan worker panic for testing isolation");
                });

                std::panic::set_hook(prev_hook);
            })
            .unwrap();

        handle.join().unwrap();

        assert!(
            !dialog_called.load(Ordering::SeqCst),
            "Dialog must not be called for worker threads"
        );
        assert!(
            !exit_called.load(Ordering::SeqCst),
            "Exit must not be called for worker threads"
        );
    }

    #[test]
    fn test_panic_in_main_thread_calls_dialog_and_exit() {
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;

        let dialog_called = Arc::new(AtomicBool::new(false));
        let exit_called = Arc::new(AtomicBool::new(false));

        let d_clone = Arc::clone(&dialog_called);
        let e_clone = Arc::clone(&exit_called);

        let handle = std::thread::Builder::new()
            .name("main".to_string())
            .spawn(move || {
                let prev_hook = std::panic::take_hook();
                std::panic::set_hook(Box::new(move |info| {
                    handle_panic_scoped(
                        info,
                        |_title, _desc| {
                            d_clone.store(true, Ordering::SeqCst);
                        },
                        |_code| {
                            e_clone.store(true, Ordering::SeqCst);
                        },
                    );
                }));

                let _ = std::panic::catch_unwind(|| {
                    panic!("Simulated main thread panic");
                });

                std::panic::set_hook(prev_hook);
            })
            .unwrap();

        handle.join().unwrap();

        assert!(
            dialog_called.load(Ordering::SeqCst),
            "Dialog must be called for main thread panic"
        );
        assert!(
            exit_called.load(Ordering::SeqCst),
            "Exit must be called for main thread panic"
        );
    }
}
