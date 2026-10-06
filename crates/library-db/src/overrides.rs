//! User correction overrides for track analysis values and beat grid rebuilding.

use crate::error::DbError;
use core_types::{BeatGrid, Camelot, CamelotLetter, CuePoint, Key, Mode, Track};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

/// Patch object for specifying track analysis corrections.
///
/// Every field is optional. Supplying `Some(...)` will set or update the override
/// for that field, while `None` leaves the field unchanged.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct TrackOverridePatch {
    /// Overridden tempo in beats per minute.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bpm: Option<f64>,
    /// Overridden timestamp of the first downbeat in milliseconds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_downbeat_ms: Option<f64>,
    /// Overridden Camelot key code (e.g. "8A", "11B").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key_camelot: Option<String>,
    /// Overridden cue points serialized as a JSON string.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cues_json: Option<String>,
    /// Optional cue points provided as structured objects.
    /// If provided and `cues_json` is None, this will be serialized to `cues_json`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cues: Option<Vec<CuePoint>>,
    /// Overridden track title.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Overridden track artist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
}

/// Stored track override record from the database.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct TrackOverride {
    /// Track UUID identifier.
    pub track_id: String,
    /// Overridden tempo in BPM.
    pub bpm: Option<f64>,
    /// Overridden first downbeat in milliseconds.
    pub first_downbeat_ms: Option<f64>,
    /// Overridden Camelot key code (e.g. "8A").
    pub key_camelot: Option<String>,
    /// Overridden cue points as JSON text.
    pub cues_json: Option<String>,
    /// Overridden track title.
    pub title: Option<String>,
    /// Overridden track artist.
    pub artist: Option<String>,
    /// Timestamp when override was last updated.
    pub updated_at: Option<String>,
}

/// Boolean flags indicating which analysis fields have active user overrides.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TrackOverrideFlags {
    /// Whether BPM is overridden.
    pub bpm: bool,
    /// Whether the first downbeat is overridden.
    pub first_downbeat_ms: bool,
    /// Whether the Camelot key is overridden.
    pub key_camelot: bool,
    /// Whether cue points are overridden.
    pub cues: bool,
    /// Whether track title is overridden.
    pub title: bool,
    /// Whether track artist is overridden.
    pub artist: bool,
}

/// Track model combined with field-level override indicators for UI consumption.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TrackWithOverrides {
    /// Underlying effective track.
    #[serde(flatten)]
    pub track: Track,
    /// Flags indicating which fields have user overrides.
    pub overrides: TrackOverrideFlags,
}

impl std::ops::Deref for TrackWithOverrides {
    type Target = Track;

    fn deref(&self) -> &Self::Target {
        &self.track
    }
}

/// Rebuilds a constant 4/4 beat grid and downbeat flags from tempo and downbeat.
///
/// Walks backward from `first_downbeat_ms` to ensure any beats occurring before
/// the first downbeat (at or after 0 ms) are included, aligned to the constant tempo.
#[must_use]
pub fn rebuild_beat_grid(bpm: f64, first_downbeat_ms: f64, duration_ms: f64) -> BeatGrid {
    if bpm <= 0.0 || duration_ms <= 0.0 {
        return BeatGrid {
            first_downbeat_ms,
            bpm,
            beats_ms: Vec::new(),
            downbeat_flags: Vec::new(),
            steady: true,
        };
    }

    let beat_period_ms = 60_000.0 / bpm;
    let mut beats_ms: Vec<f64> = Vec::new();
    let mut downbeat_flags: Vec<bool> = Vec::new();

    // Walk backward from first_downbeat_ms to include any beats before it (at or after 0.0 ms).
    let mut current_ms = first_downbeat_ms;
    while current_ms - beat_period_ms >= 0.0 {
        current_ms -= beat_period_ms;
    }

    let mut beat_count = 0i64;
    let beat_zero_ms = current_ms;
    let offset_beats_to_first_db =
        ((first_downbeat_ms - beat_zero_ms) / beat_period_ms).round() as i64;

    while current_ms < duration_ms {
        beats_ms.push(current_ms);
        let relative = beat_count - offset_beats_to_first_db;
        let is_downbeat = relative.rem_euclid(4) == 0;
        downbeat_flags.push(is_downbeat);
        current_ms += beat_period_ms;
        beat_count += 1;
    }

    let actual_first_downbeat_ms = beats_ms
        .iter()
        .zip(downbeat_flags.iter())
        .find(|(_, &db)| db)
        .map(|(&ms, _)| ms)
        .unwrap_or(first_downbeat_ms);

    BeatGrid {
        first_downbeat_ms: actual_first_downbeat_ms,
        bpm,
        beats_ms,
        downbeat_flags,
        steady: true,
    }
}

