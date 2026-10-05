# fix-metadata-scan-bpm-key Metadata Tag Scan for BPM and Key with DSP Fallback

Status: done
Changed:
- `crates/audio-io/src/lib.rs`
- `crates/audio-analysis/src/pipeline.rs`

Added deps: None

Public API:
- `audio_io::extract_metadata_bpm_and_key<P: AsRef<Path>>(path: P) -> (Option<f64>, Option<String>)`
- `audio_analysis::pipeline::parse_initial_key(raw: &str) -> Option<core_types::Key>`

Tests:
- `audio-io`: `test_extract_metadata_bpm_and_key` verifies extraction of ID3v2 BPM and Initial Key, with graceful `(None, None)` fallback when absent.
- `audio-analysis`: `test_parse_initial_key_camelot_and_standard` validates parsing of Camelot ("8A", "11B") and standard notation ("Am", "A minor", "C", "C major", "F#m").
- `audio-analysis`: `test_analyzer_trait_with_metadata_bpm_and_key` verifies end-to-end tag priority over DSP when tags are present in audio files.

Known gaps: None. When metadata tags are absent, analysis defaults to classical DSP without alteration.
Needs from others: None.
