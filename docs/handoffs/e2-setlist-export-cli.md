# E2 Setlist Export and CLI
Status: done
Changed:
- crates/exporters/Cargo.toml
- crates/exporters/src/lib.rs
- crates/exporters/src/rekordbox.rs
- crates/exporters/src/m3u8.rs
- crates/exporters/src/set_sheet.rs
- crates/exporters/src/bin/export_cli.rs
- crates/exporters/tests/cli_test.rs
- crates/exporters/tests/fixtures/setlist_fixture.json
- crates/exporters/tests/fixtures/golden_setlist.csv
- crates/exporters/tests/fixtures/golden_setlist.md
- crates/exporters/tests/fixtures/golden_setlist.m3u8
- crates/exporters/tests/fixtures/golden_setlist.xml
- docs/handoffs/e2-setlist-export-cli.md

Added deps:
- `serde = { version = "1.0", features = ["derive"] }` in `crates/exporters`: serialization and deserialization of setlist export input data.
- `serde_json = "1.0"` in `crates/exporters`: parsing input JSON files in `export-cli` and `export_all_formats`.

Public API:
- `exporters`:
  - `pub mod m3u8;`
  - `pub mod rekordbox;`
  - `pub mod set_sheet;`
  - `pub use m3u8::{export_m3u8, export_m3u8_with_options, generate_m3u8, resolve_absolute_path};`
  - `pub use rekordbox::{encode_location, export_rekordbox_xml, export_rekordbox_xml_with_options, format_tonality, generate_rekordbox_xml, parse_hex_color, KeyNotation, ProductInfo, RekordboxExportOptions};`
  - `pub use set_sheet::{export_set_sheet_csv, export_set_sheet_csv_with_options, export_set_sheet_markdown, export_set_sheet_markdown_with_options, generate_set_sheet_csv, generate_set_sheet_markdown, resolve_cues};`
  - `pub enum ExportError { NotImplemented, FileExists(PathBuf), Io(std::io::Error), Failed(String), Json(serde_json::Error) }`
  - `pub struct ExportReport { pub xml_path: PathBuf, pub m3u8_path: PathBuf, pub csv_path: PathBuf, pub markdown_path: PathBuf }`
  - `pub enum SetlistExportData { Named { name: Option<String>, entries: Vec<SetlistEntry> }, List(Vec<SetlistEntry>) }`
  - `pub fn export_all_formats<P: AsRef<Path>, Q: AsRef<Path>>(input_json_path: P, output_dir: Q, custom_name: Option<&str>, overwrite: bool) -> Result<ExportReport, ExportError>`
- Binary `export-cli`:
  - Usage: `export-cli <input_json> <output_dir> [name] [--overwrite | --no-overwrite]`

Tests:
- Golden files for all export formats located in `crates/exporters/tests/fixtures/`:
  - `golden_setlist.xml`
  - `golden_setlist.m3u8`
  - `golden_setlist.csv`
  - `golden_setlist.md`
- `crates/exporters/tests/cli_test.rs`:
  - `test_json_fixture_deserialization`: validates parsing `setlist_fixture.json` into typed `SetlistExportData`.
  - `test_golden_files_match`: validates exact structural matches between generated outputs and golden files across all formats.
  - `test_export_all_formats_programmatic`: tests programmatic execution of `export_all_formats`, checking well-formed XML tag closure via `quick-xml`, M3U8 tags, and CSV/Markdown set sheets.
  - `test_export_cli_end_to_end`: executes the compiled binary `export-cli` against the JSON test fixture, verifying process exit code 0, standard output logging, and output files in target folder.
  - `test_export_cli_missing_args`: verifies helpful CLI usage message on missing arguments.
- Unit tests:
  - `rekordbox`: path encoding, tonality options (Standard vs Camelot), cue num mapping, loop output, overwrite protection.
  - `m3u8`: `#EXTINF` formatting, path resolution, overwrite protection.
  - `set_sheet`: CSV column headers, quote escaping, Markdown table formatting, pipe escaping, cue resolution, overwrite protection.

Known gaps:
- None. All requested export formats and CLI functionality implemented and passing.

Needs from others:
- Traktor NML and Serato exports are out of scope for v1.
