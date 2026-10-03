# Building and Packaging SETLIST on Windows

This document provides step-by-step instructions for building, running, and packaging the **SETLIST** desktop application for Windows 10 and Windows 11 (x64).

---

## 1. System Requirements

- **Operating System:** Windows 10 (version 1903 or higher) or Windows 11 (64-bit).
- **Architecture:** `x86_64` (CPU only; no GPU required for classical DSP v1 analysis).
- **Disk Space:** ~5 GB free disk space for build toolchains and cargo target artifacts.
- **Memory:** 8 GB RAM minimum (16 GB recommended for parallel crate compilation).

---

## 2. Prerequisites & Toolchain Setup

### 2.1 Microsoft C++ Build Tools
SETLIST's Rust core compiles native code and bundles SQLite:
1. Download the [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
2. In the installer, select **Desktop development with C++**.
3. Ensure the following optional components are checked:
   - **MSVC v143 - VS 2022 C++ x64/x86 build tools**
   - **Windows 10/11 SDK**

### 2.2 Rust Toolchain
Install Rust via `rustup`:
1. Download and run `rustup-init.exe` from [rustup.rs](https://rustup.rs/).
2. Select default installation (`x86_64-pc-windows-msvc`).
3. Verify the installation in PowerShell:
   ```powershell
   rustc --version
   cargo --version
   ```

### 2.3 Node.js & pnpm
The frontend is built with React, TypeScript, Vite, and Tailwind:
1. Install **Node.js LTS (v20 or later)** from [nodejs.org](https://nodejs.org/).
2. Enable or install **pnpm** (version 9+):
   ```powershell
   corepack enable
   # or: npm install -g pnpm
   pnpm --version
   ```

### 2.4 Microsoft Edge WebView2
- **Windows 11:** WebView2 is pre-installed out of the box.
- **Windows 10 / Clean VM:** If not present, download the **WebView2 Evergreen Bootstrapper** from [Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/). The Tauri NSIS installer also automatically detects and prompts for WebView2 if missing.

### 2.5 NSIS (Nullsoft Scriptable Install System)
Tauri uses NSIS to generate clean, self-contained Windows setup executables (`.exe`). The Tauri CLI automatically fetches and manages NSIS dependencies during the build, so manual installation is not required.

---

## 3. Repository Setup

1. Open PowerShell and navigate to the project directory:
   ```powershell
   cd "c:\path\to\SETLIST"
   ```

2. Install frontend dependencies:
   ```powershell
   pnpm install
   ```

3. Export TypeScript contracts from Rust (ensures `ui/src/bindings/` is up to date):
   ```powershell
   cargo test -p core-types
   ```

---

## 4. Running in Development Mode

To start SETLIST with hot-reloading for both the React frontend and Rust backend:

```powershell
pnpm tauri dev
```

What to expect:
- Vite starts the local development server at `http://localhost:5173`.
- Cargo builds the debug binary with the Tauri shell.
- A desktop window titled **"SETLIST"** opens with the custom app icon in the title bar and Windows taskbar.
- SQLite database initializes at `%APPDATA%\com.setlist.desktop\library.db`.
- Structured application logs are written to `%APPDATA%\com.setlist.desktop\setlist.log`.

---

## 5. Building the Production Windows Installer

### 5.1 Run the Bundler
To build the optimized release binary and package the Windows NSIS installer:

```powershell
pnpm tauri build --bundles nsis
```

*(Alternatively, `pnpm tauri build` will build all configured targets in `src-tauri/tauri.conf.json`).*

### 5.2 Build Artifacts
Upon completion, the following artifacts are generated in the `target/release/` directory:

| Artifact | Path | Description |
|---|---|---|
| **Windows Installer** | `target\release\bundle\nsis\SETLIST_0.1.0_x64-setup.exe` | Self-contained Windows setup installer (~4.3 MiB). Installs app, registers Start menu / Desktop shortcuts, and uninstaller. |
| **Standalone Executable** | `target\release\SETLIST.exe` | Portable release binary (can be run directly on systems with WebView2). |
| **Unpacked Resources** | `target\release\bundle\nsis\resources\` | Application resources and WebView2 manifests. |

---

## 6. Installing on a Clean Windows Machine

1. Copy `SETLIST_0.1.0_x64-setup.exe` to the target Windows machine.
2. Double-click the installer:
   - Standard Windows UAC prompt (unsigned developer certificate) may appear — click **More info** -> **Run anyway**.
   - Choose installation options (current user or all users).
   - Default install path: `%LOCALAPPDATA%\Programs\SETLIST`.
3. Launch **SETLIST** from the Desktop shortcut or Start Menu:
   - Window title is **"SETLIST"**.
   - Custom icon displays in the taskbar and title bar.
   - Settings route persists user configuration to SQLite.
4. To uninstall:
   - Go to **Windows Settings > Apps > Installed apps**, find **SETLIST**, and click **Uninstall**.

---

## 7. Application Data, Database, and Logging

SETLIST stores all persistent state locally in the user's data directory. No user audio or telemetry is transmitted across the network.

- **Data Directory (App Data):** `%APPDATA%\com.setlist.desktop\`
- **SQLite Database:** `%APPDATA%\com.setlist.desktop\library.db`
  - Stores scanned tracks, DSP features, cues, and app settings.
- **Log File:** `%APPDATA%\com.setlist.desktop\setlist.log`
  - Structured, rotated logs generated by `tauri-plugin-log` capturing scanning status, solver runs, lifecycle PIDs at startup/exit, and error diagnostics.
- **WebView2 Data:** `%LOCALAPPDATA%\com.setlist.desktop\EBWebView\`
  - Runtime cache, indexedDB, and GPU state managed by Microsoft Edge WebView2.

To view live logs in PowerShell:
```powershell
Get-Content "$env:APPDATA\com.setlist.desktop\setlist.log" -Wait -Tail 30
```

---

## 8. App Icon Generation

SETLIST includes a custom 512x512 PNG app icon at `src-tauri/icons/icon.png`. If you modify this source image, regenerate the Windows `.ico` and multi-resolution PNGs with:

```powershell
pnpm tauri icon src-tauri/icons/icon.png
```

This updates:
- `src-tauri/icons/icon.ico` (multi-resolution Windows icon)
- `src-tauri/icons/icon.icns` (macOS icon)
- `src-tauri/icons/Square*Logo.png` and `StoreLogo.png`
- `ui/public/icon.png` (web favicon)

---

## 9. Troubleshooting & FAQ

### Unicode / Emoji in Workspace Paths
- **Symptom:** WiX 3 toolset (`light.exe`) fails with invalid character errors when the repository path contains non-ASCII characters or emoji (e.g. `📂 2_Coding_and_Development`).
- **Solution:** We use the NSIS bundler (`"targets": ["nsis"]` in `tauri.conf.json`), which handles unicode filesystem paths cleanly and produces smaller installers.

### Missing `link.exe` or C++ Compiler Error
- **Symptom:** Cargo fails with `error: linker 'link.exe' not found`.
- **Solution:** Ensure Visual Studio C++ Build Tools are installed with the Windows SDK component, and launch the terminal from the **Developer PowerShell for VS 2022** or ensure MSVC environment variables are in your PATH.

### WebView2 Runtime Not Found
- **Symptom:** Application fails to launch with an error stating WebView2 is not installed.
- **Solution:** Download and install the [Microsoft Edge WebView2 Evergreen Bootstrapper](https://go.microsoft.com/fwlink/p/?LinkId=2124703). On Windows 11 this is pre-installed.
