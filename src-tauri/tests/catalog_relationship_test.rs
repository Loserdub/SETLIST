//! Integration tests for Workgroup 3 Catalog Relationship Engine.

use app_lib::state::AppState;
use core_types::{
    BridgeRole, CatalogCluster, CatalogOpenersAndClosers, Mode, OverallCompatibility, Song,
    SongRelationship, SongRelationshipsResponse, TransitionClassification,
};
use sequencer::CatalogGraph;
use tempfile::tempdir;

fn setup_test_app() -> (AppState, tempfile::TempDir) {
    let dir = tempdir().expect("create temp dir");
    let db_path = dir.path().join("test_library.db");
    let state = AppState::new(db_path).expect("initialize app state");
    (state, dir)
}

fn make_test_song(
    id: &str,
    title: &str,
    bpm: Option<f64>,
    key: Option<&str>,
    energy: Option<u8>,
    tuning: Option<&str>,
    tags: Vec<&str>,
) -> Song {
    Song {
        id: id.to_string(),
        title: title.to_string(),
        artist: "Loserdub".to_string(),
        duration_seconds: 240.0,
        bpm,
        musical_key: key.map(|k| k.to_string()),
        mode: key.map(|k| {
            if k.ends_with('A') || k.ends_with('m') {
                Mode::Minor
            } else {
                Mode::Major
            }
        }),
        camelot_code: key.map(|k| k.to_string()),
        tuning: tuning
            .map(|t| t.to_string())
            .or_else(|| Some("Standard".to_string())),
        capo: Some(0),
        energy_rating: energy,
        lead_performer: None,
        tags: tags.into_iter().map(String::from).collect(),
        notes: None,
    }
}

fn seed_catalog_songs(state: &AppState, songs: &[Song]) {
    let conn = state.db.lock().expect("lock db");
    for song in songs {
        library_db::upsert_song(&conn, song).expect("insert test song");
    }
}

#[test]
fn test_get_song_relationships_incoming_and_outgoing() {
    let (state, _dir) = setup_test_app();

    let song1 = make_test_song(
        "s1",
        "Deep Groove",
        Some(124.0),
        Some("8A"),
        Some(6),
        None,
        vec!["deep", "house"],
    );
    let song2 = make_test_song(
        "s2",
        "Peak Melodic",
        Some(125.0),
        Some("9A"),
        Some(8),
        None,
        vec!["melodic", "progressive"],
    );
    let song3 = make_test_song(
        "s3",
        "Distant Ambient",
        Some(90.0),
        Some("2A"),
        Some(3),
        None,
        vec!["ambient", "chill"],
    );

    seed_catalog_songs(&state, &[song1, song2, song3]);

    let conn = state.db.lock().expect("lock db");
    let songs = library_db::list_songs(&conn).expect("list songs");
    let graph = CatalogGraph::new(songs);

    let res: SongRelationshipsResponse = graph.get_song_relationships("s1");
    assert_eq!(res.song_id, "s1");
    assert_eq!(res.outgoing.len(), 2);
    assert_eq!(res.incoming.len(), 2);

    // s1 -> s2 should be stronger than s1 -> s3
    assert_eq!(res.outgoing[0].to_song_id, "s2");
    assert!(res.outgoing[0].overall_score > res.outgoing[1].overall_score);
    assert_eq!(
        res.outgoing[0].compatibility,
        OverallCompatibility::Excellent
    );
    assert!(res.outgoing[0]
        .classifications
        .contains(&TransitionClassification::Smooth));

    // s3 -> s1 has wide BPM and distance key
    assert_eq!(res.outgoing[1].to_song_id, "s3");
    assert!(res.outgoing[1]
        .classifications
        .contains(&TransitionClassification::PoorFit));
}

#[test]
fn test_get_song_relationship_structured_explanation() {
    let (state, _dir) = setup_test_app();

    let song1 = make_test_song(
        "s1",
        "Intro Track",
        Some(120.0),
        Some("8A"),
        Some(5),
        None,
        vec!["intro"],
    );
    let song2 = make_test_song(
        "s2",
        "Lift Track",
        Some(123.0),
        Some("9A"),
        Some(7),
        None,
        vec!["buildup"],
    );

    seed_catalog_songs(&state, &[song1.clone(), song2.clone()]);

    let rel: SongRelationship = sequencer::evaluate_song_relationship(&song1, &song2);
    assert_eq!(rel.from_song_id, "s1");
    assert_eq!(rel.to_song_id, "s2");
    assert_eq!(rel.from_title, "Intro Track");
    assert_eq!(rel.to_title, "Lift Track");

    // Explainable structured data verification
    assert!(rel.explanation.bpm.delta.is_some());
    assert_eq!(rel.explanation.bpm.delta.unwrap(), 3.0);
    assert_eq!(rel.explanation.energy.delta, Some(2));
    assert_eq!(
        rel.explanation.energy.movement,
        core_types::EnergyMovement::Rise
    );
    assert_eq!(rel.explanation.harmony.camelot_distance, Some(1));
    assert!(rel.explanation.summary.contains("+3.0 BPM"));
    assert!(rel.explanation.summary.contains("+2 energy level"));
}

