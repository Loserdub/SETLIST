//! Tauri backend application.

/// Ping command returning `"pong"`.
#[tauri::command]
fn ping() -> &'static str {
    "pong"
}

/// Runs the Tauri application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![ping]);

    if let Err(err) = builder.run(tauri::generate_context!()) {
        eprintln!("error while running tauri application: {err}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ping() {
        assert_eq!(ping(), "pong");
    }
}
