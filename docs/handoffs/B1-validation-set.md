# B1 Real Validation Set from Corrections

Status: done
Changed:
- `tools/validate/Cargo.toml`
- `tools/validate/src/lib.rs`
- `tools/validate/src/main.rs`

Added deps:
- `rusqlite` (version 0.40, bundled): To query user overrides and tracks directly from the SQLite database.
- `serde`, `serde_json`: To serialize and deserialize baseline accuracy metrics for regression gating.

Public API & CLI:
- `validate --export-ground-truth <DB_PATH> [-o <OUTPUT_CSV>]`: Exports user-corrected ground truth from SQLite `track_overrides` joined with `tracks` into CSV format `file,bpm,key,source`.
- `validate --sample-unlabeled <DB_PATH> [-n <COUNT>] [-o <OUTPUT_CSV>]`: Stratified sampling across tempo (<115, 115-130, >130), mode (A/B), and loudness (<-14, -14 to -9, >-9 LUFS) generating annotation templates.
- `validate <AUDIO_FOLDER> -g <GT_CSV> --baseline <BASELINE_JSON> [--tolerance 5.0]`: Runs validation and fails with exit code 1 if BPM within +/-0.5 or key exact match accuracy drops more than tolerance versus baseline.
- `validate <AUDIO_FOLDER> -g <GT_CSV> --save-baseline <BASELINE_JSON>`: Saves current accuracy evaluation metrics as baseline JSON.
- `ValidationReport`: Now reports sample size explicitly (`Sample Size: X tracks`) and emits `⚠️ [CONFIDENCE FLAG: Sample size (<20 tracks) is below 20 tracks. Accuracy statistics have high variance.]` when matched tracks < 20.

Tests:
- `test_export_ground_truth_from_connection`: verifies correct export of BPM and Camelot key overrides.
- `test_sample_unlabeled_tracks_from_connection`: verifies stratified sampling across strata and CSV template output.
- `test_regression_detection_and_gating`: verifies `check_regression` passes when within tolerance and errors when accuracy drops.
- `test_evaluate_accuracy_metrics`: verifies low confidence warning on small sample sizes.
- Verified end-to-end execution on a temporary copy of the 587-track library database (`library.db`).

Known gaps: None.
Needs from others: None.