#[test]
fn test_bridge_discovery_in_catalog() {
    let (state, _dir) = setup_test_app();

    // Gap between A (100 BPM, 8A) and B (130 BPM, 10A)
    let song_a = make_test_song(
        "A",
        "Warm Acoustic",
        Some(100.0),
        Some("8A"),
        Some(4),
        None,
        vec!["indie"],
    );
    let song_b = make_test_song(
        "B",
        "Peak Climax",
        Some(130.0),
        Some("10A"),
        Some(8),
        None,
        vec!["dance"],
    );
    let song_bridge = make_test_song(
        "X",
        "Perfect Bridge",
        Some(115.0),
        Some("9A"),
        Some(6),
        None,
        vec!["hybrid"],
    );

    seed_catalog_songs(&state, &[song_a, song_b, song_bridge]);

    let conn = state.db.lock().expect("lock db");
    let songs = library_db::list_songs(&conn).expect("list songs");
    let graph = CatalogGraph::new(songs);

    let bridges = graph.get_potential_bridges("A", "B", 5);
    assert!(!bridges.is_empty());
    assert_eq!(bridges[0].bridge_song.id, "X");
    assert!(bridges[0]
        .bridge_roles
        .contains(&BridgeRole::HarmonicBridge));
    assert!(bridges[0].bridge_roles.contains(&BridgeRole::TempoBridge));
    assert!(bridges[0].bridge_roles.contains(&BridgeRole::EnergyBridge));
    assert!(bridges[0].reason.contains("Acts as a bridge"));
}

#[test]
fn test_natural_clusters_in_catalog() {
    let (state, _dir) = setup_test_app();

    // House cluster
    let h1 = make_test_song(
        "h1",
        "House 1",
        Some(124.0),
        Some("8A"),
        Some(6),
        None,
        vec!["house"],
    );
    let h2 = make_test_song(
        "h2",
        "House 2",
        Some(124.5),
        Some("8A"),
        Some(7),
        None,
        vec!["house"],
    );
    let h3 = make_test_song(
        "h3",
        "House 3",
        Some(125.0),
        Some("9A"),
        Some(7),
        None,
        vec!["house"],
    );

    // Ambient cluster
    let a1 = make_test_song(
        "a1",
        "Ambient 1",
        Some(75.0),
        Some("4B"),
        Some(3),
        None,
        vec!["chill"],
    );
    let a2 = make_test_song(
        "a2",
        "Ambient 2",
        Some(76.0),
        Some("4B"),
        Some(3),
        None,
        vec!["chill"],
    );

    seed_catalog_songs(&state, &[h1, h2, h3, a1, a2]);

    let conn = state.db.lock().expect("lock db");
    let songs = library_db::list_songs(&conn).expect("list songs");
    let graph = CatalogGraph::new(songs);

    let clusters: Vec<CatalogCluster> = graph.find_clusters();
    assert_eq!(clusters.len(), 2);
    assert_eq!(clusters[0].song_ids.len(), 3);
    assert_eq!(clusters[1].song_ids.len(), 2);
    assert!(clusters[0].cohesion_score >= 0.70);
}

#[test]
fn test_catalog_openers_and_closers() {
    let (state, _dir) = setup_test_app();

    let opener = make_test_song(
        "op",
        "Ideal Opener",
        Some(124.0),
        Some("8A"),
        Some(5),
        None,
        vec![],
    );
    let mid = make_test_song(
        "mid",
        "Mid Energy",
        Some(124.0),
        Some("8A"),
        Some(6),
        None,
        vec![],
    );
    let closer = make_test_song(
        "cl",
        "Peak Closer",
        Some(125.0),
        Some("9A"),
        Some(9),
        None,
        vec![],
    );

    seed_catalog_songs(&state, &[opener, mid, closer]);

    let conn = state.db.lock().expect("lock db");
    let songs = library_db::list_songs(&conn).expect("list songs");
    let graph = CatalogGraph::new(songs);

    let res: CatalogOpenersAndClosers = graph.get_openers_and_closers();
    assert!(!res.openers.is_empty());
    assert!(!res.closers.is_empty());
    assert_eq!(res.closers[0].song_id, "cl");
}

