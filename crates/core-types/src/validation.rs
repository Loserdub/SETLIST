//! Domain validation functions and structured validation errors.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::camelot::Mode;
use crate::types::{Setlist, SetlistItem, SetlistItemType, Song};

/// Structured domain validation error.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, thiserror::Error, TS)]
#[error("Validation error on '{field}': {message}")]
#[ts(export)]
pub struct ValidationError {
    /// Entity or field path that failed validation.
    pub field: String,
    /// Explanatory failure reason.
    pub message: String,
    /// Invalid value provided, formatted as string.
    pub invalid_value: Option<String>,
}

impl ValidationError {
    /// Creates a new validation error.
    #[must_use]
    pub fn new(
        field: impl Into<String>,
        message: impl Into<String>,
        invalid_value: Option<String>,
    ) -> Self {
        Self {
            field: field.into(),
            message: message.into(),
            invalid_value,
        }
    }
}

/// Validates that a track or song duration in seconds is non-negative and finite.
///
/// # Errors
/// Returns [`ValidationError`] if duration is negative, infinite, or NaN.
pub fn validate_duration_seconds(duration: f64) -> Result<(), ValidationError> {
    if !duration.is_finite() || duration < 0.0 {
        return Err(ValidationError::new(
            "duration_seconds",
            "duration must be a non-negative finite number",
            Some(duration.to_string()),
        ));
    }
    Ok(())
}

/// Validates that tempo (BPM) falls within a sensible musical range (20.0 to 300.0).
///
/// # Errors
/// Returns [`ValidationError`] if BPM is outside [20.0, 300.0], infinite, or NaN.
pub fn validate_bpm(bpm: f64) -> Result<(), ValidationError> {
    if !bpm.is_finite() || bpm < 20.0 || bpm > 300.0 {
        return Err(ValidationError::new(
            "bpm",
            "BPM must be between 20.0 and 300.0",
            Some(bpm.to_string()),
        ));
    }
    Ok(())
}

/// Validates that an energy rating is within the discrete 1 to 10 range.
///
/// # Errors
/// Returns [`ValidationError`] if energy is 0 or greater than 10.
pub fn validate_energy_rating(energy: u8) -> Result<(), ValidationError> {
    if !(1..=10).contains(&energy) {
        return Err(ValidationError::new(
            "energy_rating",
            "energy rating must be between 1 and 10",
            Some(energy.to_string()),
        ));
    }
    Ok(())
}

/// Validates guitar or instrument capo fret position (0 to 24).
///
/// # Errors
/// Returns [`ValidationError`] if capo exceeds 24 frets.
pub fn validate_capo(capo: u8) -> Result<(), ValidationError> {
    if capo > 24 {
        return Err(ValidationError::new(
            "capo",
            "capo fret must be between 0 and 24",
            Some(capo.to_string()),
        ));
    }
    Ok(())
}

/// Validates musical key notation.
///
/// Accepts standard musical keys (e.g. "C", "Am", "F#m", "Eb", "G#min", "Bb maj")
/// or Camelot notation ("1A" through "12A", "1B" through "12B").
///
/// # Errors
/// Returns [`ValidationError`] if key notation is unrecognized.
pub fn validate_key_notation(key_str: &str) -> Result<(), ValidationError> {
    let trimmed = key_str.trim();
    if trimmed.is_empty() {
        return Err(ValidationError::new(
            "musical_key",
            "musical key notation cannot be empty",
            Some(key_str.to_string()),
        ));
    }

    // Check Camelot pattern (e.g. "1A", "12B")
    if let Ok(c) = trimmed.parse::<crate::camelot::Camelot>() {
        let num = c.number;
        if (1..=12).contains(&num) {
            return Ok(());
        }
    }

    // Check standard root pitches
    let valid_roots = [
        "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb",
        "B",
    ];

    let upper = trimmed.to_uppercase();
    for root in valid_roots {
        let root_upper = root.to_uppercase();
        if upper.starts_with(&root_upper) {
            let remainder = &upper[root_upper.len()..].trim();
            if remainder.is_empty()
                || *remainder == "M"
                || *remainder == "MIN"
                || *remainder == "MINOR"
                || *remainder == "MAJ"
                || *remainder == "MAJOR"
            {
                return Ok(());
            }
        }
    }

    Err(ValidationError::new(
        "musical_key",
        "invalid musical key notation (expected standard key like 'Am', 'C', or Camelot like '8A')",
        Some(key_str.to_string()),
    ))
}

/// Validates musical mode string ("Major" or "Minor").
///
/// # Errors
/// Returns [`ValidationError`] if mode string does not match Major or Minor.
pub fn validate_mode(mode_str: &str) -> Result<Mode, ValidationError> {
    let trimmed = mode_str.trim().to_lowercase();
    match trimmed.as_str() {
        "major" | "maj" | "b" => Ok(Mode::Major),
        "minor" | "min" | "m" | "a" => Ok(Mode::Minor),
        _ => Err(ValidationError::new(
            "mode",
            "mode must be either 'Major' or 'Minor'",
            Some(mode_str.to_string()),
        )),
    }
}

