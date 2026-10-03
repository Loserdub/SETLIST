//! SQLite repository implementation for tracks, analysis, cues, and setlists.

use crate::blob::{decode_f32_blob, encode_f32_blob};
use crate::error::DbError;
use crate::filter::TrackFilter;
use crate::setlist::Setlist;
use core_types::{
    AppSettings, BeatGrid, Camelot, CamelotLetter, CueKind, CuePoint, DynamicsAnalysis,
    EnergyCurve, EnergyProfile, Key, LoudnessInfo, Mode, RhythmAnalysis, Segment, SegmentLabel,
    SetlistItem, SetlistItemType, Song, Track, TrackAnalysis, TrackTags, TransitionAdvice,
    TransitionType, Waveform3Band, WaveformBand,
};
use rusqlite::{Connection, OptionalExtension, Transaction};

/// Inserts or updates a track in the library database.
///
/// Matching strategy:
/// 1. Match by content hash: if found, updates the path (handles moved/renamed files)
///    and tag metadata, preserving existing analysis.
/// 2. Match by file path: if found, updates the hash and tag metadata.
/// 3. If neither matches, inserts a new track with a generated or provided UUID.
///
/// If `track.analysis` is present, it is also saved.
///
/// # Errors
/// Returns `DbError` on database execution or JSON failure.
pub use upsert_track as insert_track;

pub fn upsert_track(conn: &Connection, track: &Track) -> Result<String, DbError> {
    let tx = conn.unchecked_transaction()?;

    let existing_by_hash: Option<(String, String)> = tx
        .query_row(
            "SELECT id, path FROM tracks WHERE hash = ?1",
            [&track.hash],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;

    let track_id = if let Some((id, _old_path)) = existing_by_hash {
        // Matched on file hash: handles moved or renamed files, keeping analysis intact
        tx.execute(
            "UPDATE tracks SET
                path = ?1,
                title = coalesce(?2, title),
                artist = coalesce(?3, artist),
                album = coalesce(?4, album),
                duration_ms = ?5,
                updated_at = datetime('now')
             WHERE id = ?6",
            rusqlite::params![
                track.path,
                track.tags.title,
                track.tags.artist,
                track.tags.album,
                track.duration_ms,
                id,
            ],
        )?;
        id
    } else {
        let existing_by_path: Option<String> = tx
            .query_row(
                "SELECT id FROM tracks WHERE path = ?1",
                [&track.path],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(id) = existing_by_path {
            // Matched on path: file was modified/re-encoded at the same path
            tx.execute(
                "UPDATE tracks SET
                    hash = ?1,
                    title = coalesce(?2, title),
                    artist = coalesce(?3, artist),
                    album = coalesce(?4, album),
                    duration_ms = ?5,
                    updated_at = datetime('now')
                 WHERE id = ?6",
                rusqlite::params![
                    track.hash,
                    track.tags.title,
                    track.tags.artist,
                    track.tags.album,
                    track.duration_ms,
                    id,
                ],
            )?;
            id
        } else {
            // New track insertion
            let id = if track.id.is_empty() {
                uuid::Uuid::new_v4().to_string()
            } else {
                track.id.clone()
            };

            tx.execute(
                "INSERT INTO tracks (id, path, hash, title, artist, album, duration_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    id,
                    track.path,
                    track.hash,
                    track.tags.title,
                    track.tags.artist,
                    track.tags.album,
                    track.duration_ms,
                ],
            )?;
            id
        }
    };

    if let Some(ref analysis) = track.analysis {
        let version = track.analysis_version.as_deref().unwrap_or("v1");
        save_analysis_tx(&tx, &track_id, analysis, version)?;
    }

    let title = track.tags.title.as_deref().unwrap_or("Unknown Title");
    let artist = track.tags.artist.as_deref().unwrap_or("Unknown Artist");
    let duration_sec = (track.duration_ms / 1000.0).max(0.0);
    tx.execute(
        "INSERT INTO songs (id, track_id, title, artist, duration_seconds, updated_at)
         VALUES (?1, ?1, ?2, ?3, ?4, datetime('now'))
         ON CONFLICT (id) DO UPDATE SET
            title = excluded.title,
            artist = excluded.artist,
            duration_seconds = excluded.duration_seconds,
            updated_at = datetime('now')",
        rusqlite::params![track_id, title, artist, duration_sec],
    )?;

    tx.commit()?;
    Ok(track_id)
}

/// Internal helper to save analysis within a transaction.
fn save_analysis_tx(
    tx: &Transaction<'_>,
    track_id: &str,
    analysis: &TrackAnalysis,
    analysis_version: &str,
) -> Result<(), DbError> {
    let mode_str = match analysis.key.mode {
        Mode::Minor => "Minor",
        Mode::Major => "Major",
    };
    let camelot_letter_str = match analysis.key.camelot.letter {
        CamelotLetter::A => "A",
        CamelotLetter::B => "B",
    };
    let steady_int = if analysis.rhythm.grid.steady { 1 } else { 0 };
    let beats_json = serde_json::to_string(&analysis.rhythm.grid.beats_ms)?;
    let downbeat_flags_json = serde_json::to_string(&analysis.rhythm.grid.downbeat_flags)?;

    let rows_updated = tx.execute(
        "UPDATE tracks SET
            integrated_lufs = ?1,
            loudness_range = ?2,
            true_peak = ?3,
            first_downbeat_ms = ?4,
            bpm = ?5,
            steady = ?6,
            beats_json = ?7,
            downbeat_flags_json = ?8,
            pitch_class = ?9,
            mode = ?10,
            camelot_number = ?11,
            camelot_letter = ?12,
            tuning_cents = ?13,
            energy_score = ?14,
            analyzed_at = datetime('now'),
            analysis_version = ?15,
            updated_at = datetime('now')
         WHERE id = ?16",
        rusqlite::params![
            analysis.loudness.integrated_lufs,
            analysis.loudness.loudness_range,
            analysis.loudness.true_peak,
            analysis.rhythm.grid.first_downbeat_ms,
            analysis.rhythm.grid.bpm,
            steady_int,
            beats_json,
            downbeat_flags_json,
            analysis.key.pitch_class,
            mode_str,
            analysis.key.camelot.number,
            camelot_letter_str,
            analysis.key.tuning_cents,
            analysis.energy_score,
            analysis_version,
            track_id,
        ],
    )?;

    if rows_updated == 0 {
        return Err(DbError::TrackNotFound(track_id.to_string()));
    }

    let camelot_code = format!("{}{}", analysis.key.camelot.number, camelot_letter_str);
    tx.execute(
        "UPDATE songs SET
            bpm = ?1,
            musical_key = ?2,
            mode = ?3,
            camelot_code = ?4,
            energy_rating = ?5,
            updated_at = datetime('now')
         WHERE id = ?6 OR track_id = ?6",
        rusqlite::params![
            analysis.rhythm.grid.bpm,
            camelot_code,
            mode_str,
            camelot_code,
            analysis.energy_score,
            track_id,
        ],
    )?;

    // Structural segments
    tx.execute(
        "DELETE FROM structural_segments WHERE track_id = ?1",
        [track_id],
    )?;
    for seg in &analysis.segments {
        let label_str = match seg.label {
            SegmentLabel::Intro => "intro",
            SegmentLabel::Verse => "verse",
            SegmentLabel::Buildup => "buildup",
            SegmentLabel::Drop => "drop",
            SegmentLabel::Breakdown => "breakdown",
            SegmentLabel::Outro => "outro",
        };
        tx.execute(
            "INSERT INTO structural_segments (track_id, label, start_ms, end_ms, energy)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![track_id, label_str, seg.start_ms, seg.end_ms, seg.energy],
        )?;
    }

    // Cue points
    replace_cues_tx(tx, track_id, &analysis.cue_points)?;

    // Analysis blobs
    let energy_blob = encode_f32_blob(&analysis.energy_curve.per_bar);
    let dynamics_json = serde_json::to_string(&analysis.dynamics)?;
    let bpm_alternates_json = serde_json::to_string(&analysis.rhythm.bpm_alternates)?;

    tx.execute(
        "INSERT INTO analysis_blobs (
            track_id,
            waveform_points_per_sec,
            waveform_low_peak,
            waveform_low_rms,
            waveform_mid_peak,
            waveform_mid_rms,
            waveform_high_peak,
            waveform_high_rms,
            energy_curve_per_bar,
            dynamics_json,
            bpm_alternates_json,
            created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'))
        ON CONFLICT (track_id) DO UPDATE SET
            waveform_points_per_sec = excluded.waveform_points_per_sec,
            waveform_low_peak = excluded.waveform_low_peak,
            waveform_low_rms = excluded.waveform_low_rms,
            waveform_mid_peak = excluded.waveform_mid_peak,
            waveform_mid_rms = excluded.waveform_mid_rms,
            waveform_high_peak = excluded.waveform_high_peak,
            waveform_high_rms = excluded.waveform_high_rms,
            energy_curve_per_bar = excluded.energy_curve_per_bar,
            dynamics_json = excluded.dynamics_json,
            bpm_alternates_json = excluded.bpm_alternates_json,
            created_at = datetime('now')",
        rusqlite::params![
            track_id,
            analysis.waveform.points_per_sec,
            analysis.waveform.low.peak,
            analysis.waveform.low.rms,
            analysis.waveform.mid.peak,
            analysis.waveform.mid.rms,
            analysis.waveform.high.peak,
            analysis.waveform.high.rms,
            energy_blob,
            dynamics_json,
            bpm_alternates_json,
        ],
    )?;

    Ok(())
}

/// Saves the analysis results, segments, cues, and blobs for an existing track.
///
/// Uses an atomic transaction.
///
/// # Errors
/// Returns `DbError::TrackNotFound` if the track ID does not exist, or `DbError::Sqlite` on query failure.
pub fn save_analysis(
    conn: &Connection,
    track_id: &str,
    analysis: &TrackAnalysis,
    analysis_version: &str,
) -> Result<(), DbError> {
    let tx = conn.unchecked_transaction()?;
    save_analysis_tx(&tx, track_id, analysis, analysis_version)?;
    tx.commit()?;
    Ok(())
}

/// Internal helper to replace cue points within an ongoing transaction.
fn replace_cues_tx(tx: &Transaction<'_>, track_id: &str, cues: &[CuePoint]) -> Result<(), DbError> {
    tx.execute("DELETE FROM cue_points WHERE track_id = ?1", [track_id])?;
    for cue in cues {
        let kind_str = match cue.kind {
            CueKind::HotCue => "HotCue",
            CueKind::MemoryCue => "MemoryCue",
            CueKind::Loop => "Loop",
        };
        tx.execute(
            "INSERT INTO cue_points (track_id, cue_index, time_ms, label, color_hex, kind, loop_end_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                track_id,
                cue.index,
                cue.time_ms,
                cue.label,
                cue.color_hex,
                kind_str,
                cue.loop_end_ms,
            ],
        )?;
    }
    Ok(())
}

