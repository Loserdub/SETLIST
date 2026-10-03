//! SQLite schema migration runner.

use crate::error::DbError;
use rusqlite::Connection;

/// A database migration definition.
#[derive(Debug, Clone, Copy)]
pub struct Migration {
    /// Incremental migration version number.
    pub version: i64,
    /// Migration file name or description.
    pub name: &'static str,
    /// SQL statements to execute.
    pub sql: &'static str,
}

/// All bundled migrations ordered by version.
pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "0001_init.sql",
        sql: include_str!("../migrations/0001_init.sql"),
    },
    Migration {
        version: 2,
        name: "0002_analysis_extensions.sql",
        sql: include_str!("../migrations/0002_analysis_extensions.sql"),
    },
    Migration {
        version: 3,
        name: "0003_app_settings.sql",
        sql: include_str!("../migrations/0003_app_settings.sql"),
    },
    Migration {
        version: 4,
        name: "0004_domain_and_setlist_items.sql",
        sql: include_str!("../migrations/0004_domain_and_setlist_items.sql"),
    },
];

/// Applies all pending migrations in order, recording the schema version in SQLite.
///
/// Ensures foreign key enforcement is turned on and applies any migrations
/// that have not yet been recorded in the `schema_migrations` table.
///
/// # Errors
/// Returns `DbError` if any migration fails to execute.
pub fn apply_migrations(conn: &Connection) -> Result<(), DbError> {
    // Ensure foreign key enforcement is turned ON
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    // Create migration tracking table if not exists
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )?;

    for migration in MIGRATIONS {
        let is_applied: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?1)",
            [migration.version],
            |row| row.get(0),
        )?;

        if !is_applied {
            let tx = conn.unchecked_transaction()?;
            tx.execute_batch(migration.sql).map_err(|e| {
                DbError::Migration(format!("failed executing {}: {e}", migration.name))
            })?;
            tx.execute(
                "INSERT INTO schema_migrations (version, name) VALUES (?1, ?2)",
                rusqlite::params![migration.version, migration.name],
            )?;
            tx.pragma_update(None, "user_version", migration.version)?;
            tx.commit()?;
        }
    }

    Ok(())
}

/// Retrieves the current schema version from SQLite `PRAGMA user_version`.
///
/// # Errors
/// Returns `DbError` if query fails.
pub fn get_schema_version(conn: &Connection) -> Result<i64, DbError> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    Ok(version)
}
