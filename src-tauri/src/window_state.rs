//! Window state persistence for SETLIST.
//!
//! Automatically records and restores window dimensions, position, and maximized state
//! to prevent unwanted resizing or positioning across application restarts.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{PhysicalPosition, PhysicalSize, Position, Size, WebviewWindow, WindowEvent};

pub const DEFAULT_WIDTH: u32 = 1120;
pub const DEFAULT_HEIGHT: u32 = 700;
pub const MIN_WIDTH: u32 = 960;
pub const MIN_HEIGHT: u32 = 600;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_maximized: bool,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            x: 100,
            y: 100,
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
            is_maximized: false,
        }
    }
}

/// Loads window state from disk if present and valid.
pub fn load_window_state(app_data_dir: &Path) -> Option<WindowState> {
    let state_file = app_data_dir.join("window-state.json");
    if !state_file.exists() {
        return None;
    }
    let data = std::fs::read_to_string(&state_file).ok()?;
    serde_json::from_str(&data).ok()
}

/// Saves window state to disk.
pub fn save_window_state(app_data_dir: &Path, state: &WindowState) -> std::io::Result<()> {
    let _ = std::fs::create_dir_all(app_data_dir);
    let state_file = app_data_dir.join("window-state.json");
    let json = serde_json::to_string_pretty(state).map_err(std::io::Error::other)?;
    std::fs::write(&state_file, json)
}

/// Applies saved window state or applies DPI-safe defaults.
pub fn apply_saved_state_or_defaults(window: &WebviewWindow, app_data_dir: &Path) {
    if let Some(state) = load_window_state(app_data_dir) {
        let width = state.width.max(MIN_WIDTH);
        let height = state.height.max(MIN_HEIGHT);

        // Check if the saved position intersects any available monitor
        let mut is_on_screen = false;
        if let Ok(monitors) = window.available_monitors() {
            for monitor in monitors {
                let pos = monitor.position();
                let size = monitor.size();
                let mon_x = pos.x;
                let mon_y = pos.y;
                let mon_right = mon_x + size.width as i32;
                let mon_bottom = mon_y + size.height as i32;

                // Center of the window must be on this monitor
                let win_center_x = state.x + (width as i32 / 2);
                let win_center_y = state.y + (height as i32 / 2);

                if win_center_x >= mon_x
                    && win_center_x <= mon_right
                    && win_center_y >= mon_y
                    && win_center_y <= mon_bottom
                {
                    is_on_screen = true;
                    break;
                }
            }
        }

        let _ = window.set_size(Size::Physical(PhysicalSize::new(width, height)));

        if is_on_screen {
            let _ =
                window.set_position(Position::Physical(PhysicalPosition::new(state.x, state.y)));
        } else {
            let _ = window.center();
        }

        if state.is_maximized {
            let _ = window.maximize();
        }
    } else {
        // No saved state: set DPI-safe default size and center
        let _ = window.set_size(Size::Physical(PhysicalSize::new(
            DEFAULT_WIDTH,
            DEFAULT_HEIGHT,
        )));
        let _ = window.center();
    }
}

/// Attaches listeners to automatically persist window bounds and maximized state across moves/resizes.
pub fn setup_window_state_tracking(window: &WebviewWindow, app_data_dir: PathBuf) {
    let initial_state = load_window_state(&app_data_dir).unwrap_or_default();
    let latest_state = Arc::new(Mutex::new(initial_state));

    let win_handle = window.clone();
    let state_clone = Arc::clone(&latest_state);
    let app_dir_clone = app_data_dir;

    window.on_window_event(move |event| match event {
        WindowEvent::Resized(size) => {
            if let Ok(mut current) = state_clone.lock() {
                let is_max = win_handle.is_maximized().unwrap_or(false);
                current.is_maximized = is_max;
                if !is_max && size.width > 0 && size.height > 0 {
                    current.width = size.width;
                    current.height = size.height;
                }
                let _ = save_window_state(&app_dir_clone, &current);
            }
        }
        WindowEvent::Moved(pos) => {
            if let Ok(mut current) = state_clone.lock() {
                let is_max = win_handle.is_maximized().unwrap_or(false);
                current.is_maximized = is_max;
                if !is_max {
                    current.x = pos.x;
                    current.y = pos.y;
                }
                let _ = save_window_state(&app_dir_clone, &current);
            }
        }
        WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
            if let Ok(current) = state_clone.lock() {
                let _ = save_window_state(&app_dir_clone, &current);
            }
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_window_state_serialization_roundtrip() {
        let state = WindowState {
            x: 150,
            y: 200,
            width: 1280,
            height: 720,
            is_maximized: true,
        };
        let json = serde_json::to_string(&state).expect("serialize");
        let deserialized: WindowState = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized.x, 150);
        assert_eq!(deserialized.y, 200);
        assert_eq!(deserialized.width, 1280);
        assert_eq!(deserialized.height, 720);
        assert!(deserialized.is_maximized);
    }

    #[test]
    fn test_window_state_file_save_and_load() {
        let temp_dir = tempfile::tempdir().expect("tempdir");
        let state = WindowState {
            x: 50,
            y: 80,
            width: 1024,
            height: 768,
            is_maximized: false,
        };
        save_window_state(temp_dir.path(), &state).expect("save state");
        let loaded = load_window_state(temp_dir.path()).expect("load state");
        assert_eq!(loaded.x, 50);
        assert_eq!(loaded.y, 80);
        assert_eq!(loaded.width, 1024);
        assert_eq!(loaded.height, 768);
        assert!(!loaded.is_maximized);
    }
}