/// Replaces all cue points for a track in a single atomic transaction.
///
/// # Errors
/// Returns `DbError::TrackNotFound` if the track ID does not exist, or `DbError::Sqlite`.
pub fn replace_cues(conn: &Connection, track_id: &str, cues: &[CuePoint]) -> Result<(), DbError> {
    let tx = conn.unchecked_transaction()?;
    let exists: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM tracks WHERE id = ?1)",
        [track_id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(DbError::TrackNotFound(track_id.to_string()));
    }
    replace_cues_tx(&tx, track_id, cues)?;
    tx.commit()?;
    Ok(())
}

/// Retrieves a track by ID, including its full analysis, segments, cues, and waveform if analyzed.
///
/// # Errors
/// Returns `DbError` on query execution, JSON deserialization, or data integrity errors.
pub fn get_track(conn: &Connection, id: &str) -> Result<Option<Track>, DbError> {
    let track_row = conn
        .query_row(
            "SELECT
                id, path, hash, title, artist, album, duration_ms,
                integrated_lufs, loudness_range, true_peak,
                first_downbeat_ms, bpm, steady, beats_json, downbeat_flags_json,
                pitch_class, mode, camelot_number, camelot_letter, tuning_cents,
                energy_score, analyzed_at, analysis_version
             FROM tracks WHERE id = ?1",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, f64>(6)?,
                    row.get::<_, Option<f32>>(7)?,
                    row.get::<_, Option<f32>>(8)?,
                    row.get::<_, Option<f32>>(9)?,
                    row.get::<_, Option<f64>>(10)?,
                    row.get::<_, Option<f64>>(11)?,
                    row.get::<_, Option<i64>>(12)?,
                    row.get::<_, Option<String>>(13)?,
                    row.get::<_, Option<String>>(14)?,
                    row.get::<_, Option<u8>>(15)?,
                    row.get::<_, Option<String>>(16)?,
                    row.get::<_, Option<u8>>(17)?,
                    row.get::<_, Option<String>>(18)?,
                    row.get::<_, Option<f32>>(19)?,
                    row.get::<_, Option<u8>>(20)?,
                    row.get::<_, Option<String>>(21)?,
                    row.get::<_, Option<String>>(22)?,
                ))
            },
        )
        .optional()?;

    let (
        id,
        path,
        hash,
        title,
        artist,
        album,
        duration_ms,
        lufs,
        lra,
        true_peak,
        first_downbeat_ms,
        bpm,
        steady,
        beats_json,
        downbeat_flags_json,
        pitch_class,
        mode_str,
        camelot_num,
        camelot_letter_str,
        tuning_cents,
        energy_score,
        analyzed_at,
        analysis_version,
    ) = match track_row {
        Some(row) => row,
        None => return Ok(None),
    };

    let tags = TrackTags {
        title,
        artist,
        album,
    };

    let analysis = if analyzed_at.is_some() && bpm.is_some() {
        let loudness = LoudnessInfo {
            integrated_lufs: lufs.unwrap_or(0.0),
            loudness_range: lra.unwrap_or(0.0),
            true_peak: true_peak.unwrap_or(0.0),
        };

        let beats_ms: Vec<f64> = match beats_json {
            Some(ref s) => serde_json::from_str(s)?,
            None => Vec::new(),
        };

        let downbeat_flags: Vec<bool> = match downbeat_flags_json {
            Some(ref s) => serde_json::from_str(s)?,
            None => vec![false; beats_ms.len()],
        };

        let grid = BeatGrid {
            first_downbeat_ms: first_downbeat_ms.unwrap_or(0.0),
            bpm: bpm.unwrap_or(0.0),
            beats_ms,
            downbeat_flags,
            steady: steady.unwrap_or(0) != 0,
        };

        let mode = match mode_str.as_deref() {
            Some("Major") => Mode::Major,
            _ => Mode::Minor,
        };

        let camelot_letter = match camelot_letter_str.as_deref() {
            Some("B") => CamelotLetter::B,
            _ => CamelotLetter::A,
        };

        let camelot = Camelot::new(camelot_num.unwrap_or(1), camelot_letter)
            .map_err(|e| DbError::DataIntegrity(format!("invalid camelot key: {e}")))?;

        let key = Key {
            pitch_class: pitch_class.unwrap_or(0),
            mode,
            camelot,
            tuning_cents: tuning_cents.unwrap_or(0.0),
        };

        // Segments
        let mut seg_stmt = conn.prepare(
            "SELECT label, start_ms, end_ms, energy FROM structural_segments WHERE track_id = ?1 ORDER BY start_ms ASC",
        )?;
        let seg_rows = seg_stmt.query_map([&id], |row| {
            let label_str: String = row.get(0)?;
            let start_ms: f64 = row.get(1)?;
            let end_ms: f64 = row.get(2)?;
            let energy: u8 = row.get(3)?;
            Ok((label_str, start_ms, end_ms, energy))
        })?;

        let mut segments = Vec::new();
        for seg in seg_rows {
            let (label_str, start_ms, end_ms, energy) = seg?;
            let label = match label_str.as_str() {
                "intro" => SegmentLabel::Intro,
                "verse" => SegmentLabel::Verse,
                "buildup" => SegmentLabel::Buildup,
                "drop" => SegmentLabel::Drop,
                "breakdown" => SegmentLabel::Breakdown,
                "outro" => SegmentLabel::Outro,
                other => {
                    return Err(DbError::DataIntegrity(format!(
                        "unknown segment label {other}"
                    )))
                }
            };
            segments.push(Segment {
                label,
                start_ms,
                end_ms,
                energy,
            });
        }

        // Cue points
        let mut cue_stmt = conn.prepare(
            "SELECT cue_index, time_ms, label, color_hex, kind, loop_end_ms FROM cue_points WHERE track_id = ?1 ORDER BY cue_index ASC",
        )?;
        let cue_rows = cue_stmt.query_map([&id], |row| {
            let index: u8 = row.get(0)?;
            let time_ms: f64 = row.get(1)?;
            let label: String = row.get(2)?;
            let color_hex: String = row.get(3)?;
            let kind_str: String = row.get(4)?;
            let loop_end_ms: Option<f64> = row.get(5)?;
            Ok((index, time_ms, label, color_hex, kind_str, loop_end_ms))
        })?;

        let mut cue_points = Vec::new();
        for cue in cue_rows {
            let (index, time_ms, label, color_hex, kind_str, loop_end_ms) = cue?;
            let kind = match kind_str.as_str() {
                "HotCue" => CueKind::HotCue,
                "MemoryCue" => CueKind::MemoryCue,
                "Loop" => CueKind::Loop,
                other => return Err(DbError::DataIntegrity(format!("unknown cue kind {other}"))),
            };
            cue_points.push(CuePoint {
                index,
                time_ms,
                label,
                color_hex,
                kind,
                loop_end_ms,
            });
        }

        // Analysis blobs
        let blob_row = conn
            .query_row(
                "SELECT
                    waveform_points_per_sec,
                    waveform_low_peak, waveform_low_rms,
                    waveform_mid_peak, waveform_mid_rms,
                    waveform_high_peak, waveform_high_rms,
                    energy_curve_per_bar,
                    dynamics_json,
                    bpm_alternates_json
                 FROM analysis_blobs WHERE track_id = ?1",
                [&id],
                |row| {
                    Ok((
                        row.get::<_, u32>(0)?,
                        row.get::<_, Vec<u8>>(1)?,
                        row.get::<_, Vec<u8>>(2)?,
                        row.get::<_, Vec<u8>>(3)?,
                        row.get::<_, Vec<u8>>(4)?,
                        row.get::<_, Vec<u8>>(5)?,
                        row.get::<_, Vec<u8>>(6)?,
                        row.get::<_, Vec<u8>>(7)?,
                        row.get::<_, Option<String>>(8)?,
                        row.get::<_, Option<String>>(9)?,
                    ))
                },
            )
            .optional()?;

        let (waveform, energy_curve, dynamics, bpm_alternates) = if let Some((
            points_per_sec,
            low_peak,
            low_rms,
            mid_peak,
            mid_rms,
            high_peak,
            high_rms,
            energy_blob,
            dynamics_json,
            bpm_alternates_json,
        )) = blob_row
        {
            let waveform = Waveform3Band {
                points_per_sec,
                low: WaveformBand {
                    peak: low_peak,
                    rms: low_rms,
                },
                mid: WaveformBand {
                    peak: mid_peak,
                    rms: mid_rms,
                },
                high: WaveformBand {
                    peak: high_peak,
                    rms: high_rms,
                },
            };
            let energy_curve = EnergyCurve {
                per_bar: decode_f32_blob(&energy_blob),
            };
            let dynamics: DynamicsAnalysis = match dynamics_json {
                Some(ref s) => serde_json::from_str(s)?,
                None => DynamicsAnalysis {
                    frame_rate: 0.0,
                    rms_curve: Vec::new(),
                    low_ratio_curve: Vec::new(),
                    centroid_curve: Vec::new(),
                },
            };
            let bpm_alternates: Vec<f64> = match bpm_alternates_json {
                Some(ref s) => serde_json::from_str(s)?,
                None => Vec::new(),
            };
            (waveform, energy_curve, dynamics, bpm_alternates)
        } else {
            return Err(DbError::DataIntegrity(format!(
                "analysis_blobs missing for analyzed track {id}"
            )));
        };

        let rhythm = RhythmAnalysis {
            grid,
            bpm_alternates,
        };

        Some(TrackAnalysis {
            loudness,
            rhythm,
            key,
            dynamics,
            energy_score: energy_score.unwrap_or(5),
            energy_curve,
            segments,
            cue_points,
            waveform,
        })
    } else {
        None
    };

    let mut track = Track {
        id,
        path,
        hash,
        tags,
        duration_ms,
        analysis,
        analyzed_at,
        analysis_version,
    };

    if let Some(ovr) = crate::overrides::get_override(conn, &track.id)? {
        crate::overrides::apply_overrides_to_track(&mut track, &ovr)?;
    }

    Ok(Some(track))
}

