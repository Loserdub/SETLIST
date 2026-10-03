-- 0004_domain_and_setlist_items.sql: Normalized domain models, songs, flexible setlist items, and active setlist tracking.

-- 1. Songs table representing musical/performance metadata distinct from raw track files
CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY NOT NULL,
    track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    duration_seconds REAL NOT NULL DEFAULT 0.0,
    bpm REAL,
    musical_key TEXT,
    mode TEXT CHECK (mode IN ('Minor', 'Major')),
    camelot_code TEXT,
    tuning TEXT DEFAULT 'Standard',
    capo INTEGER DEFAULT 0 CHECK (capo >= 0),
    energy_rating INTEGER CHECK (energy_rating BETWEEN 1 AND 10),
    lead_performer TEXT,
    tags_json TEXT DEFAULT '[]',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
CREATE INDEX IF NOT EXISTS idx_songs_track ON songs(track_id);

-- Populate songs from existing tracks to preserve legacy data
INSERT OR IGNORE INTO songs (
    id, track_id, title, artist, duration_seconds, bpm, musical_key, mode, camelot_code, energy_rating
)
SELECT 
    id,
    id,
    coalesce(title, 'Unknown Title'),
    coalesce(artist, 'Unknown Artist'),
    round(duration_ms / 1000.0, 3),
    bpm,
    CASE 
        WHEN camelot_number IS NOT NULL AND camelot_letter IS NOT NULL 
        THEN camelot_number || camelot_letter 
        ELSE NULL 
    END,
    mode,
    CASE 
        WHEN camelot_number IS NOT NULL AND camelot_letter IS NOT NULL 
        THEN camelot_number || camelot_letter 
        ELSE NULL 
    END,
    energy_score
FROM tracks;

-- 2. Setlist items table supporting songs, banter, intermissions, tuning changes, and custom blocks
CREATE TABLE IF NOT EXISTS setlist_items (
    id TEXT PRIMARY KEY NOT NULL,
    setlist_id TEXT NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    item_type TEXT NOT NULL CHECK (item_type IN ('song', 'banter', 'intermission', 'tuning', 'custom')),
    song_id TEXT REFERENCES songs(id) ON DELETE SET NULL,
    title TEXT,
    duration_seconds REAL,
    description TEXT,
    target_tuning TEXT,
    instrument TEXT,
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

CREATE INDEX IF NOT EXISTS idx_setlist_items_order ON setlist_items(setlist_id, position);
CREATE INDEX IF NOT EXISTS idx_setlist_items_song ON setlist_items(song_id);

-- Migrate legacy setlist_entries into setlist_items
INSERT OR IGNORE INTO setlist_items (
    id, setlist_id, position, item_type, song_id,
    transition_type, bpm_delta, key_distance, mode_flip,
    intervention_required, loop_extension_recommended, phrase_bars,
    target_energy, notes
)
SELECT
    setlist_id || '_' || position,
    setlist_id,
    position,
    'song',
    track_id,
    transition_type, bpm_delta, key_distance, mode_flip,
    intervention_required, loop_extension_recommended, phrase_bars,
    target_energy, notes
FROM setlist_entries;

-- 3. Active setlist pointer table for restoring working setlist across restarts
CREATE TABLE IF NOT EXISTS active_setlist (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    setlist_id TEXT NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
