# h2-packaging-and-resilience Single-Instance, Startup Resilience, Binary Renaming, and Docs Fix
Status: done
Changed:
- `src-tauri/Cargo.toml`
- `src-tauri/src/lib.rs`
- `src-tauri/tauri.conf.json`
- `docs/BUILD_WINDOWS.md`
- `Cargo.lock`
Added deps:
- `tauri-plugin-single-instance = "2"`: enforces single instance execution and routes second launch focus/unminimize events to existing main window
- `rfd = "0.15"`: displays native Windows message dialog on fatal panics and startup errors without requiring an initialized webview
Public API:
- `app_lib::resolve_app_data_dir() -> std::path::PathBuf`: returns `%APPDATA%\com.setlist.desktop` (or platform equivalent)
- `app_lib::append_to_setlist_log(msg: &str)`: synchronous disk write to `setlist.log` resilient to uninitialized loggers and fatal panics
- `app_lib::show_native_error_dialog(title: &str, description: &str)`: displays native message box using `rfd` without a webview
- `app_lib::install_panic_hook()`: registers panic hook that writes panic payload/location to `setlist.log`, shows `rfd` dialog, and terminates with code 1
Tests:
- Rust unit tests in `src-tauri/src/lib.rs`:
  - `tests::test_ping`: basic backend IPC smoke test
  - `tests::test_resolve_app_data_dir`: verifies `com.setlist.desktop` path resolution
  - `tests::test_append_to_setlist_log`: verifies direct log file write and persistence
- Workspace verification:
  - `cargo test --workspace`: all 161 unit, integration, and CLI tests passing
  - `cargo clippy --workspace -- -D warnings`: 0 warnings
  - `cargo fmt --check`: 0 formatting issues
  - `pnpm --dir ui typecheck`: 0 TypeScript errors
  - `pnpm --dir ui test`: 204 unit tests passing across 19 test suites
  - `pnpm tauri build --bundles nsis`: successfully produced `target/release/SETLIST.exe` and `target/release/bundle/nsis/SETLIST_0.1.0_x64-setup.exe` (4.58 MiB)
Known gaps:
- None.
Needs from others:
- None.

## Manual Test Checklist

Since the automated agent was instructed not to launch the app directly, the user can verify the new resilience features using this manual checklist:

### 1. Single Instance Verification (Second Launch Focus)
1. Start SETLIST by running `target\release\SETLIST.exe` (or via `pnpm tauri dev`).
2. Minimize the SETLIST window to the Windows Taskbar or click another application to unfocus it.
3. In a separate terminal or Windows Explorer, launch `target\release\SETLIST.exe` a second time.
4. **Expected behavior:** The second process immediately exits; the existing SETLIST window unminimizes and receives active focus in Windows.
5. Inspect `$env:APPDATA\com.setlist.desktop\setlist.log`:
   Confirm entry: `Second instance launch detected; focusing existing main window`.

### 2. Process ID & Clean Exit Logging
1. With SETLIST running, open PowerShell and check the log:
   ```powershell
   Get-Content "$env:APPDATA\com.setlist.desktop\setlist.log" -Tail 20
   ```
2. Verify startup line contains the process ID:
   `SETLIST Desktop Application Starting (PID: <pid>)` and `[STARTUP] SETLIST started (PID: <pid>)`.
3. Verify in Windows Task Manager (Ctrl + Shift + Esc) that the running process is displayed as **SETLIST** (not `app`).
4. Close the application by clicking the window close button (`X`).
5. Check `$env:APPDATA\com.setlist.desktop\setlist.log` again:
   Confirm clean exit entry: `[CLEAN EXIT] SETLIST cleanly exited (PID: <pid>)`.

### 3. Native Error Dialog & Startup Panic Recovery
1. Test webview / startup failure dialog without launching a corrupted build:
   - Temporarily set environment variable or pass an invalid argument / simulate an unrecoverable failure or trigger panic.
   - Alternatively, write a temporary small test binary calling `app_lib::install_panic_hook(); panic!("Manual test panic");`.
2. **Expected behavior:**
   - A native Windows message dialog box titled **"SETLIST - Fatal Error"** (or **"SETLIST - Startup Error"**) pops up immediately using `rfd` (without any webview needed).
   - Dialog shows error description, location, process ID, and full path to `$env:APPDATA\com.setlist.desktop\setlist.log`.
   - After clicking OK, the application exits cleanly with code 1.
   - Inspect `$env:APPDATA\com.setlist.desktop\setlist.log` to confirm `[FATAL PANIC]` or `[STARTUP ERROR]` entry was recorded to disk.
