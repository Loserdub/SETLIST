//! CLI validation harness: analyzes audio folders and benchmarks accuracy against ground truth.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::process;

use validate::{
    analyze_folder, evaluate_accuracy, export_ground_truth_from_db, generate_csv,
    parse_ground_truth, sample_unlabeled_tracks_from_db, BaselineMetrics,
};

fn print_usage() {
    println!("SETLIST by TRUSTNODELOGIC — Audio Accuracy Validation Harness");
    println!();
    println!("Usage:");
    println!("  validate <AUDIO_FOLDER> [OPTIONS]");
    println!("  validate --export-ground-truth <DB_PATH> [-o <OUTPUT_CSV>]");
    println!("  validate --sample-unlabeled <DB_PATH> [-n <COUNT>] [-o <OUTPUT_CSV>]");
    println!();
    println!("Options:");
    println!("  -g, --ground-truth <FILE>    Path to ground-truth CSV (columns: file, bpm, key)");
    println!("  -o, --output <FILE>          Output path to write CSV results");
    println!("  --baseline <FILE>            Path to baseline JSON for regression gate");
    println!(
        "  --tolerance <PERCENT>        Allowed regression tolerance percentage (default: 5.0)"
    );
    println!(
        "  --save-baseline <FILE>       Save current evaluation accuracy metrics as baseline JSON"
    );
    println!(
        "  --export-ground-truth <DB>   Export ground truth from library SQLite DB track_overrides"
    );
    println!("  --sample-unlabeled <DB>      Extract stratified sample of unlabeled tracks for annotation");
    println!("  -n, --count <N>              Number of tracks to sample (default: 50)");
    println!("  -h, --help                   Print this help information");
}