/// Applies user overrides onto an analyzed Track.
///
/// Modifies the track in-place with effective values:
/// - title / artist: updates metadata tags with user corrections.
/// - BPM / first_downbeat_ms: rebuilds constant beat grid and downbeat flags.
/// - key_camelot: parses Camelot key, updates mode and pitch class.
/// - cues_json: replaces cue points.
///
/// Segments and dynamics curves remain as analyzed.
pub fn apply_overrides_to_track(track: &mut Track, ovr: &TrackOverride) -> Result<(), DbError> {
    if let Some(ref title) = ovr.title {
        track.tags.title = Some(title.clone());
    }
    if let Some(ref artist) = ovr.artist {
        track.tags.artist = Some(artist.clone());
    }

    if let Some(ref mut analysis) = track.analysis {
        if ovr.bpm.is_some() || ovr.first_downbeat_ms.is_some() {
            let effective_bpm = ovr.bpm.unwrap_or(analysis.rhythm.grid.bpm);
            let effective_downbeat = ovr
                .first_downbeat_ms
                .unwrap_or(analysis.rhythm.grid.first_downbeat_ms);

            analysis.rhythm.grid =
                rebuild_beat_grid(effective_bpm, effective_downbeat, track.duration_ms);
        }

        if let Some(ref key_str) = ovr.key_camelot {
            let camelot: Camelot = key_str.parse().map_err(|e| {
                DbError::DataIntegrity(format!("invalid camelot key override '{key_str}': {e}"))
            })?;

            let mode = match camelot.letter {
                CamelotLetter::A => Mode::Minor,
                CamelotLetter::B => Mode::Major,
            };

            let pitch_class = match camelot.letter {
                CamelotLetter::A => (7 * (camelot.number as i32 - 5)).rem_euclid(12) as u8,
                CamelotLetter::B => (7 * (camelot.number as i32 - 8)).rem_euclid(12) as u8,
            };

            analysis.key = Key {
                pitch_class,
                mode,
                camelot,
                tuning_cents: analysis.key.tuning_cents,
            };
        }

        if let Some(ref cues_str) = ovr.cues_json {
            let cues: Vec<CuePoint> = serde_json::from_str(cues_str)
                .map_err(|e| DbError::DataIntegrity(format!("invalid cues JSON override: {e}")))?;
            analysis.cue_points = cues;
        }
    }

    Ok(())
}

