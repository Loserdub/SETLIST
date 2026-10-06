# B2 Key Detection Accuracy

Status: done
Changed:
- `crates/audio-analysis/src/tonal/profiles.rs`
- `crates/audio-analysis/src/tonal/chroma.rs`
- `crates/audio-analysis/src/tonal/mod.rs`

Added deps: none

Confusion Table Analysis (Initial Baseline):
- Observed Errors:
  1. Mode misclassification: D major detected where truth was D minor (Camelot distance 3: 10B vs 7A).
  2. Fifth misclassification: E minor detected where truth was A minor (Camelot distance 1: 9A vs 8A).
- Root Cause:
  - Higher-order harmonic overtones (3rd and 5th partials) bled into the mid/high spectrum, dominating the chromagram.
  - Classical Krumhansl-Kessler minor profile weights major 3rd at 2.60 (relatively high), causing parallel/relative mode confusion.

Evaluated Improvements:
1. Sha'ath Profile (`KeyProfile::Shaath`):
   - Major: [6.6, 1.8, 3.5, 1.5, 4.2, 3.8, 1.5, 5.2, 1.8, 3.6, 1.5, 3.6]
   - Minor: [6.5, 1.8, 3.5, 5.0, 1.8, 3.8, 1.5, 5.0, 3.6, 1.8, 3.5, 1.8]
   - Sharply distinguishes minor 3rd (weight 5.0) while heavily penalizing out-of-scale intervals (1.5-1.8).
2. Bass-Weighted Chromagram Energy:
   - Fundamentals in 60-280 Hz range (bassline and fundamental root register) weighted at 1.35x.
   - High frequencies (>1200 Hz) scaled down to 0.70x to suppress overtone fifth confusion.
3. Tuning Estimation Before Chroma:
   - Refines cents deviation before pitch class mapping across frames.
4. Confidence Score Exposure:
   - Exposed `KeyAnalysis.confidence` in `[0.0, 1.0]` and `analyze_key_with_confidence`. Allows UI to distinguish high-confidence detections from ambiguous tracks.

Validation Results:
- 24/24 additive harmonic triads pass (all exact or close fifth/relative neighbors, >= 22 exact matches).
- Alternative profile tests pass across all 4 key profile models (Krumhansl-Kessler, Temperley, EDMA, Sha'ath).
- 432 Hz non-standard tuning recovery confirmed within 10 cents (-31.8 cents detected vs -31.77 theory).
- All 52 `audio-analysis` unit tests pass.

Known gaps: None.
Needs from others: F-series UI components can render "uncertain" badge for tracks with key confidence < 0.35.