/// Retrieves a track by ID along with boolean flags indicating active user overrides.
///
/// # Errors
/// Returns `DbError` on query execution, JSON deserialization, or data integrity errors.
pub fn get_track_with_overrides(
    conn: &Connection,
    id: &str,
) -> Result<Option<crate::overrides::TrackWithOverrides>, DbError> {
    match get_track(conn, id)? {
        Some(track) => {
            let flags = crate::overrides::get_override_flags(conn, id)?;
            Ok(Some(crate::overrides::TrackWithOverrides {
                track,
                overrides: flags,
            }))
        }
        None => Ok(None),
    }
}

/// Lists tracks matching the given filter criteria (BPM range, Camelot keys, energy range, text search).
///
/// # Errors
/// Returns `DbError` on database query execution failure.
pub fn list_tracks(conn: &Connection, filter: &TrackFilter) -> Result<Vec<Track>, DbError> {
    let mut sql =
        "SELECT t.id FROM tracks t LEFT JOIN track_overrides o ON o.track_id = t.id WHERE 1=1"
            .to_string();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some((min_bpm, max_bpm)) = filter.bpm_range {
        sql.push_str(" AND coalesce(o.bpm, t.bpm) >= ? AND coalesce(o.bpm, t.bpm) <= ?");
        params.push(Box::new(min_bpm));
        params.push(Box::new(max_bpm));
    }

    if let Some((min_energy, max_energy)) = filter.energy_range {
        sql.push_str(" AND t.energy_score >= ? AND t.energy_score <= ?");
        params.push(Box::new(min_energy));
        params.push(Box::new(max_energy));
    }

    if let Some(ref keys) = filter.camelot_keys {
        if !keys.is_empty() {
            sql.push_str(" AND (");
            for (i, key) in keys.iter().enumerate() {
                if i > 0 {
                    sql.push_str(" OR ");
                }
                let code = format!(
                    "{}{}",
                    key.number,
                    match key.letter {
                        CamelotLetter::A => "A",
                        CamelotLetter::B => "B",
                    }
                );
                sql.push_str(
                    "(coalesce(o.key_camelot, CASE WHEN t.camelot_number IS NOT NULL AND t.camelot_letter IS NOT NULL THEN t.camelot_number || t.camelot_letter ELSE NULL END) = ?)",
                );
                params.push(Box::new(code));
            }
            sql.push(')');
        }
    }

    if let Some(ref search) = filter.text_search {
        let trimmed = search.trim();
        if !trimmed.is_empty() {
            sql.push_str(" AND (t.title LIKE ? OR t.artist LIKE ? OR t.album LIKE ?)");
            let pattern = format!("%{trimmed}%");
            params.push(Box::new(pattern.clone()));
            params.push(Box::new(pattern.clone()));
            params.push(Box::new(pattern));
        }
    }

    sql.push_str(" ORDER BY t.artist ASC, t.title ASC, t.id ASC");

    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&sql)?;
    let track_ids: Vec<String> = stmt
        .query_map(param_refs.as_slice(), |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;

    let mut tracks = Vec::with_capacity(track_ids.len());
    for id in track_ids {
        if let Some(track) = get_track(conn, &id)? {
            tracks.push(track);
        }
    }

    Ok(tracks)
}

