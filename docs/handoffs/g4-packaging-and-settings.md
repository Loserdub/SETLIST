# g4-packaging-and-settings Packaging, App Icon, Settings Route, and Windows Installer
Status: done
Changed:
- `crates/core-types/src/types.rs`
- `crates/library-db/migrations/0003_app_settings.sql`
- `crates/library-db/src/migrate.rs`
- `crates/library-db/src/repo.rs`
- `crates/library-db/src/lib.rs`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `src-tauri/src/lib.rs`
- `src-tauri/src/commands.rs`
- `src-tauri/icons/icon.png`
- `src-tauri/icons/icon.ico`
- `src-tauri/icons/icon.icns`
- `src-tauri/icons/*Logo.png`
- `src-tauri/tests/integration_test.rs`
- `ui/index.html`
- `ui/public/icon.png`
- `ui/src/bindings/AppSettings.ts`
- `ui/src/bindings/KeyPenaltyRow.ts`
- `ui/src/bindings/EnergyModelSettings.ts`
- `ui/src/api/index.ts`
- `ui/src/store/useAppStore.ts`
- `ui/src/components/routes/SettingsRoute.tsx`
- `ui/tests/SettingsRoute.test.tsx`
- `docs/BUILD_WINDOWS.md`
Added deps:
- `crates/core-types`: none (used existing `serde` and `ts-rs` for `AppSettings`, `KeyPenaltyRow`, `EnergyModelSettings`)
- `src-tauri`: none (leveraged existing `tauri-plugin-log = "2"`)
- `ui`: none
Public API:
- Rust contracts (`crates/core-types`):
  - `pub struct KeyPenaltyRow { pub distance: u32, pub same_mode: f64, pub mode_flip: f64 }`
  - `pub struct EnergyModelSettings { pub divisor: f64, pub target_step: f64 }`
  - `pub struct AppSettings { pub w_tempo: f64, pub w_key: f64, pub w_energy: f64, pub w_timbre: f64, pub key_penalties: Vec<KeyPenaltyRow>, pub energy_model: EnergyModelSettings, pub worker_count: u32 }`
  - `impl Default for AppSettings`
- Database (`crates/library-db`):
  - `pub fn load_settings(conn: &rusqlite::Connection) -> Result<AppSettings, DbError>`
  - `pub fn save_settings(conn: &rusqlite::Connection, settings: &AppSettings) -> Result<(), DbError>`
- Tauri commands (`src-tauri`):
  - `pub fn get_settings(state: State<AppState>) -> Result<AppSettings, String>`
  - `pub fn save_settings(settings: AppSettings, state: State<AppState>) -> Result<(), String>`
- Frontend API (`ui/src/api/index.ts`):
  - `Backend.getSettings(): Promise<AppSettings>`
  - `Backend.saveSettings(settings: AppSettings): Promise<void>`
- Frontend Store (`ui/src/store/useAppStore.ts`):
  - `appSettings: AppSettings`
  - `loadSettings(): Promise<void>`
  - `saveSettings(): Promise<void>`
  - `updateSettings(updater: (prev: AppSettings) => AppSettings): void`
Tests:
- Rust unit tests:
  - `crates/core-types/tests/types_test.rs`: ts-rs type export verification
  - `crates/library-db/src/lib.rs`: `test_settings_persistence_roundtrip` (validates migration 0003, default loading, saving custom values, round-trip serialization)
  - `src-tauri/tests/integration_test.rs`: `test_settings_tauri_commands_roundtrip` (exercises state and command persistence)
- UI unit tests:
  - `ui/tests/SettingsRoute.test.tsx`:
    - Renders settings header, cost weight sliders (Tempo, Key, Energy, Timbre), and sum indicator
    - Renders full 7-row Camelot key penalty table (d=0..6 with Same Mode and Mode Flip)
    - Renders energy model inputs (divisor and target_step) and worker count input
    - Updates cost weights, key penalties, energy parameters, and worker count
    - Resets settings to default values
    - Persists settings to backend database on "Save to Database" click and displays success toast
- Workspace suite validation:
  - `cargo test --workspace`: all 159 tests passing
  - `cargo clippy --workspace -- -D warnings`: 0 warnings
  - `cargo fmt --check`: 0 formatting issues
  - `pnpm --dir ui typecheck`: 0 errors
  - `pnpm --dir ui test`: 122 tests passing across 11 test suites
Known gaps:
- Automatic WiX MSI packaging is bypassed in favor of NSIS setup exe due to WiX 3 `light.exe` failing on paths containing unicode emoji (`📂`). NSIS provides a superior 4.31 MiB installer.
Needs from others:
- None. Application is fully packaged with custom icon, settings route, structured file logging, and Windows installer.