/// Sets user overrides for a track.
///
/// Applies a patch to the `track_overrides` table. If an override row already exists,
/// non-None fields in `patch` update their corresponding columns while None fields remain intact.
///
/// # Errors
/// Returns `DbError::TrackNotFound` if `track_id` does not exist in `tracks`.
/// Returns `DbError::DataIntegrity` if patch contains invalid Camelot key or cues JSON.
pub fn set_override(
    conn: &Connection,
    track_id: &str,
    patch: &TrackOverridePatch,
) -> Result<(), DbError> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM tracks WHERE id = ?1)",
        [track_id],
        |row| row.get(0),
    )?;

    if !exists {
        return Err(DbError::TrackNotFound(track_id.to_string()));
    }

    // Validate BPM if provided
    if let Some(bpm) = patch.bpm {
        if bpm <= 0.0 {
            return Err(DbError::DataIntegrity(format!(
                "invalid override bpm: {bpm} (must be positive)"
            )));
        }
    }

    // Validate Camelot key if provided
    if let Some(ref key_str) = patch.key_camelot {
        let _: Camelot = key_str.parse().map_err(|e| {
            DbError::DataIntegrity(format!("invalid camelot key override '{key_str}': {e}"))
        })?;
    }

    // Resolve cues JSON
    let cues_json = match (&patch.cues_json, &patch.cues) {
        (Some(json), _) => {
            // Validate that it deserializes cleanly
            let _: Vec<CuePoint> = serde_json::from_str(json)
                .map_err(|e| DbError::DataIntegrity(format!("invalid cues JSON override: {e}")))?;
            Some(json.clone())
        }
        (None, Some(cues)) => Some(serde_json::to_string(cues)?),
        (None, None) => None,
    };

    conn.execute(
        "INSERT INTO track_overrides (track_id, bpm, first_downbeat_ms, key_camelot, cues_json, title, artist, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
         ON CONFLICT (track_id) DO UPDATE SET
            bpm = coalesce(excluded.bpm, track_overrides.bpm),
            first_downbeat_ms = coalesce(excluded.first_downbeat_ms, track_overrides.first_downbeat_ms),
            key_camelot = coalesce(excluded.key_camelot, track_overrides.key_camelot),
            cues_json = coalesce(excluded.cues_json, track_overrides.cues_json),
            title = coalesce(excluded.title, track_overrides.title),
            artist = coalesce(excluded.artist, track_overrides.artist),
            updated_at = datetime('now')",
        rusqlite::params![
            track_id,
            patch.bpm,
            patch.first_downbeat_ms,
            patch.key_camelot,
            cues_json,
            patch.title,
            patch.artist,
        ],
    )?;

    // Keep songs table in sync if a song row exists
    let _ = conn.execute(
        "UPDATE songs SET
            title = coalesce(?1, title),
            artist = coalesce(?2, artist),
            bpm = coalesce(?3, bpm),
            camelot_code = coalesce(?4, camelot_code),
            musical_key = coalesce(?4, musical_key),
            updated_at = datetime('now')
         WHERE track_id = ?5 OR id = ?5",
        rusqlite::params![
            patch.title,
            patch.artist,
            patch.bpm,
            patch.key_camelot,
            track_id
        ],
    );

    crate::repo::bump_catalog_revision(conn)?;

    Ok(())
}

/// Clears specified user override fields for a track.
///
/// If `fields` is empty or contains `"all"`, all overrides for the track are cleared.
/// Supported field names (case-insensitive):
/// - `"bpm"`
/// - `"first_downbeat_ms"` or `"downbeat"`
/// - `"key_camelot"` or `"key"` or `"camelot"`
/// - `"cues_json"` or `"cues"`
/// - `"title"`
/// - `"artist"`
///
/// # Errors
/// Returns `DbError::TrackNotFound` if `track_id` does not exist in `tracks`.
pub fn clear_override<S: AsRef<str>>(
    conn: &Connection,
    track_id: &str,
    fields: &[S],
) -> Result<(), DbError> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM tracks WHERE id = ?1)",
        [track_id],
        |row| row.get(0),
    )?;

    if !exists {
        return Err(DbError::TrackNotFound(track_id.to_string()));
    }

    let clear_all = fields.is_empty()
        || fields
            .iter()
            .any(|f| f.as_ref().eq_ignore_ascii_case("all"));

    if clear_all {
        conn.execute(
            "DELETE FROM track_overrides WHERE track_id = ?1",
            [track_id],
        )?;
    } else {
        for field in fields {
            let field_str = field.as_ref().trim().to_ascii_lowercase();
            match field_str.as_str() {
                "bpm" => {
                    conn.execute(
                        "UPDATE track_overrides SET bpm = NULL, updated_at = datetime('now') WHERE track_id = ?1",
                        [track_id],
                    )?;
                }
                "first_downbeat_ms" | "downbeat" => {
                    conn.execute(
                        "UPDATE track_overrides SET first_downbeat_ms = NULL, updated_at = datetime('now') WHERE track_id = ?1",
                        [track_id],
                    )?;
                }
                "key_camelot" | "key" | "camelot" => {
                    conn.execute(
                        "UPDATE track_overrides SET key_camelot = NULL, updated_at = datetime('now') WHERE track_id = ?1",
                        [track_id],
                    )?;
                }
                "cues_json" | "cues" => {
                    conn.execute(
                        "UPDATE track_overrides SET cues_json = NULL, updated_at = datetime('now') WHERE track_id = ?1",
                        [track_id],
                    )?;
                }
                "title" => {
                    conn.execute(
                        "UPDATE track_overrides SET title = NULL, updated_at = datetime('now') WHERE track_id = ?1",
                        [track_id],
                    )?;
                }
                "artist" => {
                    conn.execute(
                        "UPDATE track_overrides SET artist = NULL, updated_at = datetime('now') WHERE track_id = ?1",
                        [track_id],
                    )?;
                }
                _ => {}
            }
        }

        // Clean up row if all fields have been set to NULL
        conn.execute(
            "DELETE FROM track_overrides
             WHERE track_id = ?1
               AND bpm IS NULL
               AND first_downbeat_ms IS NULL
               AND key_camelot IS NULL
               AND cues_json IS NULL
               AND title IS NULL
               AND artist IS NULL",
            [track_id],
        )?;
    }

    // Reset songs table back to analyzed/base values if overrides row was deleted or cleared
    let _ = conn.execute(
        "UPDATE songs SET
            title = coalesce(
                (SELECT title FROM track_overrides WHERE track_id = ?1),
                (SELECT title FROM tracks WHERE id = ?1),
                'Unknown Title'
            ),
            artist = coalesce(
                (SELECT artist FROM track_overrides WHERE track_id = ?1),
                (SELECT artist FROM tracks WHERE id = ?1),
                'Unknown Artist'
            ),
            bpm = coalesce(
                (SELECT bpm FROM track_overrides WHERE track_id = ?1),
                (SELECT bpm FROM tracks WHERE id = ?1)
            ),
            camelot_code = coalesce(
                (SELECT key_camelot FROM track_overrides WHERE track_id = ?1),
                (SELECT CASE WHEN camelot_number IS NOT NULL AND camelot_letter IS NOT NULL THEN camelot_number || camelot_letter ELSE NULL END FROM tracks WHERE id = ?1)
            ),
            musical_key = coalesce(
                (SELECT key_camelot FROM track_overrides WHERE track_id = ?1),
                (SELECT CASE WHEN camelot_number IS NOT NULL AND camelot_letter IS NOT NULL THEN camelot_number || camelot_letter ELSE NULL END FROM tracks WHERE id = ?1)
            ),
            updated_at = datetime('now')
         WHERE track_id = ?1 OR id = ?1",
        [track_id],
    );

    crate::repo::bump_catalog_revision(conn)?;

    Ok(())
}