/// Lists tracks matching filter criteria along with active override flags.
///
/// # Errors
/// Returns `DbError` on query execution error.
pub fn list_tracks_with_overrides(
    conn: &Connection,
    filter: &TrackFilter,
) -> Result<Vec<crate::overrides::TrackWithOverrides>, DbError> {
    let tracks = list_tracks(conn, filter)?;
    let mut result = Vec::with_capacity(tracks.len());
    for track in tracks {
        let flags = crate::overrides::get_override_flags(conn, &track.id)?;
        result.push(crate::overrides::TrackWithOverrides {
            track,
            overrides: flags,
        });
    }
    Ok(result)
}

/// Deletes a track from the library. Cascades to delete segments, cue points, and analysis blobs.
///
/// Ensures foreign key cascades are enforced.
///
/// # Errors
/// Returns `DbError` on query execution error.
pub fn delete_track(conn: &Connection, id: &str) -> Result<bool, DbError> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    let rows_affected = conn.execute("DELETE FROM tracks WHERE id = ?1", [id])?;
    Ok(rows_affected > 0)
}

/// Persists or updates a musical Song record in the database.
///
/// # Errors
/// Returns `DbError` on database execution or serialization failure.
pub fn upsert_song(conn: &Connection, song: &Song) -> Result<String, DbError> {
    let mode_str = song.mode.map(|m| match m {
        Mode::Minor => "Minor",
        Mode::Major => "Major",
    });
    let tags_json = serde_json::to_string(&song.tags)?;

    let track_id_opt: Option<String> = conn
        .query_row("SELECT id FROM tracks WHERE id = ?1", [&song.id], |r| {
            r.get(0)
        })
        .optional()?;

    conn.execute(
        "INSERT INTO songs (
            id, track_id, title, artist, duration_seconds, bpm, musical_key,
            mode, camelot_code, tuning, capo, energy_rating, lead_performer,
            tags_json, notes, created_at, updated_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
            datetime('now'), datetime('now')
        ) ON CONFLICT (id) DO UPDATE SET
            title = excluded.title,
            artist = excluded.artist,
            duration_seconds = excluded.duration_seconds,
            bpm = excluded.bpm,
            musical_key = excluded.musical_key,
            mode = excluded.mode,
            camelot_code = excluded.camelot_code,
            tuning = excluded.tuning,
            capo = excluded.capo,
            energy_rating = excluded.energy_rating,
            lead_performer = excluded.lead_performer,
            tags_json = excluded.tags_json,
            notes = excluded.notes,
            updated_at = datetime('now')",
        rusqlite::params![
            song.id,
            track_id_opt,
            song.title,
            song.artist,
            song.duration_seconds,
            song.bpm,
            song.musical_key,
            mode_str,
            song.camelot_code,
            song.tuning.as_deref().unwrap_or("Standard"),
            song.capo.unwrap_or(0) as i64,
            song.energy_rating.map(|e| e as i64),
            song.lead_performer,
            tags_json,
            song.notes,
        ],
    )?;

    Ok(song.id.clone())
}

