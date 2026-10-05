# r3-docs-license-validation Architecture, Readme, License & Real-Music Validation

Status: done

Changed:
- `AGENTS.md`: Updated product name (SETLIST), added new modules (playback crate, track overrides including title and artist, catalog relationship engine, Song and SetlistItem models, setlist persistence, Stage Mode, validate tool, CostModelConfig, Start screen, diagnostics) while preserving all locked decisions and command rules.
- `docs/ARCHITECTURE.md`: Authored single-page comprehensive system architecture document containing crate dependency diagram, end-to-end data flow (scan -> decode -> DSP -> SQLite WAL -> IPC -> UI -> playback -> export), and complete Tauri IPC command mapping.
- `README.md`: Updated with 3-sentence summary of SETLIST, run/build instructions, data storage locations (`%APPDATA%\com.setlist.desktop` and `%LOCALAPPDATA%\com.setlist.desktop\EBWebView`), and verification commands.
- `docs/DOMAIN_AND_PERSISTENCE_AUDIT.md`: Moved from workspace root into `docs/`.
- `LICENSE`: Replaced TODO with all-rights-reserved proprietary notice for TRUSTNODELOGIC (2026) matching in-app notices. *Note: The owner should have this legal text reviewed by qualified legal counsel.*
- `Music Sample and csv/New Text Document.txt`: Populated ground-truth CSV with `file,bpm,key` columns matching sample tracks.
- `share/validation.csv`: Generated output from release `tools/validate` analysis.
- `share/validation-report.md`: Audio accuracy evaluation report documenting tracks analyzed, 0 decode failures, BPM accuracy, key accuracy, worst files, and average analysis speed.
- `docs/handoffs/r3-docs-license-validation.md`: This handoff document.

Added deps: none

Public API:
- No code API changes made. Documentation, licensing, and validation reports only.

Tests:
- Offline Real-Music Validation (`tools/validate` on `Music Sample and csv`):
  - 3 tracks analyzed, 0 decode failures.
  - BPM within +/-0.5: 3 / 3 (100.0%)
  - BPM correct up to an octave: 3 / 3 (100.0%)
  - Exact key match: 1 / 3 (33.3%)
  - Camelot-adjacent (d <= 1): 2 / 3 (66.7%)
  - Average analysis time per track: ~1.3 seconds / track
- Verification suite:
  - `cargo fmt --check`: passed (clean).
  - `cargo clippy --workspace -- -D warnings`: passed (clean).
  - `cargo test --workspace`: passed.
  - `pnpm --dir ui typecheck`: passed.
  - `pnpm --dir ui test`: passed.

Known gaps:
- none.

Needs from others:
- Project owner: Review the proprietary all-rights-reserved license text in `LICENSE` with legal counsel if required.