#[test]
fn test_catalog_outliers_integration() {
    let (state, _dir) = setup_test_app();

    let s1 = make_test_song(
        "s1",
        "Main 1",
        Some(124.0),
        Some("8A"),
        Some(6),
        None,
        vec![],
    );
    let s2 = make_test_song(
        "s2",
        "Main 2",
        Some(124.0),
        Some("8A"),
        Some(6),
        None,
        vec![],
    );
    let out = make_test_song(
        "out",
        "Extreme Fast",
        Some(180.0),
        Some("1B"),
        Some(10),
        None,
        vec![],
    );

    seed_catalog_songs(&state, &[s1, s2, out]);

    let conn = state.db.lock().expect("lock db");
    let songs = library_db::list_songs(&conn).expect("list songs");
    let graph = CatalogGraph::new(songs);

    let outliers = graph.find_outliers();
    assert!(!outliers.is_empty());
    assert_eq!(outliers[0].song_id, "out");
    assert_eq!(outliers[0].strong_connection_count, 0);
}

#[test]
fn test_unusual_transitions_integration() {
    let (state, _dir) = setup_test_app();

    let s1 = make_test_song(
        "s1",
        "Peak Anthem",
        Some(126.0),
        Some("8A"),
        Some(8),
        None,
        vec![],
    );
    let s2 = make_test_song(
        "s2",
        "Ballad Reset",
        Some(126.0),
        Some("8A"),
        Some(2),
        None,
        vec![],
    );

    seed_catalog_songs(&state, &[s1, s2]);

    let conn = state.db.lock().expect("lock db");
    let songs = library_db::list_songs(&conn).expect("list songs");
    let graph = CatalogGraph::new(songs);

    let unusual = graph.get_unusual_transitions("s1", 5);
    assert!(!unusual.is_empty());
    assert_eq!(unusual[0].to_song_id, "s2");
    assert!(unusual[0].explanation.energy.is_reset);
}

#[test]
fn test_catalog_summary_stats_integration() {
    let (state, _dir) = setup_test_app();

    let s1 = make_test_song(
        "s1",
        "House 1",
        Some(124.0),
        Some("8A"),
        Some(6),
        None,
        vec![],
    );
    let s2 = make_test_song(
        "s2",
        "House 2",
        Some(124.0),
        Some("8A"),
        Some(6),
        None,
        vec![],
    );

    seed_catalog_songs(&state, &[s1, s2]);

    let conn = state.db.lock().expect("lock db");
    let songs = library_db::list_songs(&conn).expect("list songs");
    let graph = CatalogGraph::new(songs);

    let stats = graph.get_catalog_summary_stats();
    assert_eq!(stats.total_songs, 2);
    assert_eq!(stats.total_possible_transitions, 2);
    assert!(stats.strong_transitions_count >= 1);
}

#[test]
fn test_candidate_path_discovery_integration() {
    let (state, _dir) = setup_test_app();

    let s1 = make_test_song(
        "s1",
        "Opener",
        Some(120.0),
        Some("8A"),
        Some(4),
        None,
        vec![],
    );
    let s2 = make_test_song(
        "s2",
        "Middle",
        Some(122.0),
        Some("9A"),
        Some(6),
        None,
        vec![],
    );
    let s3 = make_test_song(
        "s3",
        "Closer",
        Some(124.0),
        Some("10A"),
        Some(8),
        None,
        vec![],
    );

    seed_catalog_songs(&state, &[s1, s2, s3]);

    let conn = state.db.lock().expect("lock db");
    let songs = library_db::list_songs(&conn).expect("list songs");
    let graph = CatalogGraph::new(songs);

    let paths = graph.find_candidate_paths(&core_types::DiscoveryConstraints {
        start_song_id: Some("s1".to_string()),
        end_song_id: Some("s3".to_string()),
        must_include_ids: vec!["s2".to_string()],
        target_duration_minutes: None,
        duration_tolerance_minutes: None,
        limit: Some(2),
    });

    assert!(!paths.is_empty());
    assert_eq!(paths[0].song_ids, vec!["s1", "s2", "s3"]);
    assert_eq!(paths[0].transitions.len(), 2);
    assert!(paths[0].average_score >= 0.80);
}