/// Retrieves a Song by its identifier.
///
/// # Errors
/// Returns `DbError` on database query execution error.
pub fn get_song(conn: &Connection, id: &str) -> Result<Option<Song>, DbError> {
    let row = conn
        .query_row(
            "SELECT id, title, artist, duration_seconds, bpm, musical_key, mode,
                    camelot_code, tuning, capo, energy_rating, lead_performer, tags_json, notes
             FROM songs WHERE id = ?1",
            [id],
            |r| {
                let id: String = r.get(0)?;
                let title: String = r.get(1)?;
                let artist: String = r.get(2)?;
                let duration_seconds: f64 = r.get(3)?;
                let bpm: Option<f64> = r.get(4)?;
                let musical_key: Option<String> = r.get(5)?;
                let mode_str: Option<String> = r.get(6)?;
                let camelot_code: Option<String> = r.get(7)?;
                let tuning: Option<String> = r.get(8)?;
                let capo: Option<u8> = r.get(9)?;
                let energy_rating: Option<u8> = r.get(10)?;
                let lead_performer: Option<String> = r.get(11)?;
                let tags_json: Option<String> = r.get(12)?;
                let notes: Option<String> = r.get(13)?;

                let mode = mode_str.and_then(|m| match m.as_str() {
                    "Minor" => Some(Mode::Minor),
                    "Major" => Some(Mode::Major),
                    _ => None,
                });

                let tags = tags_json
                    .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
                    .unwrap_or_default();

                Ok(Song {
                    id,
                    title,
                    artist,
                    duration_seconds,
                    bpm,
                    musical_key,
                    mode,
                    camelot_code,
                    tuning,
                    capo,
                    energy_rating,
                    lead_performer,
                    tags,
                    notes,
                })
            },
        )
        .optional()?;

    Ok(row)
}

/// Lists all songs in the database ordered by artist and title.
///
/// # Errors
/// Returns `DbError` on database query execution error.
pub fn list_songs(conn: &Connection) -> Result<Vec<Song>, DbError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, artist, duration_seconds, bpm, musical_key, mode,
                camelot_code, tuning, capo, energy_rating, lead_performer, tags_json, notes
         FROM songs ORDER BY artist COLLATE NOCASE ASC, title COLLATE NOCASE ASC",
    )?;

    let song_iter = stmt.query_map([], |r| {
        let id: String = r.get(0)?;
        let title: String = r.get(1)?;
        let artist: String = r.get(2)?;
        let duration_seconds: f64 = r.get(3)?;
        let bpm: Option<f64> = r.get(4)?;
        let musical_key: Option<String> = r.get(5)?;
        let mode_str: Option<String> = r.get(6)?;
        let camelot_code: Option<String> = r.get(7)?;
        let tuning: Option<String> = r.get(8)?;
        let capo: Option<u8> = r.get(9)?;
        let energy_rating: Option<u8> = r.get(10)?;
        let lead_performer: Option<String> = r.get(11)?;
        let tags_json: Option<String> = r.get(12)?;
        let notes: Option<String> = r.get(13)?;

        let mode = mode_str.and_then(|m| match m.as_str() {
            "Minor" => Some(Mode::Minor),
            "Major" => Some(Mode::Major),
            _ => None,
        });

        let tags = tags_json
            .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
            .unwrap_or_default();

        Ok(Song {
            id,
            title,
            artist,
            duration_seconds,
            bpm,
            musical_key,
            mode,
            camelot_code,
            tuning,
            capo,
            energy_rating,
            lead_performer,
            tags,
            notes,
        })
    })?;

    let mut songs = Vec::new();
    for s in song_iter {
        songs.push(s?);
    }
    Ok(songs)
}

/// Deletes a song by its identifier.
///
/// # Errors
/// Returns `DbError` on database error.
pub fn delete_song(conn: &Connection, id: &str) -> Result<bool, DbError> {
    let count = conn.execute("DELETE FROM songs WHERE id = ?1", [id])?;
    Ok(count > 0)
}

#[allow(clippy::too_many_arguments)]
fn parse_transition_from_cols(
    transition_type_str: Option<&str>,
    bpm_delta: Option<f64>,
    key_distance: Option<u8>,
    mode_flip: Option<i64>,
    intervention_required: Option<i64>,
    loop_extension_recommended: Option<i64>,
    phrase_bars: Option<u32>,
    notes_raw: Option<&str>,
) -> Option<TransitionAdvice> {
    let tt_str = transition_type_str?;
    let transition_type = match tt_str {
        "ExactMatch" => TransitionType::ExactMatch,
        "RelativeSwitch" => TransitionType::RelativeSwitch,
        "Fifth" => TransitionType::Fifth,
        "WholeStepLift" => TransitionType::WholeStepLift,
        "HalfStepLift" => TransitionType::HalfStepLift,
        "Tritone" => TransitionType::Tritone,
        _ => TransitionType::Other,
    };

    let notes: Vec<String> = notes_raw
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_else(|| {
            if let Some(s) = notes_raw {
                if !s.is_empty() {
                    vec![s.to_string()]
                } else {
                    Vec::new()
                }
            } else {
                Vec::new()
            }
        });

    Some(TransitionAdvice {
        transition_type,
        bpm_delta: bpm_delta.unwrap_or(0.0),
        key_distance: key_distance.unwrap_or(0),
        mode_flip: mode_flip.unwrap_or(0) != 0,
        intervention_required: intervention_required.unwrap_or(0) != 0,
        loop_extension_recommended: loop_extension_recommended.unwrap_or(0) != 0,
        phrase_bars: phrase_bars.unwrap_or(16),
        notes,
        ..Default::default()
    })
}

