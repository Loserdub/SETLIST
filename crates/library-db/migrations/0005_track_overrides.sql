-- 0005_track_overrides.sql: User correction overrides for track analysis values.

CREATE TABLE IF NOT EXISTS track_overrides (
    track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
    bpm REAL,
    first_downbeat_ms REAL,
    key_camelot TEXT,
    cues_json TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);