/// Retrieves stored overrides for a track.
///
/// Returns `Ok(None)` if no overrides are set for the given `track_id`.
///
/// # Errors
/// Returns `DbError` on database query execution failure.
pub fn get_override(conn: &Connection, track_id: &str) -> Result<Option<TrackOverride>, DbError> {
    conn.query_row(
        "SELECT track_id, bpm, first_downbeat_ms, key_camelot, cues_json, updated_at, title, artist
         FROM track_overrides
         WHERE track_id = ?1",
        [track_id],
        |row| {
            Ok(TrackOverride {
                track_id: row.get(0)?,
                bpm: row.get(1)?,
                first_downbeat_ms: row.get(2)?,
                key_camelot: row.get(3)?,
                cues_json: row.get(4)?,
                updated_at: row.get(5)?,
                title: row.get(6)?,
                artist: row.get(7)?,
            })
        },
    )
    .optional()
    .map_err(DbError::from)
}

/// Retrieves flags indicating which analysis fields are overridden for a track.
///
/// # Errors
/// Returns `DbError` on database query execution failure.
pub fn get_override_flags(
    conn: &Connection,
    track_id: &str,
) -> Result<TrackOverrideFlags, DbError> {
    let ovr = get_override(conn, track_id)?;
    Ok(match ovr {
        Some(o) => TrackOverrideFlags {
            bpm: o.bpm.is_some(),
            first_downbeat_ms: o.first_downbeat_ms.is_some(),
            key_camelot: o.key_camelot.is_some(),
            cues: o.cues_json.is_some(),
            title: o.title.is_some(),
            artist: o.artist.is_some(),
        },
        None => TrackOverrideFlags::default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrate::apply_migrations;
    use crate::repo::{delete_track, get_track, list_tracks, save_analysis, upsert_track};
    use core_types::{
        Camelot, CamelotLetter, CueKind, CuePoint, DynamicsAnalysis, EnergyCurve, Key,
        LoudnessInfo, Mode, RhythmAnalysis, Segment, SegmentLabel, Track, TrackAnalysis, TrackTags,
        Waveform3Band, WaveformBand,
    };
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        apply_migrations(&conn).expect("apply migrations");
        conn
    }

    fn sample_analysis(
        bpm: f64,
        downbeat: f64,
        camelot_num: u8,
        camelot_let: CamelotLetter,
    ) -> TrackAnalysis {
        let mode = match camelot_let {
            CamelotLetter::A => Mode::Minor,
            CamelotLetter::B => Mode::Major,
        };
        let pc = match camelot_let {
            CamelotLetter::A => (7 * (camelot_num as i32 - 5)).rem_euclid(12) as u8,
            CamelotLetter::B => (7 * (camelot_num as i32 - 8)).rem_euclid(12) as u8,
        };
        TrackAnalysis {
            loudness: LoudnessInfo {
                integrated_lufs: -14.0,
                loudness_range: 6.0,
                true_peak: -1.0,
            },
            rhythm: RhythmAnalysis {
                grid: rebuild_beat_grid(bpm, downbeat, 180_000.0),
                bpm_alternates: vec![bpm * 0.5, bpm * 2.0],
            },
            key: Key {
                pitch_class: pc,
                mode,
                camelot: Camelot::new(camelot_num, camelot_let).unwrap(),
                tuning_cents: 0.0,
            },
            dynamics: DynamicsAnalysis {
                frame_rate: 86.0,
                rms_curve: vec![0.5; 10],
                low_ratio_curve: vec![0.3; 10],
                centroid_curve: vec![1500.0; 10],
            },
            energy_score: 7,
            energy_curve: EnergyCurve {
                per_bar: vec![0.5, 0.6, 0.7, 0.8],
            },
            segments: vec![
                Segment {
                    label: SegmentLabel::Intro,
                    start_ms: 0.0,
                    end_ms: 15_000.0,
                    energy: 4,
                },
                Segment {
                    label: SegmentLabel::Drop,
                    start_ms: 15_000.0,
                    end_ms: 60_000.0,
                    energy: 8,
                },
            ],
            cue_points: vec![CuePoint {
                index: 0,
                time_ms: downbeat,
                label: "A".to_string(),
                color_hex: "#00FF00".to_string(),
                kind: CueKind::HotCue,
                loop_end_ms: None,
            }],
            waveform: Waveform3Band {
                points_per_sec: 100,
                low: WaveformBand {
                    peak: vec![10],
                    rms: vec![5],
                },
                mid: WaveformBand {
                    peak: vec![20],
                    rms: vec![10],
                },
                high: WaveformBand {
                    peak: vec![15],
                    rms: vec![7],
                },
            },
        }
    }

    fn sample_track(
        id: &str,
        bpm: f64,
        downbeat: f64,
        camelot_num: u8,
        camelot_let: CamelotLetter,
    ) -> Track {
        Track {
            id: id.to_string(),
            path: format!("/music/{id}.mp3"),
            hash: format!("hash_{id}"),
            tags: TrackTags {
                title: Some(format!("Title {id}")),
                artist: Some(format!("Artist {id}")),
                album: Some(format!("Album {id}")),
            },
            duration_ms: 180_000.0,
            analysis: Some(sample_analysis(bpm, downbeat, camelot_num, camelot_let)),
            analyzed_at: Some("2026-10-01T00:00:00Z".to_string()),
            analysis_version: Some("v1".to_string()),
        }
    }

    #[test]
    fn test_grid_rebuild() {
        // 120 BPM: beat period = 500 ms.
        // First downbeat at 1000.0 ms. Duration = 3000 ms.
        let grid = rebuild_beat_grid(120.0, 1000.0, 3000.0);
        assert_eq!(grid.bpm, 120.0);
        assert!(grid.steady);

        // Beats before 1000.0 ms: 500.0, 0.0.
        // Beats at or after: 1000.0, 1500.0, 2000.0, 2500.0.
        assert_eq!(
            grid.beats_ms,
            vec![0.0, 500.0, 1000.0, 1500.0, 2000.0, 2500.0]
        );

        // Downbeats: 1000.0 is downbeat (index 2).
        // Index 2 % 4 == (2 - 2) % 4 == 0 -> true.
        // Index 0: (0 - 2) % 4 = 2 -> false.
        // Index 1: (1 - 2) % 4 = 3 -> false.
        // Index 2: true.
        // Index 3: false.
        // Index 4: false.
        // Index 5: false.
        assert_eq!(
            grid.downbeat_flags,
            vec![false, false, true, false, false, false]
        );
        assert_eq!(grid.first_downbeat_ms, 1000.0);
    }

    #[test]
    fn test_round_trip() {
        let conn = setup_db();
        let track = sample_track("track-1", 120.0, 100.0, 8, CamelotLetter::A);
        upsert_track(&conn, &track).expect("upsert track");

        // Initially no overrides
        let ovr = get_override(&conn, "track-1").expect("get override");
        assert!(ovr.is_none());

        let flags = get_override_flags(&conn, "track-1").expect("get flags");
        assert_eq!(flags, TrackOverrideFlags::default());

        // Set overrides
        let patch = TrackOverridePatch {
            bpm: Some(128.5),
            first_downbeat_ms: Some(250.0),
            key_camelot: Some("11B".to_string()),
            cues_json: Some(r##"[{"index":1,"time_ms":500.0,"label":"B","color_hex":"#FF0000","kind":"HotCue","loop_end_ms":null}]"##.to_string()),
            cues: None,
            ..Default::default()
        };
        set_override(&conn, "track-1", &patch).expect("set override");

        let saved = get_override(&conn, "track-1")
            .expect("get override")
            .expect("exists");
        assert_eq!(saved.bpm, Some(128.5));
        assert_eq!(saved.first_downbeat_ms, Some(250.0));
        assert_eq!(saved.key_camelot.as_deref(), Some("11B"));
        assert!(saved.cues_json.is_some());

        let flags = get_override_flags(&conn, "track-1").expect("get flags");
        assert!(flags.bpm);
        assert!(flags.first_downbeat_ms);
        assert!(flags.key_camelot);
        assert!(flags.cues);

        // Clear only bpm
        clear_override(&conn, "track-1", &["bpm"]).expect("clear bpm");
        let after_clear_bpm = get_override(&conn, "track-1")
            .expect("get override")
            .expect("exists");
        assert!(after_clear_bpm.bpm.is_none());
        assert_eq!(after_clear_bpm.key_camelot.as_deref(), Some("11B"));

        let flags_after = get_override_flags(&conn, "track-1").expect("get flags");
        assert!(!flags_after.bpm);
        assert!(flags_after.key_camelot);

        // Clear all remaining
        clear_override(&conn, "track-1", &["all"]).expect("clear all");
        let after_clear_all = get_override(&conn, "track-1").expect("get override");
        assert!(after_clear_all.is_none());

        let flags_none = get_override_flags(&conn, "track-1").expect("get flags");
        assert_eq!(flags_none, TrackOverrideFlags::default());
    }

    #[test]
    fn test_merge() {
        let conn = setup_db();
        let track = sample_track("track-merge", 120.0, 100.0, 8, CamelotLetter::A);
        upsert_track(&conn, &track).expect("upsert track");

        // Before override: returns analyzed values
        let loaded = get_track(&conn, "track-merge")
            .expect("get track")
            .expect("found");
        let analysis = loaded.analysis.as_ref().unwrap();
        assert_eq!(analysis.rhythm.grid.bpm, 120.0);
        assert_eq!(analysis.key.camelot.to_string(), "8A");

        // Set override for BPM and Key
        set_override(
            &conn,
            "track-merge",
            &TrackOverridePatch {
                bpm: Some(126.0),
                first_downbeat_ms: None,
                key_camelot: Some("5A".to_string()),
                cues_json: None,
                cues: None,
                ..Default::default()
            },
        )
        .expect("set override");

        // get_track returns effective merged values
        let merged = get_track(&conn, "track-merge")
            .expect("get track")
            .expect("found");
        let m_analysis = merged.analysis.as_ref().unwrap();
        assert_eq!(m_analysis.rhythm.grid.bpm, 126.0);
        assert_eq!(m_analysis.key.camelot.to_string(), "5A");
        assert_eq!(m_analysis.key.mode, Mode::Minor);
        assert_eq!(m_analysis.key.pitch_class, 0); // 5A is C minor -> pc 0

        // get_track_with_overrides includes flags
        let with_ovr = crate::repo::get_track_with_overrides(&conn, "track-merge")
            .expect("get with overrides")
            .expect("found");
        assert_eq!(
            with_ovr.track.analysis.as_ref().unwrap().rhythm.grid.bpm,
            126.0
        );
        assert!(with_ovr.overrides.bpm);
        assert!(with_ovr.overrides.key_camelot);
        assert!(!with_ovr.overrides.first_downbeat_ms);
        assert!(!with_ovr.overrides.cues);

        // list_tracks sees effective values
        let tracks = list_tracks(&conn, &crate::filter::TrackFilter::new()).expect("list tracks");
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].analysis.as_ref().unwrap().rhythm.grid.bpm, 126.0);

        // Filter by effective BPM range [125.0, 127.0] matches
        let filter_match = crate::filter::TrackFilter {
            bpm_range: Some((125.0, 127.0)),
            ..Default::default()
        };
        let matches = list_tracks(&conn, &filter_match).expect("list tracks");
        assert_eq!(matches.len(), 1);

        // Filter by original analyzed BPM range [119.0, 121.0] does NOT match
        let filter_no_match = crate::filter::TrackFilter {
            bpm_range: Some((119.0, 121.0)),
            ..Default::default()
        };
        let no_matches = list_tracks(&conn, &filter_no_match).expect("list tracks");
        assert_eq!(no_matches.len(), 0);
    }

    #[test]
    fn test_reanalysis_keeps_overrides() {
        let conn = setup_db();
        let track = sample_track("track-reanalyze", 120.0, 100.0, 8, CamelotLetter::A);
        upsert_track(&conn, &track).expect("upsert track");

        // Apply override
        set_override(
            &conn,
            "track-reanalyze",
            &TrackOverridePatch {
                bpm: Some(135.0),
                first_downbeat_ms: Some(200.0),
                key_camelot: Some("9A".to_string()),
                cues_json: None,
                cues: None,
                ..Default::default()
            },
        )
        .expect("set override");

        // Re-analyze track with different values (e.g. 122.0 BPM, 7A key)
        let reanalyzed = sample_analysis(122.0, 150.0, 7, CamelotLetter::A);
        save_analysis(&conn, "track-reanalyze", &reanalyzed, "v2").expect("save re-analysis");

        // Raw analyzed value in tracks table changed
        let raw_bpm: f64 = conn
            .query_row(
                "SELECT bpm FROM tracks WHERE id = 'track-reanalyze'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(raw_bpm, 122.0);

        // Overrides table is untouched
        let ovr = get_override(&conn, "track-reanalyze")
            .expect("get override")
            .expect("exists");
        assert_eq!(ovr.bpm, Some(135.0));
        assert_eq!(ovr.key_camelot.as_deref(), Some("9A"));

        // get_track still yields the user overridden effective values!
        let loaded = get_track(&conn, "track-reanalyze")
            .expect("get track")
            .expect("exists");
        let analysis = loaded.analysis.as_ref().unwrap();
        assert_eq!(analysis.rhythm.grid.bpm, 135.0);
        assert_eq!(analysis.key.camelot.to_string(), "9A");
    }

    #[test]
    fn test_cascade_delete() {
        let conn = setup_db();
        let track = sample_track("track-del", 124.0, 100.0, 6, CamelotLetter::B);
        upsert_track(&conn, &track).expect("upsert track");

        set_override(
            &conn,
            "track-del",
            &TrackOverridePatch {
                bpm: Some(128.0),
                ..Default::default()
            },
        )
        .expect("set override");

        assert!(get_override(&conn, "track-del").unwrap().is_some());

        // Delete track
        let deleted = delete_track(&conn, "track-del").expect("delete track");
        assert!(deleted);

        // Track is gone
        assert!(get_track(&conn, "track-del").unwrap().is_none());

        // Override is cascade deleted
        assert!(get_override(&conn, "track-del").unwrap().is_none());
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM track_overrides WHERE track_id = 'track-del'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_title_and_artist_overrides_round_trip() {
        let conn = setup_db();
        let track = sample_track("track-title-artist", 120.0, 100.0, 8, CamelotLetter::A);
        upsert_track(&conn, &track).expect("upsert track");

        // Initial values from track tags
        let initial = get_track(&conn, "track-title-artist")
            .unwrap()
            .expect("track exists");
        assert_eq!(
            initial.tags.title.as_deref(),
            Some("Title track-title-artist")
        );
        assert_eq!(
            initial.tags.artist.as_deref(),
            Some("Artist track-title-artist")
        );

        let initial_flags = get_override_flags(&conn, "track-title-artist").unwrap();
        assert!(!initial_flags.title);
        assert!(!initial_flags.artist);

        // Apply title and artist overrides
        set_override(
            &conn,
            "track-title-artist",
            &TrackOverridePatch {
                title: Some("My Corrected Song Title".to_string()),
                artist: Some("My Corrected Artist".to_string()),
                ..Default::default()
            },
        )
        .expect("set override");

        // get_override returns title and artist
        let ovr = get_override(&conn, "track-title-artist")
            .unwrap()
            .expect("override exists");
        assert_eq!(ovr.title.as_deref(), Some("My Corrected Song Title"));
        assert_eq!(ovr.artist.as_deref(), Some("My Corrected Artist"));

        // get_override_flags reports title: true and artist: true
        let flags = get_override_flags(&conn, "track-title-artist").unwrap();
        assert!(flags.title);
        assert!(flags.artist);

        // get_track returns effective title and artist
        let effective = get_track(&conn, "track-title-artist")
            .unwrap()
            .expect("track exists");
        assert_eq!(
            effective.tags.title.as_deref(),
            Some("My Corrected Song Title")
        );
        assert_eq!(
            effective.tags.artist.as_deref(),
            Some("My Corrected Artist")
        );

        // get_track_with_overrides includes flags
        let with_ovr = crate::repo::get_track_with_overrides(&conn, "track-title-artist")
            .unwrap()
            .expect("exists");
        assert_eq!(
            with_ovr.track.tags.title.as_deref(),
            Some("My Corrected Song Title")
        );
        assert_eq!(
            with_ovr.track.tags.artist.as_deref(),
            Some("My Corrected Artist")
        );
        assert!(with_ovr.overrides.title);
        assert!(with_ovr.overrides.artist);

        // list_tracks returns effective values and text search matches override
        let search_match = list_tracks(
            &conn,
            &crate::filter::TrackFilter {
                text_search: Some("Corrected Song".to_string()),
                ..Default::default()
            },
        )
        .expect("list tracks");
        assert_eq!(search_match.len(), 1);
        assert_eq!(
            search_match[0].tags.title.as_deref(),
            Some("My Corrected Song Title")
        );

        // Clear only title override
        clear_override(&conn, "track-title-artist", &["title"]).expect("clear title");
        let after_title_clear = get_track(&conn, "track-title-artist").unwrap().unwrap();
        // Title reverts to original tag, artist remains overridden
        assert_eq!(
            after_title_clear.tags.title.as_deref(),
            Some("Title track-title-artist")
        );
        assert_eq!(
            after_title_clear.tags.artist.as_deref(),
            Some("My Corrected Artist")
        );

        let flags_after_title = get_override_flags(&conn, "track-title-artist").unwrap();
        assert!(!flags_after_title.title);
        assert!(flags_after_title.artist);

        // Clear artist override
        clear_override(&conn, "track-title-artist", &["artist"]).expect("clear artist");
        let after_both_clear = get_track(&conn, "track-title-artist").unwrap().unwrap();
        assert_eq!(
            after_both_clear.tags.title.as_deref(),
            Some("Title track-title-artist")
        );
        assert_eq!(
            after_both_clear.tags.artist.as_deref(),
            Some("Artist track-title-artist")
        );

        let flags_final = get_override_flags(&conn, "track-title-artist").unwrap();
        assert!(!flags_final.title);
        assert!(!flags_final.artist);
    }

    #[test]
    fn test_reanalysis_keeps_title_and_artist_edits() {
        let conn = setup_db();
        let track = sample_track("track-reanalyze-meta", 120.0, 100.0, 8, CamelotLetter::A);
        upsert_track(&conn, &track).expect("upsert track");

        set_override(
            &conn,
            "track-reanalyze-meta",
            &TrackOverridePatch {
                title: Some("Persistent Edited Title".to_string()),
                artist: Some("Persistent Edited Artist".to_string()),
                ..Default::default()
            },
        )
        .expect("set override");

        // Re-analyze track
        let reanalyzed = sample_analysis(125.0, 150.0, 9, CamelotLetter::B);
        save_analysis(&conn, "track-reanalyze-meta", &reanalyzed, "v2").expect("save re-analysis");

        // Effective track still has user-edited title and artist
        let loaded = get_track(&conn, "track-reanalyze-meta").unwrap().unwrap();
        assert_eq!(
            loaded.tags.title.as_deref(),
            Some("Persistent Edited Title")
        );
        assert_eq!(
            loaded.tags.artist.as_deref(),
            Some("Persistent Edited Artist")
        );
    }
}