/// Saves a setlist and its ordered performance items into the database.
///
/// Writes both to `setlist_items` and legacy `setlist_entries` for backwards compatibility.
/// Operates within a single atomic transaction.
///
/// # Errors
/// Returns `DbError` on database execution or JSON serialization failure.
pub fn save_setlist(conn: &Connection, setlist: &Setlist) -> Result<(), DbError> {
    let tx = conn.unchecked_transaction()?;

    let profile_str = match setlist.energy_profile {
        EnergyProfile::LinearRamp => "LinearRamp",
        EnergyProfile::Wave => "Wave",
        EnergyProfile::PeakPlateau => "PeakPlateau",
    };

    tx.execute(
        "INSERT INTO setlists (id, name, energy_profile, created_at, updated_at)
         VALUES (?1, ?2, ?3, datetime('now'), datetime('now'))
         ON CONFLICT (id) DO UPDATE SET
             name = excluded.name,
             energy_profile = excluded.energy_profile,
             updated_at = datetime('now')",
        rusqlite::params![setlist.id, setlist.name, profile_str],
    )?;

    tx.execute(
        "DELETE FROM setlist_items WHERE setlist_id = ?1",
        [&setlist.id],
    )?;

    tx.execute(
        "DELETE FROM setlist_entries WHERE setlist_id = ?1",
        [&setlist.id],
    )?;

    for (idx, item) in setlist.items.iter().enumerate() {
        let position = if item.position > 0 {
            item.position
        } else {
            (idx + 1) as u32
        };
        let item_id = if item.id.is_empty() {
            format!("{}_{}", setlist.id, position)
        } else {
            item.id.clone()
        };

        let (
            item_type_str,
            song_id,
            title,
            duration_seconds,
            description,
            target_tuning,
            instrument,
        ) = match &item.item {
            SetlistItemType::Song { song_id, song } => (
                "song",
                Some(song_id.clone()),
                song.as_ref().map(|s| s.title.clone()),
                song.as_ref().map(|s| s.duration_seconds),
                None,
                None,
                None,
            ),
            SetlistItemType::Banter {
                topic,
                duration_seconds,
            } => (
                "banter",
                None,
                Some("Banter".to_string()),
                *duration_seconds,
                Some(topic.clone()),
                None,
                None,
            ),
            SetlistItemType::Intermission {
                duration_seconds,
                notes,
            } => (
                "intermission",
                None,
                Some("Intermission".to_string()),
                Some(*duration_seconds),
                notes.clone(),
                None,
                None,
            ),
            SetlistItemType::TuningChange {
                target_tuning,
                instrument,
            } => (
                "tuning",
                None,
                Some(format!("Tuning: {target_tuning}")),
                None,
                None,
                Some(target_tuning.clone()),
                instrument.clone(),
            ),
            SetlistItemType::Custom {
                title,
                description,
                duration_seconds,
            } => (
                "custom",
                None,
                Some(title.clone()),
                *duration_seconds,
                description.clone(),
                None,
                None,
            ),
        };

        let (
            transition_type_str,
            bpm_delta,
            key_distance,
            mode_flip,
            intervention_required,
            loop_extension_recommended,
            phrase_bars,
            notes_str,
        ) = if let Some(ref tr) = item.transition {
            let tt_str = match tr.transition_type {
                TransitionType::ExactMatch => "ExactMatch",
                TransitionType::RelativeSwitch => "RelativeSwitch",
                TransitionType::Fifth => "Fifth",
                TransitionType::WholeStepLift => "WholeStepLift",
                TransitionType::HalfStepLift => "HalfStepLift",
                TransitionType::Tritone => "Tritone",
                TransitionType::Other => "Other",
            };
            (
                Some(tt_str),
                Some(tr.bpm_delta),
                Some(tr.key_distance as i64),
                Some(if tr.mode_flip { 1 } else { 0 }),
                Some(if tr.intervention_required { 1 } else { 0 }),
                Some(if tr.loop_extension_recommended { 1 } else { 0 }),
                Some(tr.phrase_bars as i64),
                if tr.notes.is_empty() {
                    None
                } else {
                    Some(serde_json::to_string(&tr.notes)?)
                },
            )
        } else {
            (None, None, None, None, None, None, None, None)
        };

        tx.execute(
            "INSERT INTO setlist_items (
                id, setlist_id, position, item_type, song_id, title,
                duration_seconds, description, target_tuning, instrument,
                transition_type, bpm_delta, key_distance, mode_flip,
                intervention_required, loop_extension_recommended, phrase_bars,
                target_energy, notes
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6,
                ?7, ?8, ?9, ?10,
                ?11, ?12, ?13, ?14,
                ?15, ?16, ?17,
                ?18, ?19
            )",
            rusqlite::params![
                item_id,
                setlist.id,
                position,
                item_type_str,
                song_id,
                title,
                duration_seconds,
                description,
                target_tuning,
                instrument,
                transition_type_str,
                bpm_delta,
                key_distance,
                mode_flip,
                intervention_required,
                loop_extension_recommended,
                phrase_bars,
                item.target_energy,
                item.notes.as_ref().or(notes_str.as_ref()),
            ],
        )?;

        // Backwards compatibility: also write to legacy setlist_entries if track exists
        if let Some(ref tid) = song_id {
            let track_exists = tx
                .query_row("SELECT 1 FROM tracks WHERE id = ?1", [tid], |_| Ok(()))
                .is_ok();
            if track_exists {
                tx.execute(
                    "INSERT INTO setlist_entries (
                        setlist_id, track_id, position,
                        transition_type, bpm_delta, key_distance, mode_flip,
                        intervention_required, loop_extension_recommended, phrase_bars,
                        target_energy, notes
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                    rusqlite::params![
                        setlist.id,
                        tid,
                        position,
                        transition_type_str,
                        bpm_delta,
                        key_distance,
                        mode_flip,
                        intervention_required,
                        loop_extension_recommended,
                        phrase_bars,
                        item.target_energy,
                        notes_str,
                    ],
                )?;
            }
        }
    }

    tx.commit()?;
    Ok(())
}

/// Loads a setlist by ID along with its ordered performance items.
///
/// Loads from `setlist_items`, falling back to `setlist_entries` if necessary.
///
/// # Errors
/// Returns `DbError` on database query execution or parsing errors.
pub fn load_setlist(conn: &Connection, id: &str) -> Result<Option<Setlist>, DbError> {
    let setlist_row = conn
        .query_row(
            "SELECT id, name, energy_profile, created_at, updated_at FROM setlists WHERE id = ?1",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            },
        )
        .optional()?;

    let (id, name, profile_str, created_at, updated_at) = match setlist_row {
        Some(row) => row,
        None => return Ok(None),
    };

    let energy_profile = match profile_str.as_str() {
        "LinearRamp" => EnergyProfile::LinearRamp,
        "Wave" => EnergyProfile::Wave,
        "PeakPlateau" => EnergyProfile::PeakPlateau,
        other => {
            return Err(DbError::DataIntegrity(format!(
                "invalid energy profile: {other}"
            )))
        }
    };

    // First attempt to load modern setlist_items
    let mut item_stmt = conn.prepare(
        "SELECT
            id, position, item_type, song_id, title, duration_seconds,
            description, target_tuning, instrument, transition_type,
            bpm_delta, key_distance, mode_flip, intervention_required,
            loop_extension_recommended, phrase_bars, target_energy, notes
         FROM setlist_items WHERE setlist_id = ?1 ORDER BY position ASC",
    )?;

    let item_rows = item_stmt.query_map([&id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, u32>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<f64>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, Option<String>>(7)?,
            row.get::<_, Option<String>>(8)?,
            row.get::<_, Option<String>>(9)?,
            row.get::<_, Option<f64>>(10)?,
            row.get::<_, Option<u8>>(11)?,
            row.get::<_, Option<i64>>(12)?,
            row.get::<_, Option<i64>>(13)?,
            row.get::<_, Option<i64>>(14)?,
            row.get::<_, Option<u32>>(15)?,
            row.get::<_, Option<f32>>(16)?,
            row.get::<_, Option<String>>(17)?,
        ))
    })?;

    let mut items = Vec::new();
    for row_res in item_rows {
        let (
            item_id,
            position,
            item_type,
            song_id,
            title,
            duration_seconds,
            description,
            target_tuning,
            instrument,
            transition_type_str,
            bpm_delta,
            key_distance,
            mode_flip,
            intervention_required,
            loop_extension_recommended,
            phrase_bars,
            target_energy,
            notes,
        ) = row_res?;

        let transition = parse_transition_from_cols(
            transition_type_str.as_deref(),
            bpm_delta,
            key_distance,
            mode_flip,
            intervention_required,
            loop_extension_recommended,
            phrase_bars,
            notes.as_deref(),
        );

        let item_payload = match item_type.as_str() {
            "song" => {
                let s_id = song_id.unwrap_or_default();
                let song = get_song(conn, &s_id)?.or_else(|| {
                    get_track(conn, &s_id)
                        .ok()
                        .flatten()
                        .map(|t| Song::from(&t))
                });
                SetlistItemType::Song {
                    song_id: s_id,
                    song,
                }
            }
            "banter" => SetlistItemType::Banter {
                topic: description.unwrap_or_else(|| "Banter".to_string()),
                duration_seconds,
            },
            "intermission" => SetlistItemType::Intermission {
                duration_seconds: duration_seconds.unwrap_or(0.0),
                notes: description,
            },
            "tuning" => SetlistItemType::TuningChange {
                target_tuning: target_tuning.unwrap_or_else(|| "Standard".to_string()),
                instrument,
            },
            _ => SetlistItemType::Custom {
                title: title.unwrap_or_else(|| "Custom Block".to_string()),
                description,
                duration_seconds,
            },
        };

        items.push(SetlistItem {
            id: item_id,
            position,
            item: item_payload,
            transition,
            target_energy,
            notes,
        });
    }

    // If setlist_items was empty, fall back to legacy setlist_entries
    if items.is_empty() {
        let mut entry_stmt = conn.prepare(
            "SELECT
                track_id, position, transition_type, bpm_delta, key_distance, mode_flip,
                intervention_required, loop_extension_recommended, phrase_bars,
                target_energy, notes
             FROM setlist_entries WHERE setlist_id = ?1 ORDER BY position ASC",
        )?;

        let entry_rows = entry_stmt.query_map([&id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, u32>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<f64>>(3)?,
                row.get::<_, Option<u8>>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, Option<i64>>(6)?,
                row.get::<_, Option<i64>>(7)?,
                row.get::<_, Option<u32>>(8)?,
                row.get::<_, Option<f32>>(9)?,
                row.get::<_, Option<String>>(10)?,
            ))
        })?;

        for row_res in entry_rows {
            let (
                track_id,
                position,
                transition_type_str,
                bpm_delta,
                key_distance,
                mode_flip,
                intervention_required,
                loop_extension_recommended,
                phrase_bars,
                target_energy,
                notes_json,
            ) = row_res?;

            let transition = parse_transition_from_cols(
                transition_type_str.as_deref(),
                bpm_delta,
                key_distance,
                mode_flip,
                intervention_required,
                loop_extension_recommended,
                phrase_bars,
                notes_json.as_deref(),
            );

            let song = get_song(conn, &track_id)?.or_else(|| {
                get_track(conn, &track_id)
                    .ok()
                    .flatten()
                    .map(|t| Song::from(&t))
            });

            items.push(SetlistItem {
                id: format!("{id}_{position}"),
                position,
                item: SetlistItemType::Song {
                    song_id: track_id,
                    song,
                },
                transition,
                target_energy,
                notes: None,
            });
        }
    }

    Ok(Some(Setlist {
        id,
        name,
        energy_profile,
        items,
        created_at,
        updated_at,
    }))
}

