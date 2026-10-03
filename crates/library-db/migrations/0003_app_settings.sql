-- 0003_app_settings.sql: Persist application settings (cost weights, key penalty table, energy model, worker count).

CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY NOT NULL,
    settings_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
