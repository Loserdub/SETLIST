//! Camelot wheel key representation, musical shift math, and distance calculations.

use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;
use thiserror::Error;
use ts_rs::TS;

/// Error type for Camelot and Key operations.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum CamelotError {
    /// Invalid pitch class (must be 0..=11).
    #[error("invalid pitch class: {0} (must be 0..=11)")]
    InvalidPitchClass(u8),
    /// Invalid Camelot number (must be 1..=12).
    #[error("invalid Camelot number: {0} (must be 1..=12)")]
    InvalidNumber(u8),
    /// Error parsing a Camelot string (e.g., "8A").
    #[error("failed to parse Camelot string: {0}")]
    ParseError(String),
}

/// Musical mode: Minor or Major.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum Mode {
    /// Minor key (maps to Camelot 'A').
    Minor,
    /// Major key (maps to Camelot 'B').
    Major,
}

/// Camelot mode letter: 'A' for minor, 'B' for major.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum CamelotLetter {
    /// Minor key letter.
    A,
    /// Major key letter.
    B,
}

impl From<Mode> for CamelotLetter {
    fn from(mode: Mode) -> Self {
        match mode {
            Mode::Minor => Self::A,
            Mode::Major => Self::B,
        }
    }
}

impl From<CamelotLetter> for Mode {
    fn from(letter: CamelotLetter) -> Self {
        match letter {
            CamelotLetter::A => Self::Minor,
            CamelotLetter::B => Self::Major,
        }
    }
}

/// Camelot key representation (e.g. 8A = A minor, 8B = C major).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Camelot {
    /// Number around the wheel, from 1 to 12.
    pub number: u8,
    /// Wheel letter: A (minor) or B (major).
    pub letter: CamelotLetter,
}

impl Camelot {
    /// Creates a new Camelot key, validating that `number` is between 1 and 12.
    ///
    /// # Errors
    /// Returns `CamelotError::InvalidNumber` if `number` is not in 1..=12.
    pub fn new(number: u8, letter: CamelotLetter) -> Result<Self, CamelotError> {
        if !(1..=12).contains(&number) {
            return Err(CamelotError::InvalidNumber(number));
        }
        Ok(Self { number, letter })
    }

    /// Converts a MIDI pitch class (0 = C, 1 = C#, ..., 11 = B) and mode into its Camelot key.
    ///
    /// # Errors
    /// Returns `CamelotError::InvalidPitchClass` if `pitch_class > 11`.
    pub fn from_key(pitch_class: u8, mode: Mode) -> Result<Self, CamelotError> {
        if pitch_class > 11 {
            return Err(CamelotError::InvalidPitchClass(pitch_class));
        }

        let letter = CamelotLetter::from(mode);
        let pc = pitch_class as i32;

        let number = match mode {
            Mode::Minor => (((4 + 7 * pc).rem_euclid(12)) + 1) as u8,
            Mode::Major => (((7 + 7 * pc).rem_euclid(12)) + 1) as u8,
        };

        Ok(Self { number, letter })
    }