/// Lists all saved setlists in descending order of update time.
///
/// # Errors
/// Returns `DbError` on database query execution error.
pub fn list_setlists(conn: &Connection) -> Result<Vec<Setlist>, DbError> {
    let mut stmt = conn.prepare("SELECT id FROM setlists ORDER BY updated_at DESC")?;
    let ids = stmt.query_map([], |r| r.get::<_, String>(0))?;

    let mut setlists = Vec::new();
    for id_res in ids {
        let id = id_res?;
        if let Some(setlist) = load_setlist(conn, &id)? {
            setlists.push(setlist);
        }
    }
    Ok(setlists)
}

/// Deletes a setlist by its identifier, cascading to all items and entries.
///
/// # Errors
/// Returns `DbError` on database error.
pub fn delete_setlist(conn: &Connection, id: &str) -> Result<bool, DbError> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    let count = conn.execute("DELETE FROM setlists WHERE id = ?1", [id])?;
    Ok(count > 0)
}

/// Loads the active setlist from the active_setlist pointer table.
///
/// Returns `Ok(None)` if no active setlist has been designated.
///
/// # Errors
/// Returns `DbError` on database error.
pub fn get_active_setlist(conn: &Connection) -> Result<Option<Setlist>, DbError> {
    let setlist_id: Option<String> = conn
        .query_row(
            "SELECT setlist_id FROM active_setlist WHERE id = 1",
            [],
            |r| r.get(0),
        )
        .optional()?;

    match setlist_id {
        Some(id) => load_setlist(conn, &id),
        None => Ok(None),
    }
}

/// Sets the active setlist pointer to the specified setlist ID.
///
/// # Errors
/// Returns `DbError` on database execution error.
pub fn set_active_setlist_id(conn: &Connection, setlist_id: &str) -> Result<(), DbError> {
    conn.execute(
        "INSERT INTO active_setlist (id, setlist_id, updated_at)
         VALUES (1, ?1, datetime('now'))
         ON CONFLICT (id) DO UPDATE SET
             setlist_id = excluded.setlist_id,
             updated_at = datetime('now')",
        [setlist_id],
    )?;
    Ok(())
}

/// Persists a setlist and sets it as the active working setlist.
///
/// # Errors
/// Returns `DbError` on failure to save setlist or update active pointer.
pub fn save_active_setlist(conn: &Connection, setlist: &Setlist) -> Result<(), DbError> {
    save_setlist(conn, setlist)?;
    set_active_setlist_id(conn, &setlist.id)?;
    Ok(())
}

