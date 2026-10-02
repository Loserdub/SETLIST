use exporters::{export_all_formats, SetlistExportData};
use quick_xml::events::Event;
use quick_xml::Reader;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn get_fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("setlist_fixture.json")
}

#[test]
fn test_json_fixture_deserialization() {
    let fixture_path = get_fixture_path();
    let content = fs::read_to_string(&fixture_path).expect("failed to read fixture JSON");
    let data: SetlistExportData =
        serde_json::from_str(&content).expect("failed to deserialize fixture JSON");

    assert_eq!(data.name(), Some("Club Night Set"));
    assert_eq!(data.entries().len(), 2);

    let e1 = &data.entries()[0];
    assert_eq!(e1.position, 1);
    assert_eq!(
        e1.track.as_ref().unwrap().tags.title.as_deref(),
        Some("Alpha Intro")
    );
    assert_eq!(
        e1.track.as_ref().unwrap().tags.artist.as_deref(),
        Some("DJ Alpha")
    );

    let e2 = &data.entries()[1];
    assert_eq!(e2.position, 2);
    assert_eq!(
        e2.track.as_ref().unwrap().tags.title.as_deref(),
        Some("Beta Peak")
    );
    assert!(e2.transition.is_some());
}

#[test]
fn test_export_all_formats_programmatic() {
    let fixture_path = get_fixture_path();
    let temp_dir = std::env::temp_dir().join("exporters_programmatic_test");
    if temp_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
    }

    let report = export_all_formats(&fixture_path, &temp_dir, Some("Test_Setlist"), true)
        .expect("export_all_formats failed");

    assert!(report.xml_path.exists());
    assert!(report.m3u8_path.exists());
    assert!(report.csv_path.exists());
    assert!(report.markdown_path.exists());

    // 1. Verify Rekordbox XML
    let xml_content = fs::read_to_string(&report.xml_path).unwrap();
    assert!(xml_content.contains("<DJ_PLAYLISTS Version=\"1.0.0\">"));
    assert!(xml_content.contains("<COLLECTION Entries=\"2\">"));
    assert!(xml_content.contains("Name=\"Alpha Intro\""));
    assert!(xml_content.contains("Name=\"Beta Peak\""));
    assert!(
        xml_content.contains("<NODE Name=\"Test_Setlist\" Type=\"1\" KeyType=\"0\" Entries=\"2\">")
    );
    assert!(xml_content.contains("<TRACK Key=\"1\"/>"));
    assert!(xml_content.contains("<TRACK Key=\"2\"/>"));

    // Verify well-formedness with quick-xml
    let mut reader = Reader::from_str(&xml_content);
    let mut depth = 0;
    while let Ok(event) = reader.read_event() {
        match event {
            Event::Start(_) => depth += 1,
            Event::End(_) => depth -= 1,
            Event::Eof => break,
            _ => {}
        }
    }
    assert_eq!(depth, 0);

    // 2. Verify M3U8
    let m3u8_content = fs::read_to_string(&report.m3u8_path).unwrap();
    assert!(m3u8_content.starts_with("#EXTM3U\n"));
    assert!(m3u8_content.contains("#EXTINF:180,DJ Alpha - Alpha Intro\n"));
    assert!(m3u8_content.contains("#EXTINF:240,DJ Beta - Beta Peak\n"));

    // 3. Verify CSV
    let csv_content = fs::read_to_string(&report.csv_path).unwrap();
    assert!(csv_content.starts_with(
        "Order,Title,Artist,BPM,Camelot Key,Energy,Transition Type,Recommended Bars,Out Cue,In Cue\n"
    ));
    assert!(csv_content.contains("1,Alpha Intro,DJ Alpha,124.0,8A,5,-,-,-,-\n"));
    assert!(csv_content.contains("2,Beta Peak,DJ Beta,126.0,9A,8,Fifth,16,G,A\n"));

    // 4. Verify Markdown
    let md_content = fs::read_to_string(&report.markdown_path).unwrap();
    assert!(md_content.contains("# DJ Set Sheet\n\n"));
    assert!(md_content.contains(
        "| Order | Title | Artist | BPM | Camelot Key | Energy | Transition Type | Recommended Bars | Out Cue | In Cue |\n"
    ));
    assert!(
        md_content.contains("| 1 | Alpha Intro | DJ Alpha | 124.0 | 8A | 5 | - | - | - | - |\n")
    );
    assert!(
        md_content.contains("| 2 | Beta Peak | DJ Beta | 126.0 | 9A | 8 | Fifth | 16 | G | A |\n")
    );

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_export_cli_end_to_end() {
    let fixture_path = get_fixture_path();
    let temp_dir = std::env::temp_dir().join("exporters_cli_e2e_test");
    if temp_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
    }
    fs::create_dir_all(&temp_dir).unwrap();

    let exe = env!("CARGO_BIN_EXE_export-cli");

    // Execute export-cli: <input_json> <output_dir> [custom_name]
    let output = Command::new(exe)
        .arg(&fixture_path)
        .arg(&temp_dir)
        .arg("Festival_Mix")
        .output()
        .expect("failed to execute export-cli");

    assert!(
        output.status.success(),
        "export-cli failed with stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Exported setlist to"));
    assert!(stdout.contains("Rekordbox XML"));
    assert!(stdout.contains("M3U8"));
    assert!(stdout.contains("CSV Sheet"));
    assert!(stdout.contains("Markdown"));

    // Verify generated files
    let xml_file = temp_dir.join("Festival_Mix.xml");
    let m3u8_file = temp_dir.join("Festival_Mix.m3u8");
    let csv_file = temp_dir.join("Festival_Mix.csv");
    let md_file = temp_dir.join("Festival_Mix.md");

    assert!(xml_file.exists());
    assert!(m3u8_file.exists());
    assert!(csv_file.exists());
    assert!(md_file.exists());

    // Verify XML file contents
    let xml = fs::read_to_string(&xml_file).unwrap();
    assert!(xml.contains("<NODE Name=\"Festival_Mix\" Type=\"1\" KeyType=\"0\" Entries=\"2\">"));
    assert!(xml.contains("<TRACK Key=\"1\"/>"));
    assert!(xml.contains("<TRACK Key=\"2\"/>"));

    // Verify M3U8
    let m3u8 = fs::read_to_string(&m3u8_file).unwrap();
    assert!(m3u8.contains("#EXTINF:180,DJ Alpha - Alpha Intro"));
    assert!(m3u8.contains("#EXTINF:240,DJ Beta - Beta Peak"));

    // Verify CSV
    let csv = fs::read_to_string(&csv_file).unwrap();
    assert!(csv.contains("1,Alpha Intro,DJ Alpha,124.0,8A,5,-,-,-,-\n"));
    assert!(csv.contains("2,Beta Peak,DJ Beta,126.0,9A,8,Fifth,16,G,A\n"));

    // Verify Markdown
    let md = fs::read_to_string(&md_file).unwrap();
    assert!(md.contains("| 1 | Alpha Intro | DJ Alpha | 124.0 | 8A | 5 | - | - | - | - |"));
    assert!(md.contains("| 2 | Beta Peak | DJ Beta | 126.0 | 9A | 8 | Fifth | 16 | G | A |"));

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_export_cli_missing_args() {
    let exe = env!("CARGO_BIN_EXE_export-cli");

    // Execute export-cli with no args
    let output = Command::new(exe)
        .output()
        .expect("failed to execute export-cli");

    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Usage: export-cli"));
}

