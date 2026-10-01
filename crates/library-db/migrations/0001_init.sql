-- 0001_init.sql: Initial database schema for tracks, analysis, cues, and setlists.

CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY NOT NULL,
    path TEXT NOT NULL UNIQUE,
    hash TEXT NOT NULL,
    title TEXT,
    artist TEXT,
    album TEXT,
    duration_ms REAL NOT NULL,
    source_sample_rate INTEGER NOT NULL DEFAULT 44100,
    integrated_lufs REAL,
    loudness_range REAL,
    true_peak REAL,
    first_downbeat_ms REAL,
    bpm REAL,
    steady INTEGER CHECK (steady IN (0, 1)),
    beats_json TEXT,
    pitch_class INTEGER CHECK (pitch_class BETWEEN 0 AND 11),
    mode TEXT CHECK (mode IN ('Minor', 'Major')),
    camelot_number INTEGER CHECK (camelot_number BETWEEN 1 AND 12),
    camelot_letter TEXT CHECK (camelot_letter IN ('A', 'B')),
    tuning_cents REAL,
    energy_score INTEGER CHECK (energy_score BETWEEN 1 AND 10),
    analyzed_at TEXT,
    analysis_version TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS structural_segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    label TEXT NOT NULL CHECK (label IN ('intro', 'verse', 'buildup', 'drop', 'breakdown', 'outro')),
    start_ms REAL NOT NULL,
    end_ms REAL NOT NULL,
    energy INTEGER NOT NULL CHECK (energy BETWEEN 1 AND 10)
);

CREATE TABLE IF NOT EXISTS cue_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    cue_index INTEGER NOT NULL CHECK (cue_index BETWEEN 0 AND 7),
    time_ms REAL NOT NULL,
    label TEXT NOT NULL,
    color_hex TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('HotCue', 'MemoryCue', 'Loop')),
    loop_end_ms REAL
);

CREATE TABLE IF NOT EXISTS analysis_blobs (
    track_id TEXT PRIMARY KEY NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    waveform_points_per_sec INTEGER NOT NULL,
    waveform_low_peak BLOB NOT NULL,
    waveform_low_rms BLOB NOT NULL,
    waveform_mid_peak BLOB NOT NULL,
    waveform_mid_rms BLOB NOT NULL,
    waveform_high_peak BLOB NOT NULL,
    waveform_high_rms BLOB NOT NULL,
    energy_curve_per_bar BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS setlists (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    energy_profile TEXT NOT NULL CHECK (energy_profile IN ('LinearRamp', 'Wave', 'PeakPlateau')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS setlist_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setlist_id TEXT NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL,
    transition_type TEXT,
    bpm_delta REAL,
    key_distance INTEGER,
    mode_flip INTEGER CHECK (mode_flip IN (0, 1)),
    intervention_required INTEGER CHECK (intervention_required IN (0, 1)),
    loop_extension_recommended INTEGER CHECK (loop_extension_recommended IN (0, 1)),
    phrase_bars INTEGER,
    target_energy REAL,
    notes TEXT,
    UNIQUE (setlist_id, position)
);

CREATE INDEX IF NOT EXISTS idx_tracks_hash ON tracks(hash);
CREATE INDEX IF NOT EXISTS idx_structural_segments_track ON structural_segments(track_id);
CREATE INDEX IF NOT EXISTS idx_cue_points_track ON cue_points(track_id);
CREATE INDEX IF NOT EXISTS idx_setlist_entries_setlist ON setlist_entries(setlist_id, position);
