# fix-desktop-shortcut-and-release-build Update Desktop Shortcut and Release Binary

Status: done
Changed:
- [scripts/make-desktop-shortcut.ps1](file:///c:/Users/User/Documents/%F0%9F%93%82%202_Coding_and_Development/SETLIST/scripts/make-desktop-shortcut.ps1)
- `target/release/SETLIST.exe` (built via `pnpm tauri build --no-bundle`)
- `C:\Users\User\Desktop\SETLIST.lnk`

Added deps: none

Public API: none

Tests:
- Built production Tauri release binary embedding latest `ui/dist` bundle.
- Executed `scripts/make-desktop-shortcut.ps1` with Unicode surrogate pair repair for folder emoji `📂`.
- Verified shortcut resolution with native `IShellLinkW::GetPath`:
  - Target Path: `C:\Users\User\Documents\📂 2_Coding_and_Development\SETLIST\target\release\SETLIST.exe`
  - Target Exists: `True`
  - WorkDir Exists: `True`
  - File Size: `17,944,064` bytes
  - Last Modified: `2026-10-04T17:26:10Z`
- Full test suites passing:
  - `pnpm --dir ui typecheck`
  - `pnpm --dir ui test` (27 files, 310 tests)
  - `cargo test --workspace` (all tests pass)
  - `cargo clippy --workspace -- -D warnings`
  - `cargo fmt --check`

Known gaps: none

Needs from others: none
