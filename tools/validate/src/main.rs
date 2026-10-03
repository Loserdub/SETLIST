//! CLI validation harness: analyzes audio folders and benchmarks accuracy against ground truth.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::process;

use validate::{analyze_folder, evaluate_accuracy, generate_csv, parse_ground_truth};

fn print_usage() {
    println!("DJ Set Assistant — Audio Accuracy Validation Harness");
    println!();
    println!("Usage:");
    println!("  validate <AUDIO_FOLDER> [OPTIONS]");
    println!();
    println!("Options:");
    println!("  -g, --ground-truth <FILE>  Path to ground-truth CSV (columns: file, bpm, key)");
    println!("  -o, --output <FILE>        Output path to write analyzed CSV results");
    println!("  -h, --help                 Print this help information");
    println!();
    println!("Output:");
    println!("  When run without --ground-truth, prints analysis CSV to stdout:");
    println!("    file,bpm,key,camelot,lufs,energy");
    println!("  When run with --ground-truth, evaluates accuracy and prints validation report.");
}

struct CliOptions {
    folder: PathBuf,
    ground_truth: Option<PathBuf>,
    output_csv: Option<PathBuf>,
}

fn parse_cli_args() -> Result<CliOptions, String> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        print_usage();
        process::exit(0);
    }

    let mut folder: Option<PathBuf> = None;
    let mut ground_truth: Option<PathBuf> = None;
    let mut output_csv: Option<PathBuf> = None;

    let mut i = 1;
    while i < args.len() {
        let arg = &args[i];
        match arg.as_str() {
            "-h" | "--help" => {
                print_usage();
                process::exit(0);
            }
            "-g" | "--ground-truth" => {
                if i + 1 >= args.len() {
                    return Err("missing argument for --ground-truth".to_string());
                }
                ground_truth = Some(PathBuf::from(&args[i + 1]));
                i += 1;
            }
            "-o" | "--output" => {
                if i + 1 >= args.len() {
                    return Err("missing argument for --output".to_string());
                }
                output_csv = Some(PathBuf::from(&args[i + 1]));
                i += 1;
            }
            other => {
                if other.starts_with('-') {
                    return Err(format!("unknown option: '{other}'"));
                }
                if folder.is_none() {
                    folder = Some(PathBuf::from(other));
                } else {
                    return Err(format!("unexpected additional argument: '{other}'"));
                }
            }
        }
        i += 1;
    }

    let folder = folder.ok_or_else(|| "missing required <AUDIO_FOLDER> argument".to_string())?;

    Ok(CliOptions {
        folder,
        ground_truth,
        output_csv,
    })
}

fn main() {
    let opts = match parse_cli_args() {
        Ok(opts) => opts,
        Err(err) => {
            eprintln!("Error: {err}");
            eprintln!("Run 'validate --help' for usage instructions.");
            process::exit(1);
        }
    };

    if !opts.folder.is_dir() {
        eprintln!(
            "Error: target path is not a directory or does not exist: {}",
            opts.folder.display()
        );
        process::exit(1);
    }

    eprintln!(
        "Scanning and analyzing audio files in: {}...",
        opts.folder.display()
    );
    let rows = match analyze_folder(&opts.folder) {
        Ok(rows) => rows,
        Err(err) => {
            eprintln!("Error analyzing folder: {err}");
            process::exit(1);
        }
    };

    eprintln!("Completed analysis of {} tracks.\n", rows.len());

    let csv_content = generate_csv(&rows);

    // If output path is specified, write CSV to disk
    if let Some(out_path) = &opts.output_csv {
        if let Some(parent) = out_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Err(err) = fs::write(out_path, &csv_content) {
            eprintln!("Error writing CSV to {}: {err}", out_path.display());
            process::exit(1);
        }
        eprintln!("Saved analysis CSV to: {}\n", out_path.display());
    }

    // If ground truth is provided, evaluate accuracy and print report
    if let Some(gt_path) = &opts.ground_truth {
        let gt_content = match fs::read_to_string(gt_path) {
            Ok(content) => content,
            Err(err) => {
                eprintln!(
                    "Error reading ground-truth CSV from {}: {err}",
                    gt_path.display()
                );
                process::exit(1);
            }
        };

        let gt_rows = match parse_ground_truth(&gt_content) {
            Ok(gt) => gt,
            Err(err) => {
                eprintln!("Error parsing ground-truth CSV: {err}");
                process::exit(1);
            }
        };

        let report = evaluate_accuracy(&rows, &gt_rows);
        println!("{report}");
    } else {
        // When no ground truth is provided, print CSV to stdout
        print!("{csv_content}");
    }
}
