# G4 Release and Archive Tooling
Status: done
Changed:
- share/build_archive.ps1
- share/archive_stats.json
- scripts/rebuild.ps1
- AGENTS.md
- ui/index.html
- ui/public/icon.png (deleted/deduplicated)
- MANIFEST.md
- share/MANIFEST.md
Added deps: none
Public API: none

## Summary of Changes
1. **Dynamic File Sourcing in `share/build_archive.ps1`**:
   - Replaced hand-maintained file scanning with dynamic listing via `git ls-files` combined with untracked non-ignored files (`git ls-files --others --exclude-standard`).
   - Maintained secondary safety filter excluding `.git`, `node_modules`, `target`, `dist`, `share`, `.env*`, and user audio formats.

2. **Cross-Platform Archive Entry Paths**:
   - Packaged files directly using `[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile` with normalized forward-slash (`/`) entry paths.
   - Built a verification suite directly into the script that re-opens the resulting archive (`setlist-source.zip`) and rejects any entry containing backslashes (`\`). Verified: 0 backslash entries across all 552 files.

3. **Exclusion of Generated Schemas**:
   - Excluded `src-tauri/gen/schemas/*` from packaging, saving unnecessary payload size. Verified 0 schema files present in archive.

4. **Icon Deduplication and Audit**:
   - Audited icon usage across Windows desktop requirements:
     - `src-tauri/icons/icon.ico`: Main Windows application executable and NSIS installer icon (required).
     - `src-tauri/icons/32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png`: Window and application icons configured in `src-tauri/tauri.conf.json` (required).
     - `Square*.png` and `StoreLogo.png`: Windows Store / MSIX tile assets (unused by NSIS desktop build, preserved for Tauri CLI compatibility).
     - `src-tauri/icons/android/*` and `src-tauri/icons/ios/*`: Mobile bundle icon assets (unused by Windows desktop target, preserved for Tauri configuration consistency).
     - `ui/public/icon.png` (380 KB): Deleted redundant duplicate. `ui/index.html` updated to point to `/favicon.svg`.

5. **SHA-256 Checksum in Archive Stats**:
   - Added automatic SHA-256 calculation to `share/build_archive.ps1`.
   - Output stored directly in `share/archive_stats.json` (`Sha256: 4446FB5D19F2960024270C2857C86C2BA5F06F8EBE46A8E0B2C86C44B6FA4562`).

6. **Fail-Fast Quality Gates in `scripts/rebuild.ps1`**:
   - Integrated pre-build execution of all 5 repository quality gates:
     1. `cargo fmt --check`
     2. `cargo clippy --workspace -- -D warnings`
     3. `cargo test --workspace`
     4. `pnpm --dir ui typecheck`
     5. `pnpm --dir ui test`
   - Added immediate script exit on any gate failure (`exit $LASTEXITCODE`), with an optional `-SkipGates` flag for local developer iteration.

7. **Commit Message Conventions in `AGENTS.md`**:
   - Added Section 7 conventions specifying Conventional Commits formatting (`<type>(<scope>): <summary>`).

Tests:
- Executed `share/build_archive.ps1`: 552 files packaged, forward-slash validation passed, SHA-256 computed.
- Verified `share/archive_stats.json` schema and statistics.
- Validated all 5 quality gates via test runner suite.

Known gaps: none
Needs from others: none