struct CliOptions {
    folder: Option<PathBuf>,
    ground_truth: Option<PathBuf>,
    output_csv: Option<PathBuf>,
    baseline: Option<PathBuf>,
    tolerance: f64,
    save_baseline: Option<PathBuf>,
    export_gt_db: Option<PathBuf>,
    sample_db: Option<PathBuf>,
    sample_count: usize,
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
    let mut baseline: Option<PathBuf> = None;
    let mut tolerance = 5.0f64;
    let mut save_baseline: Option<PathBuf> = None;
    let mut export_gt_db: Option<PathBuf> = None;
    let mut sample_db: Option<PathBuf> = None;
    let mut sample_count = 50usize;

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
            "--baseline" => {
                if i + 1 >= args.len() {
                    return Err("missing argument for --baseline".to_string());
                }
                baseline = Some(PathBuf::from(&args[i + 1]));
                i += 1;
            }
            "--tolerance" => {
                if i + 1 >= args.len() {
                    return Err("missing argument for --tolerance".to_string());
                }
                tolerance = args[i + 1]
                    .parse()
                    .map_err(|e| format!("invalid tolerance float: {e}"))?;
                i += 1;
            }
            "--save-baseline" => {
                if i + 1 >= args.len() {
                    return Err("missing argument for --save-baseline".to_string());
                }
                save_baseline = Some(PathBuf::from(&args[i + 1]));
                i += 1;
            }
            "--export-ground-truth" => {
                if i + 1 >= args.len() {
                    return Err("missing argument for --export-ground-truth".to_string());
                }
                export_gt_db = Some(PathBuf::from(&args[i + 1]));
                i += 1;
            }
            "--sample-unlabeled" => {
                if i + 1 >= args.len() {
                    return Err("missing argument for --sample-unlabeled".to_string());
                }
                sample_db = Some(PathBuf::from(&args[i + 1]));
                i += 1;
            }
            "-n" | "--count" => {
                if i + 1 >= args.len() {
                    return Err("missing argument for -n / --count".to_string());
                }
                sample_count = args[i + 1]
                    .parse()
                    .map_err(|e| format!("invalid count integer: {e}"))?;
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

    Ok(CliOptions {
        folder,
        ground_truth,
        output_csv,
        baseline,
        tolerance,
        save_baseline,
        export_gt_db,
        sample_db,
        sample_count,
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

    // 1. Export ground truth from DB overrides table
    if let Some(db_path) = &opts.export_gt_db {
        match export_ground_truth_from_db(db_path) {
            Ok(csv) => {
                let lines_count = csv.lines().count().saturating_sub(1);
                eprintln!(
                    "Exported {} ground-truth corrections from: {}",
                    lines_count,
                    db_path.display()
                );
                if let Some(out_path) = &opts.output_csv {
                    if let Some(parent) = out_path.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    if let Err(err) = fs::write(out_path, &csv) {
                        eprintln!("Error writing CSV to {}: {err}", out_path.display());
                        process::exit(1);
                    }
                    eprintln!("Saved to: {}", out_path.display());
                } else {
                    print!("{csv}");
                }
                return;
            }
            Err(err) => {
                eprintln!("Error exporting ground truth from DB: {err}");
                process::exit(1);
            }
        }
    }

    // 2. Extract stratified sample of unlabeled tracks
    if let Some(db_path) = &opts.sample_db {
        match sample_unlabeled_tracks_from_db(db_path, opts.sample_count) {
            Ok(csv) => {
                let count = csv.lines().count().saturating_sub(1);
                eprintln!(
                    "Generated stratified sample template with {} tracks from: {}",
                    count,
                    db_path.display()
                );
                if let Some(out_path) = &opts.output_csv {
                    if let Some(parent) = out_path.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    if let Err(err) = fs::write(out_path, &csv) {
                        eprintln!("Error writing CSV to {}: {err}", out_path.display());
                        process::exit(1);
                    }
                    eprintln!("Saved to: {}", out_path.display());
                } else {
                    print!("{csv}");
                }
                return;
            }
            Err(err) => {
                eprintln!("Error sampling unlabeled tracks: {err}");
                process::exit(1);
            }
        }
    }

    let folder = match opts.folder {
        Some(f) => f,
        None => {
            eprintln!("Error: missing required <AUDIO_FOLDER> argument.");
            eprintln!("Run 'validate --help' for usage instructions.");
            process::exit(1);
        }
    };

    if !folder.is_dir() {
        eprintln!(
            "Error: target path is not a directory or does not exist: {}",
            folder.display()
        );
        process::exit(1);
    }

    eprintln!(
        "Scanning and analyzing audio files in: {}...",
        folder.display()
    );
    let rows = match analyze_folder(&folder) {
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

        // Save baseline if requested
        if let Some(save_path) = &opts.save_baseline {
            let baseline_metrics = report.to_baseline_metrics();
            let json = serde_json::to_string_pretty(&baseline_metrics).unwrap_or_default();
            if let Some(parent) = save_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if let Err(err) = fs::write(save_path, json) {
                eprintln!("Error saving baseline JSON: {err}");
            } else {
                eprintln!("Saved baseline metrics to: {}", save_path.display());
            }
        }

        // Regression check if baseline is provided
        if let Some(base_path) = &opts.baseline {
            let base_content = match fs::read_to_string(base_path) {
                Ok(c) => c,
                Err(err) => {
                    eprintln!("Error reading baseline file {}: {err}", base_path.display());
                    process::exit(1);
                }
            };
            let baseline_metrics: BaselineMetrics = match serde_json::from_str(&base_content) {
                Ok(m) => m,
                Err(err) => {
                    eprintln!("Error parsing baseline JSON: {err}");
                    process::exit(1);
                }
            };

            if let Err(regression_err) = report.check_regression(&baseline_metrics, opts.tolerance)
            {
                eprintln!("\n❌ REGRESSION GATE FAILED: {regression_err}");
                process::exit(1);
            } else {
                eprintln!("\n✅ REGRESSION GATE PASSED: accuracy within tolerance of baseline.");
            }
        }
    } else {
        // When no ground truth is provided, print CSV to stdout
        print!("{csv_content}");
    }
}