    /// Returns the standard musical key name as documented in AGENTS.md Table 6.1.
    #[must_use]
    pub fn to_standard_name(&self) -> &'static str {
        match (self.number, self.letter) {
            (1, CamelotLetter::A) => "Ab minor",
            (1, CamelotLetter::B) => "B major",
            (2, CamelotLetter::A) => "Eb minor",
            (2, CamelotLetter::B) => "F# major",
            (3, CamelotLetter::A) => "Bb minor",
            (3, CamelotLetter::B) => "Db major",
            (4, CamelotLetter::A) => "F minor",
            (4, CamelotLetter::B) => "Ab major",
            (5, CamelotLetter::A) => "C minor",
            (5, CamelotLetter::B) => "Eb major",
            (6, CamelotLetter::A) => "G minor",
            (6, CamelotLetter::B) => "Bb major",
            (7, CamelotLetter::A) => "D minor",
            (7, CamelotLetter::B) => "F major",
            (8, CamelotLetter::A) => "A minor",
            (8, CamelotLetter::B) => "C major",
            (9, CamelotLetter::A) => "E minor",
            (9, CamelotLetter::B) => "G major",
            (10, CamelotLetter::A) => "B minor",
            (10, CamelotLetter::B) => "D major",
            (11, CamelotLetter::A) => "F# minor",
            (11, CamelotLetter::B) => "A major",
            (12, CamelotLetter::A) => "C# minor",
            (12, CamelotLetter::B) => "E major",
            _ => "Unknown",
        }
    }

    /// Shifts the Camelot number by `s` musical semitones per AGENTS.md 6.1:
    /// `(7 * s) mod 12`.
    ///
    /// - Whole-step lift (+2 semitones) moves Camelot number by +2.
    /// - Half-step lift (+1 semitone) moves Camelot number by +7.
    /// - Tritone (+6 semitones) moves Camelot number by +6.
    #[must_use]
    pub fn shift_by_semitones(&self, semitones: i32) -> Self {
        let base_idx = self.number as i32 - 1;
        let shifted_num = (((base_idx + 7 * semitones).rem_euclid(12)) + 1) as u8;
        Self {
            number: shifted_num,
            letter: self.letter,
        }
    }

    /// Computes the circular distance `d` on the Camelot number ring (0..=6)
    /// and whether the mode flips (A vs B).
    #[must_use]
    pub fn distance(&self, other: &Self) -> (u8, bool) {
        let diff = (self.number as i32 - other.number as i32).abs();
        let d = std::cmp::min(diff, 12 - diff) as u8;
        let mode_flip = self.letter != other.letter;
        (d, mode_flip)
    }
}

impl fmt::Display for Camelot {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let letter_str = match self.letter {
            CamelotLetter::A => "A",
            CamelotLetter::B => "B",
        };
        write!(f, "{}{}", self.number, letter_str)
    }
}

