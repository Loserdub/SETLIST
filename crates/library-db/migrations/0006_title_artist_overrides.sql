-- 0006_title_artist_overrides.sql: Add nullable title and artist columns to track_overrides.

ALTER TABLE track_overrides ADD COLUMN title TEXT;
ALTER TABLE track_overrides ADD COLUMN artist TEXT;
