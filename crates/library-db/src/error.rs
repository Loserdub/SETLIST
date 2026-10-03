//! Database error types for library-db.

use thiserror::Error;

/// Error returned when database operations fail.
#[derive(Debug, Error)]
pub enum DbError {
    /// Underlying SQLite error.
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    /// Migration execution error.
    #[error("migration error: {0}")]
    Migration(String),

    /// JSON serialization or deserialization error.
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),

    /// Track with specified ID was not found.
    #[error("track not found: {0}")]
    TrackNotFound(String),

    /// Setlist with specified ID was not found.
    #[error("setlist not found: {0}")]
    SetlistNotFound(String),

    /// Data integrity or format error.
    #[error("data integrity error: {0}")]
    DataIntegrity(String),

    /// Filesystem I/O error during scanning or hashing.
    #[error("i/o error: {0}")]
    Io(#[from] std::io::Error),

    /// Scan or worker execution error.
    #[error("scan error: {0}")]
    Scan(String),
}
