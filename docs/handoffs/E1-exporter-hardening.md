# E1 Exporter Hardening
Status: done
Changed:
- `crates/exporters/src/rekordbox.rs`
- `crates/exporters/src/m3u8.rs`
- `crates/exporters/src/set_sheet.rs`
- `crates/exporters/src/lib.rs`
Added deps: none
Public API:
- `M3u8PathMode`: enum `{ Absolute, Relative }`
- `generate_m3u8_with_mode(entries: &[SetlistEntry], mode: M3u8PathMode, playlist_dir: Option<&Path>) -> String`
- `export_m3u8_with_mode(entries: &[SetlistEntry], path: &Path, overwrite: bool, mode: M3u8PathMode) -> Result<(), ExporterError>`
- `CsvExportOptions`: struct `{ include_bom: bool }`
- `generate_set_sheet_csv_with_bom(entries: &[SetlistEntry], include_bom: bool) -> String`
- `export_set_sheet_csv_full(entries: &[SetlistEntry], path: &Path, overwrite: bool, options: &CsvExportOptions) -> Result<(), ExporterError>`

Tests:
- `rekordbox::tests::test_windows_extended_paths_and_unicode_uris`: Verifies URI encoding for Windows drive letters (`file://localhost/C:/...`), verbatim/extended prefixes (`\\?\C:\...` stripped to valid URI), UNC paths, and unicode/emoji filenames (`🎧 Dance #1.mp3`).
- `rekordbox::tests::test_attribute_escaping_and_markup`: Validates XML attribute escaping and tolerance for markup characters (`<`, `>`, `&`, `"`, `'`) and very long string values (>1000 characters).
- `rekordbox::tests::test_rekordbox_strict_round_trip`: Full round-trip parsing with `quick_xml::Reader` to verify strict XML compliance, element ordering, track count, BPM, and Camelot keys.
- `m3u8::tests::test_m3u8_relative_path_mode`: Validates relative and absolute path computation across directories and Windows drive roots.
- `m3u8::tests::test_m3u8_newline_sanitization`: Verifies that multiline title and artist tags in `#EXTINF` are sanitized to single lines.
- `set_sheet::tests::test_csv_utf8_bom`: Verifies UTF-8 BOM (`\u{FEFF}`) prepending for Excel compatibility.
- `set_sheet::tests::test_csv_and_markdown_markup_and_newlines`: Validates CSV RFC 4180 quoting for newlines/quotes and Markdown table row sanitization (pipes and newlines replaced/escaped).

Known gaps:
- none

Needs from others:
- none
