# C3 Fast, Safe Rescans

Status: done
Changed:
- `crates/library-db/src/scan/mod.rs`
- `crates/library-db/src/repo.rs`

Added deps: none

Public API:
- `scan_paths_with_progress<P, A, F>(conn, paths, analyzer, config, cancel_token, event_sender, progress)`: Extended scanner entry point taking an optional progress callback `F: FnMut(f32)`.
- `Scanner::scan_paths_with_progress`: Associated helper method on `Scanner`.

Features & Improvements:
1. Fast Incremental Rescan:
   - For every discovered file, queries SQLite for `path`, `file_size`, `file_mtime`, and `analysis_version` before computing BLAKE3 hashes.
   - If metadata matches an analyzed track, hashing and DSP analysis are skipped completely.
   - Rescanning an unchanged 587-track library completes in milliseconds without reading multi-megabyte chunks from disk.
2. Cooperative Cancellation & Progress Reporting:
   - Progress is reported smoothly as a float `[0.0, 1.0]` across both skip evaluation and worker pool execution phases.
   - Cancellation token aborts processing at loop boundaries without committing partial worker transactions.
3. Unicode, Emoji, and Space Path Support:
   - Verified folder and file paths with emoji and unicode (e.g. `"📂 2_Coding_and_Development/🎧 DJ Sets 2026/track ü ö é.mp3"`).
   - Preserves exact path strings and handles rescanning cleanly.
4. Drive Letter & Missing Drive Safety:
   - Missing drives mid-scan or via `check_library_availability` set `is_available = 0` without deleting analysis data or metadata.
   - Zero writes to user audio folders or source files.

Tests:
- `test_rescan_unchanged_library_fast_skip`: verifies 5 tracks scanned once, then rescanned with 0 succeeded and 5 skipped.
- `test_scan_paths_emoji_and_non_ascii_folder`: verifies unicode and emoji paths.
- `test_missing_drive_marks_unavailable_preserves_analysis`: verifies missing drive marks track unavailable while preserving full analysis.
- `test_scan_paths_with_progress_monotonic`: verifies progress values are monotonic in `[0.0, 1.0]` ending at 1.0.

Known gaps: None.
Needs from others: G1 will wire `progress` and `cancellation` through Tauri commands.