/// Validates an instrument tuning identifier.
///
/// Accepts common tuning names (e.g. "Standard", "Drop D", "DADGAD", "Open G", "Half-Step Down")
/// or custom identifiers up to 50 characters without control characters.
///
/// # Errors
/// Returns [`ValidationError`] if tuning is empty, too long, or contains control characters.
pub fn validate_tuning(tuning_str: &str) -> Result<(), ValidationError> {
    let trimmed = tuning_str.trim();
    if trimmed.is_empty() || trimmed.len() > 50 {
        return Err(ValidationError::new(
            "tuning",
            "tuning identifier must be between 1 and 50 characters",
            Some(tuning_str.to_string()),
        ));
    }

    if trimmed.chars().any(|c| c.is_control()) {
        return Err(ValidationError::new(
            "tuning",
            "tuning identifier cannot contain control characters",
            Some(tuning_str.to_string()),
        ));
    }

    Ok(())
}

/// Validates all domain constraints of a [`Song`].
///
/// # Errors
/// Returns a list of [`ValidationError`]s if any field fails domain validation.
pub fn validate_song(song: &Song) -> Result<(), Vec<ValidationError>> {
    let mut errors = Vec::new();

    if song.title.trim().is_empty() {
        errors.push(ValidationError::new(
            "title",
            "song title cannot be empty",
            None,
        ));
    }

    if let Err(e) = validate_duration_seconds(song.duration_seconds) {
        errors.push(e);
    }

    if let Some(bpm) = song.bpm {
        if let Err(e) = validate_bpm(bpm) {
            errors.push(e);
        }
    }

    if let Some(ref key) = song.musical_key {
        if let Err(e) = validate_key_notation(key) {
            errors.push(e);
        }
    }

    if let Some(ref tuning) = song.tuning {
        if let Err(e) = validate_tuning(tuning) {
            errors.push(e);
        }
    }

    if let Some(capo) = song.capo {
        if let Err(e) = validate_capo(capo) {
            errors.push(e);
        }
    }

    if let Some(energy) = song.energy_rating {
        if let Err(e) = validate_energy_rating(energy) {
            errors.push(e);
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

/// Validates all domain constraints of a [`SetlistItem`].
///
/// # Errors
/// Returns a list of [`ValidationError`]s if validation fails.
pub fn validate_setlist_item(item: &SetlistItem) -> Result<(), Vec<ValidationError>> {
    let mut errors = Vec::new();

    if item.id.trim().is_empty() {
        errors.push(ValidationError::new(
            "id",
            "setlist item id cannot be empty",
            None,
        ));
    }

    if item.position == 0 {
        errors.push(ValidationError::new(
            "position",
            "item position must be 1-based (>= 1)",
            Some(item.position.to_string()),
        ));
    }

    match &item.item {
        SetlistItemType::Song { song_id, song } => {
            if song_id.trim().is_empty() {
                errors.push(ValidationError::new(
                    "item.song_id",
                    "song_id cannot be empty for song item",
                    None,
                ));
            }
            if let Some(ref s) = song {
                if let Err(song_errors) = validate_song(s) {
                    errors.extend(song_errors);
                }
            }
        }
        SetlistItemType::Banter {
            topic,
            duration_seconds,
        } => {
            if topic.trim().is_empty() {
                errors.push(ValidationError::new(
                    "item.topic",
                    "banter topic cannot be empty",
                    None,
                ));
            }
            if let Some(dur) = duration_seconds {
                if let Err(e) = validate_duration_seconds(*dur) {
                    errors.push(e);
                }
            }
        }
        SetlistItemType::Intermission {
            duration_seconds, ..
        } => {
            if let Err(e) = validate_duration_seconds(*duration_seconds) {
                errors.push(e);
            }
        }
        SetlistItemType::TuningChange { target_tuning, .. } => {
            if let Err(e) = validate_tuning(target_tuning) {
                errors.push(e);
            }
        }
        SetlistItemType::Custom {
            title,
            duration_seconds,
            ..
        } => {
            if title.trim().is_empty() {
                errors.push(ValidationError::new(
                    "item.title",
                    "custom block title cannot be empty",
                    None,
                ));
            }
            if let Some(dur) = duration_seconds {
                if let Err(e) = validate_duration_seconds(*dur) {
                    errors.push(e);
                }
            }
        }
    }

    if let Some(target_energy) = item.target_energy {
        if !target_energy.is_finite() || target_energy < 0.0 || target_energy > 10.0 {
            errors.push(ValidationError::new(
                "target_energy",
                "target energy must be in range [0.0, 10.0]",
                Some(target_energy.to_string()),
            ));
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

/// Validates complete [`Setlist`] domain model.
///
/// Ensures positions are 1-indexed, contiguous, and each item conforms to domain rules.
///
/// # Errors
/// Returns a list of [`ValidationError`]s on failure.
pub fn validate_setlist(setlist: &Setlist) -> Result<(), Vec<ValidationError>> {
    let mut errors = Vec::new();

    if setlist.id.trim().is_empty() {
        errors.push(ValidationError::new(
            "id",
            "setlist id cannot be empty",
            None,
        ));
    }

    if setlist.name.trim().is_empty() {
        errors.push(ValidationError::new(
            "name",
            "setlist name cannot be empty",
            None,
        ));
    }

    for (expected_idx, item) in setlist.items.iter().enumerate() {
        let expected_pos = (expected_idx + 1) as u32;
        if item.position != expected_pos {
            errors.push(ValidationError::new(
                format!("items[{}].position", expected_idx),
                format!(
                    "setlist positions must be contiguous 1-based (expected {}, found {})",
                    expected_pos, item.position
                ),
                Some(item.position.to_string()),
            ));
        }

        if let Err(item_errors) = validate_setlist_item(item) {
            errors.extend(item_errors);
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::EnergyProfile;

    #[test]
    fn test_validate_duration() {
        assert!(validate_duration_seconds(0.0).is_ok());
        assert!(validate_duration_seconds(180.5).is_ok());
        assert!(validate_duration_seconds(-1.0).is_err());
        assert!(validate_duration_seconds(f64::NAN).is_err());
        assert!(validate_duration_seconds(f64::INFINITY).is_err());
    }

    #[test]
    fn test_validate_bpm() {
        assert!(validate_bpm(124.0).is_ok());
        assert!(validate_bpm(20.0).is_ok());
        assert!(validate_bpm(300.0).is_ok());
        assert!(validate_bpm(19.9).is_err());
        assert!(validate_bpm(300.1).is_err());
        assert!(validate_bpm(-120.0).is_err());
    }

    #[test]
    fn test_validate_energy() {
        assert!(validate_energy_rating(1).is_ok());
        assert!(validate_energy_rating(10).is_ok());
        assert!(validate_energy_rating(0).is_err());
        assert!(validate_energy_rating(11).is_err());
    }

    #[test]
    fn test_validate_capo() {
        assert!(validate_capo(0).is_ok());
        assert!(validate_capo(7).is_ok());
        assert!(validate_capo(24).is_ok());
        assert!(validate_capo(25).is_err());
    }

    #[test]
    fn test_validate_key() {
        assert!(validate_key_notation("C").is_ok());
        assert!(validate_key_notation("Am").is_ok());
        assert!(validate_key_notation("F#m").is_ok());
        assert!(validate_key_notation("Eb Major").is_ok());
        assert!(validate_key_notation("8A").is_ok());
        assert!(validate_key_notation("12B").is_ok());
        assert!(validate_key_notation("").is_err());
        assert!(validate_key_notation("H# minor").is_err());
        assert!(validate_key_notation("13A").is_err());
    }

    #[test]
    fn test_validate_tuning() {
        assert!(validate_tuning("Standard").is_ok());
        assert!(validate_tuning("Drop D").is_ok());
        assert!(validate_tuning("DADGAD").is_ok());
        assert!(validate_tuning("").is_err());
        assert!(validate_tuning("   ").is_err());
        assert!(validate_tuning(&"A".repeat(51)).is_err());
    }

    #[test]
    fn test_validate_song_success_and_failures() {
        let valid_song = Song {
            id: "song-1".to_string(),
            title: "Midnight City".to_string(),
            artist: "M83".to_string(),
            duration_seconds: 243.0,
            bpm: Some(105.0),
            musical_key: Some("B minor".to_string()),
            mode: Some(Mode::Minor),
            camelot_code: Some("10A".to_string()),
            tuning: Some("Standard".to_string()),
            capo: Some(0),
            energy_rating: Some(8),
            lead_performer: None,
            tags: vec!["electronic".to_string()],
            notes: None,
        };
        assert!(validate_song(&valid_song).is_ok());

        let invalid_song = Song {
            title: "".to_string(),
            duration_seconds: -10.0,
            bpm: Some(500.0),
            energy_rating: Some(15),
            ..valid_song
        };
        let errs = validate_song(&invalid_song).unwrap_err();
        assert_eq!(errs.len(), 4);
    }

    #[test]
    fn test_validate_setlist_contiguity() {
        let song_item = SetlistItem {
            id: "item1".to_string(),
            position: 1,
            item: SetlistItemType::Song {
                song_id: "s1".to_string(),
                song: None,
            },
            transition: None,
            target_energy: Some(5.0),
            notes: None,
        };

        let banter_item = SetlistItem {
            id: "item2".to_string(),
            position: 2,
            item: SetlistItemType::Banter {
                topic: "Intro welcome".to_string(),
                duration_seconds: Some(30.0),
            },
            transition: None,
            target_energy: None,
            notes: None,
        };

        let setlist = Setlist {
            id: "set-1".to_string(),
            name: "Summer Gig".to_string(),
            energy_profile: EnergyProfile::LinearRamp,
            items: vec![song_item, banter_item],
            created_at: None,
            updated_at: None,
        };
        assert!(validate_setlist(&setlist).is_ok());

        // Broken contiguity
        let mut broken_setlist = setlist;
        broken_setlist.items[1].position = 4;
        let errs = validate_setlist(&broken_setlist).unwrap_err();
        assert!(errs.iter().any(|e| e.field.contains("position")));
    }
}