#[test]
fn test_golden_files_match() {
    let fixture_path = get_fixture_path();
    let fixtures_dir = fixture_path.parent().unwrap();

    let content = fs::read_to_string(&fixture_path).expect("failed to read fixture JSON");
    let data: SetlistExportData =
        serde_json::from_str(&content).expect("failed to deserialize fixture JSON");

    // CSV golden match
    let generated_csv = exporters::generate_set_sheet_csv(data.entries());
    let golden_csv =
        fs::read_to_string(fixtures_dir.join("golden_setlist.csv")).expect("read golden csv");
    assert_eq!(
        generated_csv.replace("\r\n", "\n"),
        golden_csv.replace("\r\n", "\n")
    );

    // Markdown golden match
    let generated_md = exporters::generate_set_sheet_markdown(data.entries(), None);
    let golden_md =
        fs::read_to_string(fixtures_dir.join("golden_setlist.md")).expect("read golden md");
    assert_eq!(
        generated_md.replace("\r\n", "\n"),
        golden_md.replace("\r\n", "\n")
    );

    // M3U8 golden match
    let generated_m3u8 = exporters::generate_m3u8(data.entries());
    let golden_m3u8 =
        fs::read_to_string(fixtures_dir.join("golden_setlist.m3u8")).expect("read golden m3u8");
    assert_eq!(
        generated_m3u8.replace("\r\n", "\n"),
        golden_m3u8.replace("\r\n", "\n")
    );

    // XML golden match
    let opts = exporters::RekordboxExportOptions {
        playlist_name: data.name().unwrap_or("SETLIST").to_string(),
        ..Default::default()
    };
    let generated_xml =
        exporters::generate_rekordbox_xml(data.entries(), &opts).expect("generate xml");
    let golden_xml =
        fs::read_to_string(fixtures_dir.join("golden_setlist.xml")).expect("read golden xml");
    assert_eq!(
        generated_xml.replace("\r\n", "\n"),
        golden_xml.replace("\r\n", "\n")
    );
}
