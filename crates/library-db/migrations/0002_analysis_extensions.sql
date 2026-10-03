-- 0002_analysis_extensions.sql: Extend analysis tables to support full TrackAnalysis round-trip.

ALTER TABLE tracks ADD COLUMN downbeat_flags_json TEXT;
ALTER TABLE analysis_blobs ADD COLUMN dynamics_json TEXT;
ALTER TABLE analysis_blobs ADD COLUMN bpm_alternates_json TEXT;
