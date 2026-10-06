//! Criterion benchmarks for CatalogGraph score matrix and summary stats calculation.
//!
//! Evaluates performance on 587 synthetic songs to verify that computing summary stats
//! finishes well under 300 ms.

use std::time::Duration;

use core_types::Song;
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use sequencer::CatalogGraph;

fn generate_synthetic_catalog(count: usize, seed: u64) -> Vec<Song> {
    let mut rng = sequencer::solve::SimpleRng::new(seed);
    let mut songs = Vec::with_capacity(count);
    for i in 0..count {
        let camelot_num = rng.gen_range(1, 13) as u8;
        let camelot_letter = if rng.next_f32() < 0.5 { "A" } else { "B" };
        let camelot_code = format!("{}{}", camelot_num, camelot_letter);
        let bpm = 100.0 + (rng.next_f32() * 50.0) as f64;
        let energy = rng.gen_range(1, 11) as u8;
        songs.push(Song {
            id: format!("song_{:04}", i),
            title: format!("Synthetic Track {}", i),
            artist: "Synthetic Artist".to_string(),
            duration_seconds: 180.0 + (rng.next_f32() * 180.0) as f64,
            bpm: Some(bpm),
            musical_key: Some(camelot_code.clone()),
            mode: None,
            camelot_code: Some(camelot_code),
            tuning: Some("Standard".to_string()),
            capo: Some(0),
            energy_rating: Some(energy),
            lead_performer: None,
            tags: vec!["electronic".to_string(), "house".to_string()],
            notes: None,
        });
    }
    songs
}

fn bench_catalog_summary_stats(c: &mut Criterion) {
    let songs = generate_synthetic_catalog(587, 42);

    let mut group = c.benchmark_group("summary_stats_587");
    group.measurement_time(Duration::from_secs(3));
    group.sample_size(15);

    // Summary stats calculation on precomputed graph (reads from ScoreMatrix)
    let prebuilt_graph = CatalogGraph::new(songs.clone());
    group.bench_function("summary_stats_cached_matrix", |b| {
        b.iter(|| black_box(prebuilt_graph.get_catalog_summary_stats()))
    });

    // End-to-end: full graph & score matrix build + summary stats calculation
    group.bench_function("summary_stats_end_to_end_build", |b| {
        b.iter(|| {
            let graph = CatalogGraph::new(black_box(songs.clone()));
            black_box(graph.get_catalog_summary_stats())
        })
    });

    group.finish();
}

criterion_group!(benches, bench_catalog_summary_stats);
criterion_main!(benches);
