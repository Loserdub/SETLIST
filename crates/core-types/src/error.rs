//! Structured application error types for domain, IPC, and persistence operations.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::validation::ValidationError;

/// Structured application error category for IPC communication and domain reporting.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, thiserror::Error, TS)]
#[serde(tag = "category", content = "details")]
#[ts(export)]
pub enum AppError {
    /// Domain validation failed with one or more validation errors.
    #[error("validation failed: {0:?}")]
    Validation(Vec<ValidationError>),

    /// Entity with specified ID was not found.
    #[error("{entity} not found with id {id}")]
    NotFound {
        /// Entity kind (e.g. "Song", "Setlist", "Track").
        entity: String,
        /// Missing entity ID.
        id: String,
    },

    /// Database or persistence failure.
    #[error("database error: {message}")]
    Database {
        /// Failure explanation.
        message: String,
    },

    /// Audio analysis or DSP pipeline failure.
    #[error("analysis error: {message}")]
    Analysis {
        /// Failure explanation.
        message: String,
    },

    /// Filesystem I/O failure.
    #[error("i/o error: {message}")]
    Io {
        /// Failure explanation.
        message: String,
    },

    /// Setlist export failure.
    #[error("export error: {message}")]
    Export {
        /// Failure explanation.
        message: String,
    },

    /// Concurrent modification conflict.
    #[error("concurrency conflict: expected version {expected}, found {actual}")]
    ConcurrencyConflict {
        /// Expected version.
        expected: u64,
        /// Current database or store version.
        actual: u64,
    },

    /// Requested operation is invalid or not permitted.
    #[error("operation not permitted: {message}")]
    NotPermitted {
        /// Reason for rejection.
        message: String,
    },
}

impl AppError {
    /// Constructs a single validation error.
    #[must_use]
    pub fn validation(
        field: impl Into<String>,
        message: impl Into<String>,
        invalid_value: Option<String>,
    ) -> Self {
        Self::Validation(vec![ValidationError::new(field, message, invalid_value)])
    }

    /// Constructs a not found error.
    #[must_use]
    pub fn not_found(entity: impl Into<String>, id: impl Into<String>) -> Self {
        Self::NotFound {
            entity: entity.into(),
            id: id.into(),
        }
    }

    /// Constructs a database error.
    #[must_use]
    pub fn database(message: impl Into<String>) -> Self {
        Self::Database {
            message: message.into(),
        }
    }

    /// Constructs an export error.
    #[must_use]
    pub fn export(message: impl Into<String>) -> Self {
        Self::Export {
            message: message.into(),
        }
    }
}

impl From<ValidationError> for AppError {
    fn from(err: ValidationError) -> Self {
        Self::Validation(vec![err])
    }
}

impl From<Vec<ValidationError>> for AppError {
    fn from(errs: Vec<ValidationError>) -> Self {
        Self::Validation(errs)
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        Self::Io {
            message: err.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_error_serialization() {
        let err = AppError::not_found("Song", "song-123");
        let json = serde_json::to_string(&err).expect("serialize AppError");
        assert!(json.contains("\"category\":\"NotFound\""));
        assert!(json.contains("\"entity\":\"Song\""));
        assert!(json.contains("\"id\":\"song-123\""));

        let deserialized: AppError = serde_json::from_str(&json).expect("deserialize AppError");
        assert_eq!(err, deserialized);
    }

    #[test]
    fn test_validation_error_grouping() {
        let errs = vec![
            ValidationError::new("bpm", "too low", Some("10".to_string())),
            ValidationError::new("energy", "too high", Some("15".to_string())),
        ];
        let app_err: AppError = errs.into();
        match app_err {
            AppError::Validation(list) => assert_eq!(list.len(), 2),
            _ => panic!("expected Validation variant"),
        }
    }
}
