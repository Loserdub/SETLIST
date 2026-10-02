# 008-rekordbox-export Pioneer Rekordbox XML Writer
Status: done
Changed:
- crates/exporters/Cargo.toml
- crates/exporters/src/lib.rs
- crates/exporters/src/rekordbox.rs
- docs/EXPORT_REKORDBOX.md
- docs/handoffs/008-rekordbox-export.md

Added deps:
- `quick-xml = "0.37"` in `crates/exporters`: high-performance, memory-efficient XML serialization and validation.

Public API:
- `exporters`:
  - `pub mod rekordbox;`
  - `pub use rekordbox::{encode_location, format_tonality, generate_rekordbox_xml, parse_hex_color, KeyNotation, ProductInfo, RekordboxExportOptions};`
  - `pub enum ExportError { NotImplemented, FileExists(PathBuf), Io(std::io::Error), Failed(String) }`
  - `pub fn export_rekordbox_xml<P: AsRef<Path>>(entries: &[SetlistEntry], output_path: P) -> Result<(), ExportError>`
  - `pub fn export_rekordbox_xml_with_options<P: AsRef<Path>>(entries: &[SetlistEntry], output_path: P, options: &RekordboxExportOptions) -> Result<(), ExportError>`
  - `pub fn generate_rekordbox_xml(entries: &[SetlistEntry], options: &RekordboxExportOptions) -> Result<String, ExportError>`
  - `pub fn encode_location<P: AsRef<Path>>(path: P) -> String`
  - `pub fn format_tonality(key: &Key, notation: KeyNotation) -> String`
  - `pub fn parse_hex_color(hex_str: &str) -> (u8, u8, u8)`

Implementation details:
- Generates a Pioneer-compatible `DJ_PLAYLISTS` XML document with `PRODUCT`, `COLLECTION`, `TRACK`, `TEMPO`, `POSITION_MARK`, and `PLAYLISTS` elements.
- `TEMPO`: `Inizio` set to first downbeat in seconds (3 decimal places), `Bpm` formatted with 2 decimal places, `Metro="4/4"`, `Battito="1"`.
- `POSITION_MARK`:
  - Hot cues: `Type="0"`, `Num="0"` through `Num="7"`.
  - Memory cues: `Type="0"`, `Num="-1"`.
  - Loops: `Type="4"`, with start and `End` in seconds (3 decimal places), and `Num` register.
  - Colors: converts cue `#RRGGBB` hex string into `Red`, `Green`, `Blue` integer attributes (0..255).
- `Location`: converts filesystem paths into `file://localhost/` URIs with RFC 3986 percent-encoding, handling Windows drive letters (`C:`), spaces, Unicode symbols, and path separators.
- `Tonality`: defaults to standard notation (e.g. `Am`, `C`, `F#m`) with an option for Camelot notation (`8A`, `8B`).
- Overwrite protection: prevents accidental file destruction unless `options.overwrite == true`.

Tests:
- `test_reparse_with_quick_xml`: parses generated XML with `quick_xml::Reader`, verifying document well-formedness, tag closures, and presence of all required Rekordbox XML nodes.
- `test_golden_file_match`: verifies exact XML structure and attribute matching against expected golden template.
- `test_path_encoding_cases`: validates Windows drive letters, spaces, ampersands, hashes, pluses, parentheses, Unicode emojis (`📂`), and Unix paths.
- `test_num_mapping_and_loop_output`: validates HotCue num mapping (0..7), memory cue (-1), loop cue Type 4 with `End` attribute, and RGB color attributes.
- `test_tonality_notation_option`: validates output under both `KeyNotation::Standard` ("Am") and `KeyNotation::Camelot` ("8A").
- `test_overwrite_protection`: verifies `ExportError::FileExists` is returned when destination exists without overwrite, and succeeds when overwrite is true.

Known gaps:
- None for Rekordbox XML export.

Needs from others:
- Verification note: The Tonality and Camelot display behavior must be verified in a real Rekordbox import.
