-- 0007_indexing_and_catalog_revision.sql: Performance indexes, catalog revision table, and scan fast-path metadata.

-- 1. Indexing for song queries and alphabetical listing
CREATE INDEX IF NOT EXISTS idx_songs_artist_title_nocase ON songs(artist COLLATE NOCASE, title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_songs_bpm ON songs(bpm);
CREATE INDEX IF NOT EXISTS idx_songs_camelot ON songs(camelot_code);
CREATE INDEX IF NOT EXISTS idx_songs_energy ON songs(energy_rating);

-- 2. Indexing for track queries and filters
CREATE INDEX IF NOT EXISTS idx_tracks_bpm ON tracks(bpm);
CREATE INDEX IF NOT EXISTS idx_tracks_camelot ON tracks(camelot_number, camelot_letter);
CREATE INDEX IF NOT EXISTS idx_tracks_energy ON tracks(energy_score);
CREATE INDEX IF NOT EXISTS idx_tracks_artist_title_nocase ON tracks(artist COLLATE NOCASE, title COLLATE NOCASE);

-- 3. Fast incremental rescan metadata columns
ALTER TABLE tracks ADD COLUMN file_size INTEGER;
ALTER TABLE tracks ADD COLUMN file_mtime INTEGER;
ALTER TABLE tracks ADD COLUMN is_available INTEGER NOT NULL DEFAULT 1;

-- 4. Monotonic catalog revision table
CREATE TABLE IF NOT EXISTS catalog_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value INTEGER NOT NULL
);
INSERT OR IGNORE INTO catalog_meta (key, value) VALUES ('catalog_revision', 1);