/// Adds a performance item to a setlist at the specified position, shifting existing items down.
///
/// # Errors
/// Returns `DbError` on failure.
pub fn add_setlist_item(
    conn: &Connection,
    setlist_id: &str,
    item: &SetlistItem,
) -> Result<(), DbError> {
    let tx = conn.unchecked_transaction()?;

    // Shift items at or after item.position
    tx.execute(
        "UPDATE setlist_items SET position = position + 1
         WHERE setlist_id = ?1 AND position >= ?2",
        rusqlite::params![setlist_id, item.position],
    )?;

    let item_id = if item.id.is_empty() {
        format!("{}_{}", setlist_id, item.position)
    } else {
        item.id.clone()
    };

    let (item_type_str, song_id, title, duration_seconds, description, target_tuning, instrument) =
        match &item.item {
            SetlistItemType::Song { song_id, song } => (
                "song",
                Some(song_id.clone()),
                song.as_ref().map(|s| s.title.clone()),
                song.as_ref().map(|s| s.duration_seconds),
                None,
                None,
                None,
            ),
            SetlistItemType::Banter {
                topic,
                duration_seconds,
            } => (
                "banter",
                None,
                Some("Banter".to_string()),
                *duration_seconds,
                Some(topic.clone()),
                None,
                None,
            ),
            SetlistItemType::Intermission {
                duration_seconds,
                notes,
            } => (
                "intermission",
                None,
                Some("Intermission".to_string()),
                Some(*duration_seconds),
                notes.clone(),
                None,
                None,
            ),
            SetlistItemType::TuningChange {
                target_tuning,
                instrument,
            } => (
                "tuning",
                None,
                Some(format!("Tuning: {target_tuning}")),
                None,
                None,
                Some(target_tuning.clone()),
                instrument.clone(),
            ),
            SetlistItemType::Custom {
                title,
                description,
                duration_seconds,
            } => (
                "custom",
                None,
                Some(title.clone()),
                *duration_seconds,
                description.clone(),
                None,
                None,
            ),
        };

    let (
        transition_type_str,
        bpm_delta,
        key_distance,
        mode_flip,
        intervention_required,
        loop_extension_recommended,
        phrase_bars,
        notes_str,
    ) = if let Some(ref tr) = item.transition {
        let tt_str = match tr.transition_type {
            TransitionType::ExactMatch => "ExactMatch",
            TransitionType::RelativeSwitch => "RelativeSwitch",
            TransitionType::Fifth => "Fifth",
            TransitionType::WholeStepLift => "WholeStepLift",
            TransitionType::HalfStepLift => "HalfStepLift",
            TransitionType::Tritone => "Tritone",
            TransitionType::Other => "Other",
        };
        (
            Some(tt_str),
            Some(tr.bpm_delta),
            Some(tr.key_distance as i64),
            Some(if tr.mode_flip { 1 } else { 0 }),
            Some(if tr.intervention_required { 1 } else { 0 }),
            Some(if tr.loop_extension_recommended { 1 } else { 0 }),
            Some(tr.phrase_bars as i64),
            if tr.notes.is_empty() {
                None
            } else {
                Some(serde_json::to_string(&tr.notes)?)
            },
        )
    } else {
        (None, None, None, None, None, None, None, None)
    };

    tx.execute(
        "INSERT INTO setlist_items (
            id, setlist_id, position, item_type, song_id, title,
            duration_seconds, description, target_tuning, instrument,
            transition_type, bpm_delta, key_distance, mode_flip,
            intervention_required, loop_extension_recommended, phrase_bars,
            target_energy, notes
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6,
            ?7, ?8, ?9, ?10,
            ?11, ?12, ?13, ?14,
            ?15, ?16, ?17,
            ?18, ?19
        )",
        rusqlite::params![
            item_id,
            setlist_id,
            item.position,
            item_type_str,
            song_id,
            title,
            duration_seconds,
            description,
            target_tuning,
            instrument,
            transition_type_str,
            bpm_delta,
            key_distance,
            mode_flip,
            intervention_required,
            loop_extension_recommended,
            phrase_bars,
            item.target_energy,
            item.notes.as_ref().or(notes_str.as_ref()),
        ],
    )?;

    tx.execute(
        "UPDATE setlists SET updated_at = datetime('now') WHERE id = ?1",
        [setlist_id],
    )?;

    tx.commit()?;
    Ok(())
}

/// Removes a setlist item by position, shifting subsequent items up.
///
/// # Errors
/// Returns `DbError` on failure.
pub fn remove_setlist_item(
    conn: &Connection,
    setlist_id: &str,
    position: u32,
) -> Result<(), DbError> {
    let tx = conn.unchecked_transaction()?;

    tx.execute(
        "DELETE FROM setlist_items WHERE setlist_id = ?1 AND position = ?2",
        rusqlite::params![setlist_id, position],
    )?;

    let ids: Vec<String> = {
        let mut stmt =
            tx.prepare("SELECT id FROM setlist_items WHERE setlist_id = ?1 ORDER BY position ASC")?;
        let rows = stmt.query_map([setlist_id], |r| r.get(0))?;
        rows.collect::<Result<_, _>>()?
    };

    // Invert first to avoid UNIQUE constraint collisions
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE setlist_items SET position = ?1 WHERE id = ?2",
            rusqlite::params![-(i as i64 + 1), id],
        )?;
    }

    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE setlist_items SET position = ?1 WHERE id = ?2",
            rusqlite::params![i as u32 + 1, id],
        )?;
    }

    tx.execute(
        "UPDATE setlists SET updated_at = datetime('now') WHERE id = ?1",
        [setlist_id],
    )?;

    tx.commit()?;
    Ok(())
}

/// Moves a setlist item from one position to another, safely updating positions.
///
/// # Errors
/// Returns `DbError` on failure.
pub fn move_setlist_item(
    conn: &Connection,
    setlist_id: &str,
    from_pos: u32,
    to_pos: u32,
) -> Result<(), DbError> {
    if from_pos == to_pos {
        return Ok(());
    }

    let tx = conn.unchecked_transaction()?;

    let mut ids: Vec<String> = {
        let mut stmt =
            tx.prepare("SELECT id FROM setlist_items WHERE setlist_id = ?1 ORDER BY position ASC")?;
        let rows = stmt.query_map([setlist_id], |r| r.get(0))?;
        rows.collect::<Result<_, _>>()?
    };

    if from_pos == 0 || from_pos as usize > ids.len() || to_pos == 0 || to_pos as usize > ids.len()
    {
        return Err(DbError::DataIntegrity(format!(
            "item position out of range: {from_pos} -> {to_pos}"
        )));
    }

    let item_id = ids.remove((from_pos - 1) as usize);
    ids.insert((to_pos - 1) as usize, item_id);

    // Invert first to avoid UNIQUE constraint collisions
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE setlist_items SET position = ?1 WHERE id = ?2",
            rusqlite::params![-(i as i64 + 1), id],
        )?;
    }

    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE setlist_items SET position = ?1 WHERE id = ?2",
            rusqlite::params![i as u32 + 1, id],
        )?;
    }

    tx.execute(
        "UPDATE setlists SET updated_at = datetime('now') WHERE id = ?1",
        [setlist_id],
    )?;

    tx.commit()?;
    Ok(())
}

/// Updates an existing setlist item's mutable fields.
///
/// # Errors
/// Returns `DbError` on failure.
pub fn update_setlist_item(conn: &Connection, item: &SetlistItem) -> Result<(), DbError> {
    let notes_json = item
        .transition
        .as_ref()
        .map(|t| serde_json::to_string(&t.notes))
        .transpose()?;

    conn.execute(
        "UPDATE setlist_items SET
            target_energy = ?1,
            notes = ?2
         WHERE id = ?3",
        rusqlite::params![
            item.target_energy,
            item.notes.as_ref().or(notes_json.as_ref()),
            item.id
        ],
    )?;

    Ok(())
}

/// Loads the application settings from the database.
///
/// Returns `AppSettings::default()` if no settings row has been stored yet.
///
/// # Errors
/// Returns `DbError` on database error or JSON deserialization failure.
pub fn load_settings(conn: &Connection) -> Result<AppSettings, DbError> {
    let row: Option<String> = conn
        .query_row(
            "SELECT settings_json FROM app_settings WHERE id = 'default'",
            [],
            |r| r.get(0),
        )
        .optional()?;

    match row {
        Some(json) => Ok(serde_json::from_str(&json)?),
        None => Ok(AppSettings::default()),
    }
}

/// Persists the application settings to the database.
///
/// # Errors
/// Returns `DbError` on serialization or SQLite execution failure.
pub fn save_settings(conn: &Connection, settings: &AppSettings) -> Result<(), DbError> {
    let json = serde_json::to_string(settings)?;

    conn.execute(
        "INSERT INTO app_settings (id, settings_json, updated_at)
         VALUES ('default', ?1, datetime('now'))
         ON CONFLICT (id) DO UPDATE SET
            settings_json = excluded.settings_json,
            updated_at = excluded.updated_at",
        [&json],
    )?;

    Ok(())
}
