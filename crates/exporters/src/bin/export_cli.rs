//! CLI tool to export a setlist and analyses in Rekordbox XML, M3U8, CSV, and Markdown.

use exporters::export_all_formats;
use std::env;
use std::path::Path;
use std::process;

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 {
        eprintln!(
            "Usage: export-cli <input_json> <output_dir> [name] [--overwrite | --no-overwrite]"
        );
        process::exit(1);
    }

    let input_path = &args[1];
    let output_dir = &args[2];

    let mut custom_name: Option<&str> = None;
    let mut overwrite = true; // Default to true for CLI convenience

    for arg in &args[3..] {
        if arg == "--overwrite" {
            overwrite = true;
        } else if arg == "--no-overwrite" {
            overwrite = false;
        } else if !arg.starts_with('-') && custom_name.is_none() {
            custom_name = Some(arg.as_str());
        }
    }

    match export_all_formats(
        Path::new(input_path),
        Path::new(output_dir),
        custom_name,
        overwrite,
    ) {
        Ok(report) => {
            println!("Exported setlist to {}:", output_dir);
            println!("  Rekordbox XML: {}", report.xml_path.display());
            println!("  M3U8:          {}", report.m3u8_path.display());
            println!("  CSV Sheet:     {}", report.csv_path.display());
            println!("  Markdown:      {}", report.markdown_path.display());
        }
        Err(err) => {
            eprintln!("Error exporting setlist: {err}");
            process::exit(1);
        }
    }
}
