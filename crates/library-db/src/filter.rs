//! Search and filter criteria for querying library tracks.

use core_types::Camelot;

/// Filter options for querying tracks from the library database.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct TrackFilter {
    /// Filter by minimum and maximum BPM inclusive.
    pub bpm_range: Option<(f64, f64)>,
    /// Filter by matching any of the specified Camelot keys.
    pub camelot_keys: Option<Vec<Camelot>>,
    /// Filter by minimum and maximum energy score (1..=10) inclusive.
    pub energy_range: Option<(u8, u8)>,
    /// Case-insensitive substring search matching title, artist, or album.
    pub text_search: Option<String>,
}

impl TrackFilter {
    /// Creates an empty filter that matches all tracks.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets a BPM range filter.
    #[must_use]
    pub fn with_bpm_range(mut self, min: f64, max: f64) -> Self {
        self.bpm_range = Some((min, max));
        self
    }

    /// Sets a list of allowed Camelot keys.
    #[must_use]
    pub fn with_camelot_keys(mut self, keys: Vec<Camelot>) -> Self {
        self.camelot_keys = Some(keys);
        self
    }

    /// Sets an energy range filter.
    #[must_use]
    pub fn with_energy_range(mut self, min: u8, max: u8) -> Self {
        self.energy_range = Some((min, max));
        self
    }

    /// Sets a text search filter across title, artist, and album.
    #[must_use]
    pub fn with_text_search(mut self, text: impl Into<String>) -> Self {
        self.text_search = Some(text.into());
        self
    }
}