impl FromStr for Camelot {
    type Err = CamelotError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            return Err(CamelotError::ParseError("empty string".to_string()));
        }

        let (num_part, letter_char) = trimmed.split_at(trimmed.len() - 1);
        let number: u8 = num_part
            .parse()
            .map_err(|_| CamelotError::ParseError(trimmed.to_string()))?;

        let letter = match letter_char.to_ascii_uppercase().as_str() {
            "A" => CamelotLetter::A,
            "B" => CamelotLetter::B,
            _ => return Err(CamelotError::ParseError(trimmed.to_string())),
        };

        Self::new(number, letter)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_table_6_1_all_rows() {
        // Table 6.1 from AGENTS.md:
        // Num | A (minor) | B (major)
        // 1   | Ab minor  | B major
        // 2   | Eb minor  | F# major
        // 3   | Bb minor  | Db major
        // 4   | F minor   | Ab major
        // 5   | C minor   | Eb major
        // 6   | G minor   | Bb major
        // 7   | D minor   | F major
        // 8   | A minor   | C major
        // 9   | E minor   | G major
        // 10  | B minor   | D major
        // 11  | F# minor  | A major
        // 12  | C# minor  | E major
        let cases = [
            (1, 8, "Ab minor", 11, "B major"),
            (2, 3, "Eb minor", 6, "F# major"),
            (3, 10, "Bb minor", 1, "Db major"),
            (4, 5, "F minor", 8, "Ab major"),
            (5, 0, "C minor", 3, "Eb major"),
            (6, 7, "G minor", 10, "Bb major"),
            (7, 2, "D minor", 5, "F major"),
            (8, 9, "A minor", 0, "C major"),
            (9, 4, "E minor", 7, "G major"),
            (10, 11, "B minor", 2, "D major"),
            (11, 6, "F# minor", 9, "A major"),
            (12, 1, "C# minor", 4, "E major"),
        ];

        for (expected_num, minor_pc, minor_name, major_pc, major_name) in cases {
            // Test Minor (A)
            let minor_key = Camelot::from_key(minor_pc, Mode::Minor).expect("valid minor pc");
            assert_eq!(
                minor_key.number, expected_num,
                "Minor number mismatch for pc {minor_pc}"
            );
            assert_eq!(minor_key.letter, CamelotLetter::A);
            assert_eq!(minor_key.to_standard_name(), minor_name);

            // Test Major (B)
            let major_key = Camelot::from_key(major_pc, Mode::Major).expect("valid major pc");
            assert_eq!(
                major_key.number, expected_num,
                "Major number mismatch for pc {major_pc}"
            );
            assert_eq!(major_key.letter, CamelotLetter::B);
            assert_eq!(major_key.to_standard_name(), major_name);
        }
    }

    #[test]
    fn test_shift_math_6_1() {
        let base_a = Camelot::new(8, CamelotLetter::A).unwrap(); // 8A = A minor

        // Whole step up: +2 semitones moves Camelot number by +2
        let whole_up = base_a.shift_by_semitones(2);
        assert_eq!(whole_up.number, 10);
        assert_eq!(whole_up.letter, CamelotLetter::A);
        assert_eq!(whole_up.to_standard_name(), "B minor");

        // Half step up: +1 semitone moves Camelot number by +7
        let half_up = base_a.shift_by_semitones(1);
        assert_eq!(half_up.number, 3);
        assert_eq!(half_up.letter, CamelotLetter::A);
        assert_eq!(half_up.to_standard_name(), "Bb minor");

        // Tritone: +6 semitones moves Camelot number by +6
        let tritone = base_a.shift_by_semitones(6);
        assert_eq!(tritone.number, 2);
        assert_eq!(tritone.letter, CamelotLetter::A);
        assert_eq!(tritone.to_standard_name(), "Eb minor");

        // Whole step down: -2 semitones moves Camelot number by -2 (or +10)
        let whole_down = base_a.shift_by_semitones(-2);
        assert_eq!(whole_down.number, 6);
        assert_eq!(whole_down.to_standard_name(), "G minor");

        // Half step down: -1 semitone moves Camelot number by -7 (or +5)
        let half_down = base_a.shift_by_semitones(-1);
        assert_eq!(half_down.number, 1);
        assert_eq!(half_down.to_standard_name(), "Ab minor");

        // Test wrap-around on wheel boundaries
        let key_11 = Camelot::new(11, CamelotLetter::B).unwrap(); // 11B = A major
        let shift_2 = key_11.shift_by_semitones(2); // 11 + 2 = 13 -> 1
        assert_eq!(shift_2.number, 1);
        assert_eq!(shift_2.to_standard_name(), "B major");

        let key_12 = Camelot::new(12, CamelotLetter::A).unwrap(); // 12A = C# minor
        let shift_1 = key_12.shift_by_semitones(1); // 12 + 7 = 19 -> 7
        assert_eq!(shift_1.number, 7);
        assert_eq!(shift_1.to_standard_name(), "D minor");
    }

    #[test]
    fn test_distance() {
        let key_8a = Camelot::new(8, CamelotLetter::A).unwrap();
        let key_8b = Camelot::new(8, CamelotLetter::B).unwrap();
        let key_9a = Camelot::new(9, CamelotLetter::A).unwrap();
        let key_9b = Camelot::new(9, CamelotLetter::B).unwrap();
        let key_1a = Camelot::new(1, CamelotLetter::A).unwrap();
        let key_12a = Camelot::new(12, CamelotLetter::A).unwrap();
        let key_2a = Camelot::new(2, CamelotLetter::A).unwrap();

        // Exact match
        assert_eq!(key_8a.distance(&key_8a), (0, false));

        // Relative switch
        assert_eq!(key_8a.distance(&key_8b), (0, true));

        // Fifth (+1 step)
        assert_eq!(key_8a.distance(&key_9a), (1, false));
        assert_eq!(key_8a.distance(&key_9b), (1, true));

        // Wrap-around distance: 1A and 12A are 1 step apart on the circle
        assert_eq!(key_1a.distance(&key_12a), (1, false));

        // Tritone: 8A and 2A are 6 steps apart
        assert_eq!(key_8a.distance(&key_2a), (6, false));
    }

    #[test]
    fn test_display_and_parse() {
        let key = Camelot::new(8, CamelotLetter::A).unwrap();
        assert_eq!(key.to_string(), "8A");

        let parsed: Camelot = "8A".parse().unwrap();
        assert_eq!(parsed, key);

        let parsed_major: Camelot = "11b".parse().unwrap();
        assert_eq!(parsed_major, Camelot::new(11, CamelotLetter::B).unwrap());

        assert!("13A".parse::<Camelot>().is_err());
        assert!("0A".parse::<Camelot>().is_err());
        assert!("8C".parse::<Camelot>().is_err());
    }
}
