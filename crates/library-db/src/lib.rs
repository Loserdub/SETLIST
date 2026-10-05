//! SQLite repository, track library scanner, and background job queue.

pub mod blob;
pub mod error;
pub mod filter;
pub mod migrate;
pub mod overrides;
pub mod repo;
pub mod scan;
pub mod setlist;

pub use blob::*;
pub use error::*;
pub use filter::*;
pub use migrate::*;
pub use overrides::*;
pub use repo::*;
pub use scan::*;
pub use setlist::*;

#[cfg(test)]
mod tests {
    use super::*;
    use core_types::{
        BeatGrid, Camelot, CamelotLetter, CueKind, CuePoint, DynamicsAnalysis, EnergyCurve,
        EnergyProfile, Key, LoudnessInfo, Mode, RhythmAnalysis, Segment, SegmentLabel,
        SetlistEntry, Track, TrackAnalysis, TrackTags, TransitionAdvice, TransitionType,
        Waveform3Band, WaveformBand,
    };
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        apply_migrations(&conn).expect("apply migrations");
        conn
    }

    #[test]
    fn test_apply_migrations_in_memory() {
        let conn = setup_db();

        // Verify version tracking
        let version = get_schema_version(&conn).expect("get schema version");
        assert_eq!(version, 6);

        // Verify idempotent application
        apply_migrations(&conn).expect("re-apply migrations cleanly");
        let version_after = get_schema_version(&conn).expect("get schema version");
        assert_eq!(version_after, 6);

        // Verify tracks insert with constant beat grid fields and optional beats_json
        conn.execute(
            "INSERT INTO tracks (id, path, hash, duration_ms, first_downbeat_ms, bpm, steady, beats_json)
             VALUES ('t1', '/path/to/song.mp3', 'hash123', 180000.0, 100.0, 128.0, 1, '[100.0, 568.75]')",
            [],
        )
        .unwrap();

        // Verify buildup is allowed in structural_segments check
        conn.execute(
            "INSERT INTO structural_segments (track_id, label, start_ms, end_ms, energy)
             VALUES ('t1', 'buildup', 30000.0, 45000.0, 7)",
            [],
        )
        .unwrap();

        // Verify invalid segment label fails CHECK constraint
        let bad_segment = conn.execute(
            "INSERT INTO structural_segments (track_id, label, start_ms, end_ms, energy)
             VALUES ('t1', 'chorus', 45000.0, 60000.0, 8)",
            [],
        );
        assert!(bad_segment.is_err());
    }

    fn sample_analysis() -> TrackAnalysis {
        TrackAnalysis {
            loudness: LoudnessInfo {
                integrated_lufs: -14.2,
                loudness_range: 6.5,
                true_peak: -0.8,
            },
            rhythm: RhythmAnalysis {
                grid: BeatGrid {
                    first_downbeat_ms: 120.5,
                    bpm: 126.0,
                    beats_ms: vec![120.5, 596.7, 1072.9, 1549.1],
                    downbeat_flags: vec![true, false, false, false],
                    steady: true,
                },
                bpm_alternates: vec![63.0, 252.0],
            },
            key: Key {
                pitch_class: 9,
                mode: Mode::Minor,
                camelot: Camelot::new(8, CamelotLetter::A).unwrap(),
                tuning_cents: -4.5,
            },
            dynamics: DynamicsAnalysis {
                frame_rate: 86.13,
                rms_curve: vec![0.1, 0.2, 0.3],
                low_ratio_curve: vec![0.4, 0.5, 0.6],
                centroid_curve: vec![1200.0, 1500.0, 1800.0],
            },
            energy_score: 7,
            energy_curve: EnergyCurve {
                per_bar: vec![5.0, 6.0, 7.5, 8.0],
            },
            segments: vec![
                Segment {
                    label: SegmentLabel::Intro,
                    start_ms: 0.0,
                    end_ms: 15000.0,
                    energy: 3,
                },
                Segment {
                    label: SegmentLabel::Verse,
                    start_ms: 15000.0,
                    end_ms: 45000.0,
                    energy: 5,
                },
                Segment {
                    label: SegmentLabel::Buildup,
                    start_ms: 45000.0,
                    end_ms: 60000.0,
                    energy: 7,
                },
                Segment {
                    label: SegmentLabel::Drop,
                    start_ms: 60000.0,
                    end_ms: 90000.0,
                    energy: 9,
                },
                Segment {
                    label: SegmentLabel::Breakdown,
                    start_ms: 90000.0,
                    end_ms: 120000.0,
                    energy: 4,
                },
                Segment {
                    label: SegmentLabel::Outro,
                    start_ms: 120000.0,
                    end_ms: 150000.0,
                    energy: 3,
                },
            ],
            cue_points: vec![
                CuePoint {
                    index: 0,
                    time_ms: 120.5,
                    label: "First downbeat".to_string(),
                    color_hex: "#FF5500".to_string(),
                    kind: CueKind::HotCue,
                    loop_end_ms: None,
                },
                CuePoint {
                    index: 1,
                    time_ms: 15000.0,
                    label: "Intro End".to_string(),
                    color_hex: "#00FF00".to_string(),
                    kind: CueKind::HotCue,
                    loop_end_ms: None,
                },
                CuePoint {
                    index: 2,
                    time_ms: 45000.0,
                    label: "Build".to_string(),
                    color_hex: "#0000FF".to_string(),
                    kind: CueKind::HotCue,
                    loop_end_ms: None,
                },
                CuePoint {
                    index: 3,
                    time_ms: 60000.0,
                    label: "Drop 1".to_string(),
                    color_hex: "#FFFF00".to_string(),
                    kind: CueKind::HotCue,
                    loop_end_ms: None,
                },
                CuePoint {
                    index: 4,
                    time_ms: 90000.0,
                    label: "Break".to_string(),
                    color_hex: "#FF00FF".to_string(),
                    kind: CueKind::HotCue,
                    loop_end_ms: None,
                },
                CuePoint {
                    index: 5,
                    time_ms: 105000.0,
                    label: "Drop 2".to_string(),
                    color_hex: "#00FFFF".to_string(),
                    kind: CueKind::HotCue,
                    loop_end_ms: None,
                },
                CuePoint {
                    index: 6,
                    time_ms: 120000.0,
                    label: "Mix Out".to_string(),
                    color_hex: "#FFFFFF".to_string(),
                    kind: CueKind::HotCue,
                    loop_end_ms: None,
                },
                CuePoint {
                    index: 7,
                    time_ms: 135000.0,
                    label: "Loop Outro".to_string(),
                    color_hex: "#FFAA00".to_string(),
                    kind: CueKind::Loop,
                    loop_end_ms: Some(142500.0),
                },
            ],
            waveform: Waveform3Band {
                points_per_sec: 10,
                low: WaveformBand {
                    peak: vec![10, 20, 30],
                    rms: vec![5, 10, 15],
                },
                mid: WaveformBand {
                    peak: vec![40, 50, 60],
                    rms: vec![20, 25, 30],
                },
                high: WaveformBand {
                    peak: vec![70, 80, 90],
                    rms: vec![35, 40, 45],
                },
            },
        }
    }

    #[test]
    fn test_roundtrip_full_track_analysis() {
        let conn = setup_db();

        let track = Track {
            id: "track-uuid-1".to_string(),
            path: "/music/track1.mp3".to_string(),
            hash: "sha256:1111222233334444".to_string(),
            tags: TrackTags {
                title: Some("Around the World".to_string()),
                artist: Some("Daft Punk".to_string()),
                album: Some("Homework".to_string()),
            },
            duration_ms: 180000.0,
            analysis: None,
            analyzed_at: None,
            analysis_version: None,
        };

        let inserted_id = upsert_track(&conn, &track).expect("upsert track");
        assert_eq!(inserted_id, "track-uuid-1");

        let expected_analysis = sample_analysis();
        save_analysis(&conn, &inserted_id, &expected_analysis, "v1.0.0").expect("save analysis");

        let loaded = get_track(&conn, &inserted_id)
            .expect("get track")
            .expect("track exists");

        assert_eq!(loaded.id, "track-uuid-1");
        assert_eq!(loaded.path, "/music/track1.mp3");
        assert_eq!(loaded.hash, "sha256:1111222233334444");
        assert_eq!(loaded.tags.title.as_deref(), Some("Around the World"));
        assert_eq!(loaded.tags.artist.as_deref(), Some("Daft Punk"));
        assert_eq!(loaded.tags.album.as_deref(), Some("Homework"));
        assert_eq!(loaded.duration_ms, 180000.0);
        assert_eq!(loaded.analysis_version.as_deref(), Some("v1.0.0"));
        assert!(loaded.analyzed_at.is_some());

        let actual = loaded.analysis.expect("analysis is present");

        // Verify loudness
        assert!(
            (actual.loudness.integrated_lufs - expected_analysis.loudness.integrated_lufs).abs()
                < 1e-4
        );
        assert!(
            (actual.loudness.loudness_range - expected_analysis.loudness.loudness_range).abs()
                < 1e-4
        );
        assert!((actual.loudness.true_peak - expected_analysis.loudness.true_peak).abs() < 1e-4);

        // Verify rhythm
        assert_eq!(
            actual.rhythm.grid.first_downbeat_ms,
            expected_analysis.rhythm.grid.first_downbeat_ms
        );
        assert_eq!(actual.rhythm.grid.bpm, expected_analysis.rhythm.grid.bpm);
        assert_eq!(
            actual.rhythm.grid.steady,
            expected_analysis.rhythm.grid.steady
        );
        assert_eq!(
            actual.rhythm.grid.beats_ms,
            expected_analysis.rhythm.grid.beats_ms
        );
        assert_eq!(
            actual.rhythm.grid.downbeat_flags,
            expected_analysis.rhythm.grid.downbeat_flags
        );
        assert_eq!(
            actual.rhythm.bpm_alternates,
            expected_analysis.rhythm.bpm_alternates
        );

        // Verify key
        assert_eq!(actual.key.pitch_class, expected_analysis.key.pitch_class);
        assert_eq!(actual.key.mode, expected_analysis.key.mode);
        assert_eq!(actual.key.camelot, expected_analysis.key.camelot);
        assert!((actual.key.tuning_cents - expected_analysis.key.tuning_cents).abs() < 1e-4);

        // Verify dynamics
        assert_eq!(
            actual.dynamics.frame_rate,
            expected_analysis.dynamics.frame_rate
        );
        assert_eq!(
            actual.dynamics.rms_curve,
            expected_analysis.dynamics.rms_curve
        );
        assert_eq!(
            actual.dynamics.low_ratio_curve,
            expected_analysis.dynamics.low_ratio_curve
        );
        assert_eq!(
            actual.dynamics.centroid_curve,
            expected_analysis.dynamics.centroid_curve
        );

        // Verify energy score and curve
        assert_eq!(actual.energy_score, expected_analysis.energy_score);
        assert_eq!(
            actual.energy_curve.per_bar,
            expected_analysis.energy_curve.per_bar
        );

        // Verify segments
        assert_eq!(actual.segments, expected_analysis.segments);

        // Verify cue points
        assert_eq!(actual.cue_points, expected_analysis.cue_points);

        // Verify waveform 3-band BLOBs
        assert_eq!(actual.waveform, expected_analysis.waveform);
    }

    #[test]
    fn test_reimport_moved_file_keeps_analysis() {
        let conn = setup_db();

        let track1 = Track {
            id: "track-100".to_string(),
            path: "/old/folder/song.flac".to_string(),
            hash: "unique-content-hash-abc".to_string(),
            tags: TrackTags {
                title: Some("Song One".to_string()),
                artist: Some("Artist X".to_string()),
                album: None,
            },
            duration_ms: 210000.0,
            analysis: None,
            analyzed_at: None,
            analysis_version: None,
        };

        let id = upsert_track(&conn, &track1).expect("insert original track");
        assert_eq!(id, "track-100");

        let analysis = sample_analysis();
        save_analysis(&conn, &id, &analysis, "v1").expect("save analysis");

        // Simulate library rescan with moved file location (new path, same hash)
        let moved_track = Track {
            id: String::new(), // scanner generates a temporary or empty id
            path: "/new/archive/song.flac".to_string(),
            hash: "unique-content-hash-abc".to_string(),
            tags: TrackTags {
                title: Some("Song One".to_string()),
                artist: Some("Artist X".to_string()),
                album: Some("Album Y".to_string()),
            },
            duration_ms: 210000.0,
            analysis: None, // scanner has not analyzed it yet
            analyzed_at: None,
            analysis_version: None,
        };

        let reimported_id = upsert_track(&conn, &moved_track).expect("upsert moved track");
        assert_eq!(
            reimported_id, "track-100",
            "should retain existing track ID based on content hash match"
        );

        // Verify analysis was preserved!
        let loaded = get_track(&conn, &reimported_id)
            .expect("get track")
            .expect("track exists");
        assert_eq!(loaded.path, "/new/archive/song.flac");
        assert_eq!(loaded.tags.album.as_deref(), Some("Album Y"));
        assert!(
            loaded.analysis.is_some(),
            "analysis must be preserved across file moves"
        );
        assert_eq!(loaded.analysis.unwrap().energy_score, 7);
    }

    #[test]
    fn test_filter_queries() {
        let conn = setup_db();

        // Track 1: 120 BPM, 8A, Energy 4, Daft Punk
        let mut a1 = sample_analysis();
        a1.rhythm.grid.bpm = 120.0;
        a1.key.camelot = Camelot::new(8, CamelotLetter::A).unwrap();
        a1.energy_score = 4;
        let t1 = Track {
            id: "t1".to_string(),
            path: "/p1.mp3".to_string(),
            hash: "h1".to_string(),
            tags: TrackTags {
                title: Some("Harder Better Faster Stronger".to_string()),
                artist: Some("Daft Punk".to_string()),
                album: Some("Discovery".to_string()),
            },
            duration_ms: 220000.0,
            analysis: Some(a1),
            analyzed_at: None,
            analysis_version: None,
        };
        upsert_track(&conn, &t1).unwrap();

        // Track 2: 128 BPM, 8B, Energy 7, Daft Punk
        let mut a2 = sample_analysis();
        a2.rhythm.grid.bpm = 128.0;
        a2.key.camelot = Camelot::new(8, CamelotLetter::B).unwrap();
        a2.energy_score = 7;
        let t2 = Track {
            id: "t2".to_string(),
            path: "/p2.mp3".to_string(),
            hash: "h2".to_string(),
            tags: TrackTags {
                title: Some("One More Time".to_string()),
                artist: Some("Daft Punk".to_string()),
                album: Some("Discovery".to_string()),
            },
            duration_ms: 320000.0,
            analysis: Some(a2),
            analyzed_at: None,
            analysis_version: None,
        };
        upsert_track(&conn, &t2).unwrap();

        // Track 3: 140 BPM, 9A, Energy 9, Martin Garrix
        let mut a3 = sample_analysis();
        a3.rhythm.grid.bpm = 140.0;
        a3.key.camelot = Camelot::new(9, CamelotLetter::A).unwrap();
        a3.energy_score = 9;
        let t3 = Track {
            id: "t3".to_string(),
            path: "/p3.mp3".to_string(),
            hash: "h3".to_string(),
            tags: TrackTags {
                title: Some("Animals".to_string()),
                artist: Some("Martin Garrix".to_string()),
                album: Some("Gold Skies".to_string()),
            },
            duration_ms: 190000.0,
            analysis: Some(a3),
            analyzed_at: None,
            analysis_version: None,
        };
        upsert_track(&conn, &t3).unwrap();

        // Filter: BPM range 125..135 -> only Track 2
        let bpm_res = list_tracks(&conn, &TrackFilter::new().with_bpm_range(125.0, 135.0)).unwrap();
        assert_eq!(bpm_res.len(), 1);
        assert_eq!(bpm_res[0].id, "t2");

        // Filter: Camelot key 8A -> only Track 1
        let key_8a_res = list_tracks(
            &conn,
            &TrackFilter::new().with_camelot_keys(vec![Camelot::new(8, CamelotLetter::A).unwrap()]),
        )
        .unwrap();
        assert_eq!(key_8a_res.len(), 1);
        assert_eq!(key_8a_res[0].id, "t1");

        // Filter: Camelot keys 8A or 8B -> Tracks 1 and 2
        let key_multi_res = list_tracks(
            &conn,
            &TrackFilter::new().with_camelot_keys(vec![
                Camelot::new(8, CamelotLetter::A).unwrap(),
                Camelot::new(8, CamelotLetter::B).unwrap(),
            ]),
        )
        .unwrap();
        assert_eq!(key_multi_res.len(), 2);

        // Filter: Energy range 6..10 -> Tracks 2 and 3
        let energy_res = list_tracks(&conn, &TrackFilter::new().with_energy_range(6, 10)).unwrap();
        assert_eq!(energy_res.len(), 2);
        let ids: Vec<&str> = energy_res.iter().map(|t| t.id.as_str()).collect();
        assert!(ids.contains(&"t2"));
        assert!(ids.contains(&"t3"));

        // Filter: Text search "daft" (case-insensitive substring) -> Tracks 1 and 2
        let text_res = list_tracks(&conn, &TrackFilter::new().with_text_search("daft")).unwrap();
        assert_eq!(text_res.len(), 2);

        // Filter: Text search "animals" -> Track 3
        let text_res2 =
            list_tracks(&conn, &TrackFilter::new().with_text_search("animals")).unwrap();
        assert_eq!(text_res2.len(), 1);
        assert_eq!(text_res2[0].id, "t3");

        // Filter: Combined Daft Punk + energy >= 6 -> Track 2
        let combined = list_tracks(
            &conn,
            &TrackFilter::new()
                .with_text_search("daft")
                .with_energy_range(6, 10),
        )
        .unwrap();
        assert_eq!(combined.len(), 1);
        assert_eq!(combined[0].id, "t2");
    }

    #[test]
    fn test_list_tracks_batching_efficiency() {
        let conn = setup_db();

        // Insert 10 fully analyzed tracks
        for i in 1..=10 {
            let mut analysis = sample_analysis();
            analysis.rhythm.grid.bpm = 120.0 + (i as f64);
            analysis.key.camelot = Camelot::new(i, CamelotLetter::A).unwrap();
            analysis.energy_score = (i % 10) as u8 + 1;

            let track = Track {
                id: format!("batch-track-{i:02}"),
                path: format!("/music/track_{i:02}.mp3"),
                hash: format!("hash-{i:02}"),
                tags: TrackTags {
                    title: Some(format!("Track Title {i:02}")),
                    artist: Some(format!("Artist {i:02}")),
                    album: Some("Batch Album".to_string()),
                },
                duration_ms: 180000.0,
                analysis: Some(analysis),
                analyzed_at: None,
                analysis_version: None,
            };
            upsert_track(&conn, &track).unwrap();
        }

        // Apply overrides to track 2 (BPM + Title) and track 5 (Key)
        set_override(
            &conn,
            "batch-track-02",
            &TrackOverridePatch {
                bpm: Some(132.0),
                title: Some("Overridden Title 02".to_string()),
                ..Default::default()
            },
        )
        .unwrap();

        set_override(
            &conn,
            "batch-track-05",
            &TrackOverridePatch {
                key_camelot: Some("12B".to_string()),
                ..Default::default()
            },
        )
        .unwrap();

        // 1. Verify list_tracks batch execution
        let tracks = list_tracks(&conn, &TrackFilter::new()).unwrap();
        assert_eq!(tracks.len(), 10);

        // Verify data integrity of returned tracks
        let t2 = tracks.iter().find(|t| t.id == "batch-track-02").unwrap();
        assert_eq!(t2.tags.title.as_deref(), Some("Overridden Title 02"));
        assert_eq!(t2.analysis.as_ref().unwrap().rhythm.grid.bpm, 132.0);
        assert_eq!(t2.analysis.as_ref().unwrap().segments.len(), 6);
        assert_eq!(t2.analysis.as_ref().unwrap().cue_points.len(), 8);
        assert_eq!(
            t2.analysis.as_ref().unwrap().energy_curve.per_bar,
            vec![5.0, 6.0, 7.5, 8.0]
        );
        assert_eq!(t2.analysis.as_ref().unwrap().waveform.points_per_sec, 10);

        let t5 = tracks.iter().find(|t| t.id == "batch-track-05").unwrap();
        assert_eq!(
            t5.analysis.as_ref().unwrap().key.camelot,
            Camelot::new(12, CamelotLetter::B).unwrap()
        );

        // 2. Verify list_tracks_with_overrides batch execution
        let with_overrides = list_tracks_with_overrides(&conn, &TrackFilter::new()).unwrap();
        assert_eq!(with_overrides.len(), 10);

        let wo2 = with_overrides
            .iter()
            .find(|w| w.track.id == "batch-track-02")
            .unwrap();
        assert!(wo2.overrides.bpm);
        assert!(wo2.overrides.title);
        assert!(!wo2.overrides.artist);
        assert!(!wo2.overrides.key_camelot);

        let wo5 = with_overrides
            .iter()
            .find(|w| w.track.id == "batch-track-05")
            .unwrap();
        assert!(!wo5.overrides.bpm);
        assert!(wo5.overrides.key_camelot);

        let wo1 = with_overrides
            .iter()
            .find(|w| w.track.id == "batch-track-01")
            .unwrap();
        assert!(!wo1.overrides.bpm);
        assert!(!wo1.overrides.title);
        assert!(!wo1.overrides.key_camelot);
    }

    #[test]
    fn test_cascade_delete() {
        let conn = setup_db();

        let track = Track {
            id: "cascade-track".to_string(),
            path: "/path/delete_me.mp3".to_string(),
            hash: "del-hash-1".to_string(),
            tags: TrackTags::default(),
            duration_ms: 100000.0,
            analysis: Some(sample_analysis()),
            analyzed_at: None,
            analysis_version: None,
        };

        upsert_track(&conn, &track).unwrap();

        // Verify child records exist
        let seg_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM structural_segments WHERE track_id = 'cascade-track'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(seg_count, 6);

        let cue_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM cue_points WHERE track_id = 'cascade-track'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(cue_count, 8);

        let blob_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM analysis_blobs WHERE track_id = 'cascade-track'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(blob_count, 1);

        // Delete track
        let deleted = delete_track(&conn, "cascade-track").unwrap();
        assert!(deleted);

        // Verify parent is deleted
        assert!(get_track(&conn, "cascade-track").unwrap().is_none());

        // Verify all child records cascaded
        let seg_count_after: i64 = conn
            .query_row(
                "SELECT count(*) FROM structural_segments WHERE track_id = 'cascade-track'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(seg_count_after, 0);

        let cue_count_after: i64 = conn
            .query_row(
                "SELECT count(*) FROM cue_points WHERE track_id = 'cascade-track'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(cue_count_after, 0);

        let blob_count_after: i64 = conn
            .query_row(
                "SELECT count(*) FROM analysis_blobs WHERE track_id = 'cascade-track'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(blob_count_after, 0);
    }

    #[test]
    fn test_replace_cues() {
        let conn = setup_db();

        let track = Track {
            id: "cues-track".to_string(),
            path: "/path/cues.mp3".to_string(),
            hash: "cues-hash".to_string(),
            tags: TrackTags::default(),
            duration_ms: 120000.0,
            analysis: Some(sample_analysis()),
            analyzed_at: None,
            analysis_version: None,
        };
        upsert_track(&conn, &track).unwrap();

        let new_cues = vec![
            CuePoint {
                index: 0,
                time_ms: 500.0,
                label: "New Cue A".to_string(),
                color_hex: "#00FF00".to_string(),
                kind: CueKind::HotCue,
                loop_end_ms: None,
            },
            CuePoint {
                index: 1,
                time_ms: 10000.0,
                label: "New Cue B".to_string(),
                color_hex: "#FF0000".to_string(),
                kind: CueKind::MemoryCue,
                loop_end_ms: None,
            },
        ];

        replace_cues(&conn, "cues-track", &new_cues).unwrap();

        let loaded = get_track(&conn, "cues-track").unwrap().unwrap();
        let loaded_cues = loaded.analysis.unwrap().cue_points;
        assert_eq!(loaded_cues, new_cues);
    }

    #[test]
    fn test_setlist_roundtrip() {
        let conn = setup_db();

        let t1 = Track {
            id: "track-set-1".to_string(),
            path: "/path/1.mp3".to_string(),
            hash: "hash-set-1".to_string(),
            tags: TrackTags {
                title: Some("Track 1".to_string()),
                artist: Some("DJ Alpha".to_string()),
                album: None,
            },
            duration_ms: 180000.0,
            analysis: None,
            analyzed_at: None,
            analysis_version: None,
        };
        let t2 = Track {
            id: "track-set-2".to_string(),
            path: "/path/2.mp3".to_string(),
            hash: "hash-set-2".to_string(),
            tags: TrackTags {
                title: Some("Track 2".to_string()),
                artist: Some("DJ Beta".to_string()),
                album: None,
            },
            duration_ms: 200000.0,
            analysis: None,
            analyzed_at: None,
            analysis_version: None,
        };

        upsert_track(&conn, &t1).unwrap();
        upsert_track(&conn, &t2).unwrap();

        let transition = TransitionAdvice {
            transition_type: TransitionType::ExactMatch,
            bpm_delta: 2.0,
            key_distance: 0,
            mode_flip: false,
            intervention_required: false,
            loop_extension_recommended: true,
            phrase_bars: 16,
            notes: vec!["Blend basslines at bar 16".to_string()],
            ..Default::default()
        };

        let setlist = Setlist::from_entries(
            "setlist-uuid-1",
            "Saturday Night Peak",
            EnergyProfile::PeakPlateau,
            vec![
                SetlistEntry {
                    position: 1,
                    track_id: "track-set-1".to_string(),
                    track: None,
                    transition: None,
                    target_energy: Some(6.0),
                },
                SetlistEntry {
                    position: 2,
                    track_id: "track-set-2".to_string(),
                    track: None,
                    transition: Some(transition.clone()),
                    target_energy: Some(8.5),
                },
            ],
        );

        save_setlist(&conn, &setlist).unwrap();

        let loaded = load_setlist(&conn, "setlist-uuid-1")
            .unwrap()
            .expect("setlist loaded");

        assert_eq!(loaded.id, "setlist-uuid-1");
        assert_eq!(loaded.name, "Saturday Night Peak");
        assert_eq!(loaded.energy_profile, EnergyProfile::PeakPlateau);
        assert_eq!(loaded.items.len(), 2);

        let entries = loaded.to_entries();
        assert_eq!(entries.len(), 2);

        // Entry 1
        assert_eq!(entries[0].position, 1);
        assert_eq!(entries[0].track_id, "track-set-1");
        assert_eq!(entries[0].target_energy, Some(6.0));
        assert!(entries[0].transition.is_none());
        assert_eq!(
            entries[0].track.as_ref().unwrap().tags.title.as_deref(),
            Some("Track 1")
        );

        // Entry 2
        assert_eq!(entries[1].position, 2);
        assert_eq!(entries[1].track_id, "track-set-2");
        assert_eq!(entries[1].target_energy, Some(8.5));
        assert_eq!(entries[1].transition.as_ref().unwrap(), &transition);
        assert_eq!(
            entries[1].track.as_ref().unwrap().tags.title.as_deref(),
            Some("Track 2")
        );
    }

    #[test]
    fn test_song_persistence_roundtrip() {
        use core_types::Song;
        let conn = setup_db();

        let song = Song {
            id: "song-101".to_string(),
            title: "Strobe".to_string(),
            artist: "deadmau5".to_string(),
            duration_seconds: 624.5,
            bpm: Some(128.0),
            musical_key: Some("12B".to_string()),
            mode: Some(Mode::Major),
            camelot_code: Some("12B".to_string()),
            tuning: Some("Drop D".to_string()),
            capo: Some(2),
            energy_rating: Some(8),
            lead_performer: Some("Joel Zimmerman".to_string()),
            tags: vec!["progressive house".to_string(), "classic".to_string()],
            notes: Some("Iconic 10-minute build".to_string()),
        };

        upsert_song(&conn, &song).expect("upsert song");

        let loaded = get_song(&conn, "song-101")
            .expect("get song")
            .expect("song exists");

        assert_eq!(loaded.id, "song-101");
        assert_eq!(loaded.title, "Strobe");
        assert_eq!(loaded.artist, "deadmau5");
        assert_eq!(loaded.duration_seconds, 624.5);
        assert_eq!(loaded.bpm, Some(128.0));
        assert_eq!(loaded.musical_key.as_deref(), Some("12B"));
        assert_eq!(loaded.mode, Some(Mode::Major));
        assert_eq!(loaded.tuning.as_deref(), Some("Drop D"));
        assert_eq!(loaded.capo, Some(2));
        assert_eq!(loaded.energy_rating, Some(8));
        assert_eq!(loaded.lead_performer.as_deref(), Some("Joel Zimmerman"));
        assert_eq!(loaded.tags, vec!["progressive house", "classic"]);
        assert_eq!(loaded.notes.as_deref(), Some("Iconic 10-minute build"));

        let all_songs = list_songs(&conn).expect("list songs");
        assert_eq!(all_songs.len(), 1);
        assert_eq!(all_songs[0].id, "song-101");

        let deleted = delete_song(&conn, "song-101").expect("delete song");
        assert!(deleted);
        assert!(get_song(&conn, "song-101").expect("get song").is_none());
    }

    #[test]
    fn test_flexible_setlist_items_and_mutations() {
        use core_types::{SetlistItem, SetlistItemType, Song};
        let conn = setup_db();

        let song1 = Song {
            id: "s1".to_string(),
            title: "Opening Anthem".to_string(),
            artist: "Artist A".to_string(),
            duration_seconds: 240.0,
            bpm: Some(124.0),
            musical_key: Some("8A".to_string()),
            mode: Some(Mode::Minor),
            camelot_code: Some("8A".to_string()),
            tuning: Some("Standard".to_string()),
            capo: None,
            energy_rating: Some(6),
            lead_performer: None,
            tags: vec![],
            notes: None,
        };
        upsert_song(&conn, &song1).unwrap();

        let setlist = Setlist::new(
            "setlist-flex-1",
            "Festival Set 2026",
            EnergyProfile::Wave,
            vec![
                SetlistItem {
                    id: "item-1".to_string(),
                    position: 1,
                    item: SetlistItemType::Song {
                        song_id: "s1".to_string(),
                        song: Some(song1),
                    },
                    transition: None,
                    target_energy: Some(5.0),
                    notes: None,
                },
                SetlistItem {
                    id: "item-2".to_string(),
                    position: 2,
                    item: SetlistItemType::Banter {
                        topic: "Welcome crowd and introduce next segment".to_string(),
                        duration_seconds: Some(45.0),
                    },
                    transition: None,
                    target_energy: Some(4.0),
                    notes: Some("Keep energy engaging".to_string()),
                },
                SetlistItem {
                    id: "item-3".to_string(),
                    position: 3,
                    item: SetlistItemType::TuningChange {
                        target_tuning: "Drop D".to_string(),
                        instrument: Some("Lead Guitar".to_string()),
                    },
                    transition: None,
                    target_energy: None,
                    notes: None,
                },
                SetlistItem {
                    id: "item-4".to_string(),
                    position: 4,
                    item: SetlistItemType::Intermission {
                        duration_seconds: 300.0,
                        notes: Some("5 minute break".to_string()),
                    },
                    transition: None,
                    target_energy: None,
                    notes: None,
                },
                SetlistItem {
                    id: "item-5".to_string(),
                    position: 5,
                    item: SetlistItemType::Custom {
                        title: "Guest Appearance Solo".to_string(),
                        description: Some("Saxophone solo before finale".to_string()),
                        duration_seconds: Some(90.0),
                    },
                    transition: None,
                    target_energy: Some(9.0),
                    notes: None,
                },
            ],
        );

        save_setlist(&conn, &setlist).unwrap();

        let loaded = load_setlist(&conn, "setlist-flex-1").unwrap().unwrap();
        assert_eq!(loaded.items.len(), 5);
        assert_eq!(loaded.items[0].position, 1);
        match &loaded.items[1].item {
            SetlistItemType::Banter {
                topic,
                duration_seconds,
            } => {
                assert_eq!(topic, "Welcome crowd and introduce next segment");
                assert_eq!(*duration_seconds, Some(45.0));
            }
            _ => panic!("Expected Banter item"),
        }
        match &loaded.items[2].item {
            SetlistItemType::TuningChange {
                target_tuning,
                instrument,
            } => {
                assert_eq!(target_tuning, "Drop D");
                assert_eq!(instrument.as_deref(), Some("Lead Guitar"));
            }
            _ => panic!("Expected TuningChange item"),
        }
        match &loaded.items[3].item {
            SetlistItemType::Intermission {
                duration_seconds, ..
            } => {
                assert_eq!(*duration_seconds, 300.0);
            }
            _ => panic!("Expected Intermission item"),
        }
        match &loaded.items[4].item {
            SetlistItemType::Custom { title, .. } => {
                assert_eq!(title, "Guest Appearance Solo");
            }
            _ => panic!("Expected Custom item"),
        }

        // Test fine-grained move: move position 2 (banter) to position 4
        move_setlist_item(&conn, "setlist-flex-1", 2, 4).expect("move item");
        let moved_list = load_setlist(&conn, "setlist-flex-1").unwrap().unwrap();
        assert_eq!(moved_list.items.len(), 5);
        // Position 1 should still be song
        assert_eq!(moved_list.items[0].position, 1);
        assert!(matches!(
            moved_list.items[0].item,
            SetlistItemType::Song { .. }
        ));
        // Position 2 was previously 3 (Tuning)
        assert_eq!(moved_list.items[1].position, 2);
        assert!(matches!(
            moved_list.items[1].item,
            SetlistItemType::TuningChange { .. }
        ));
        // Position 4 should now be Banter
        assert_eq!(moved_list.items[3].position, 4);
        assert!(matches!(
            moved_list.items[3].item,
            SetlistItemType::Banter { .. }
        ));

        // Test fine-grained remove: remove position 2
        remove_setlist_item(&conn, "setlist-flex-1", 2).expect("remove item");
        let after_remove = load_setlist(&conn, "setlist-flex-1").unwrap().unwrap();
        assert_eq!(after_remove.items.len(), 4);
        assert_eq!(after_remove.items[0].position, 1);
        assert_eq!(after_remove.items[1].position, 2);
        assert_eq!(after_remove.items[2].position, 3);
        assert_eq!(after_remove.items[3].position, 4);

        // Test active setlist persistence
        save_active_setlist(&conn, &after_remove).expect("save active setlist");
        let active = get_active_setlist(&conn)
            .expect("get active setlist")
            .expect("active exists");
        assert_eq!(active.id, "setlist-flex-1");
        assert_eq!(active.items.len(), 4);
    }

    #[test]
    fn test_settings_persistence_roundtrip() {
        let conn = setup_db();

        // 1. Initial load returns default settings
        let initial = load_settings(&conn).expect("load initial settings");
        assert_eq!(initial, core_types::AppSettings::default());
        assert_eq!(initial.worker_count, 4);
        assert_eq!(initial.key_penalties.len(), 7);

        // 2. Modify settings and save
        let mut modified = initial;
        modified.worker_count = 8;
        modified.cost_weights.tempo = 0.40;
        modified.cost_weights.key = 0.30;
        modified.cost_weights.energy = 0.30;
        modified.energy_model.divisor = 12.0;
        modified.key_penalties[0].mode_flip = 0.15;

        save_settings(&conn, &modified).expect("save modified settings");

        // 3. Reload and assert all fields match
        let reloaded = load_settings(&conn).expect("reload settings");
        assert_eq!(reloaded, modified);
        assert_eq!(reloaded.worker_count, 8);
        assert_eq!(reloaded.cost_weights.tempo, 0.40);
        assert_eq!(reloaded.energy_model.divisor, 12.0);
        assert_eq!(reloaded.key_penalties[0].mode_flip, 0.15);
    }
}
