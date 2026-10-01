//! SQLite repository, track library scanner, and background job queue.

use thiserror::Error;

/// Error returned when database operations fail.
#[derive(Debug, Error)]
pub enum DbError {
    /// Functionality is not yet implemented.
    #[error("not implemented")]
    NotImplemented,
    /// Underlying SQLite error.
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    /// Migration execution error.
    #[error("migration error: {0}")]
    Migration(String),
}

/// Applies initial migration SQL to the SQLite connection.
///
/// # Errors
/// Returns `DbError` if migration fails.
pub fn apply_migrations(conn: &rusqlite::Connection) -> Result<(), DbError> {
    const INIT_SQL: &str = include_str!("../migrations/0001_init.sql");
    conn.execute_batch(INIT_SQL)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_apply_migrations_in_memory() {
        let conn = rusqlite::Connection::open_in_memory().expect("open in-memory db");
        apply_migrations(&conn).expect("migrations applied cleanly");

        // Verify tracks insert with constant beat grid fields and optional beats_json
        conn.execute(
            "INSERT INTO tracks (id, path, hash, duration_ms, first_downbeat_ms, bpm, steady, beats_json)
             VALUES ('t1', '/path/to/song.mp3', 'hash123', 180000.0, 100.0, 128.0, 1, '[100.0, 568.75]')",
            [],
        ).unwrap();

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
}
