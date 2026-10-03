//! Domain types and models for the catalog relationship engine.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::types::Song;

/// BPM compatibility category between two songs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum BpmCompatibility {
    /// Exact tempo match (|ΔBPM| < 0.2).
    Exact,
    /// Very close tempo (|ΔBPM| <= 2.0).
    Close,
    /// Moderate tempo difference (|ΔBPM| <= 6.0).
    Moderate,
    /// Wide tempo difference requiring major pitch or beat transition (|ΔBPM| > 6.0).
    Wide,
    /// Half-time relation (ratio ~0.5 within 3%).
    HalfTime,
    /// Double-time relation (ratio ~2.0 within 3%).
    DoubleTime,
    /// BPM unknown or missing for one or both songs.
    Unknown,
}

/// Harmonic relationship category between two songs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum HarmonicRelation {
    /// Identical key (0 semitones, same Camelot number and mode letter).
    SameKey,
    /// Relative switch (relative major / relative minor, e.g. 8A <-> 8B).
    RelativeSwitch,
    /// Circle of fifths neighbor (+1 or -1 on Camelot wheel, e.g. 8A -> 9A or 8A -> 7A).
    Fifth,
    /// Whole-step energy lift (+2 semitones / +2 Camelot shift).
    WholeStepLift,
    /// Half-step lift (+1 semitone / +7 Camelot shift).
    HalfStepLift,
    /// Tritone clash (+6 semitones / +6 Camelot shift, maximum dissonance).
    Tritone,
    /// Other dissonant or incompatible harmonic jump.
    Dissonant,
    /// Key unknown or unanalyzed for one or both songs.
    Unknown,
}

/// Direction of energy movement from outgoing to incoming song.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum EnergyMovement {
    /// Significant or moderate rise in energy.
    Rise,
    /// Significant or moderate drop in energy.
    Fall,
    /// Steady or identical energy level.
    Steady,
    /// Energy rating unknown or missing.
    Unknown,
}

/// Instrument tuning and capo compatibility.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum TuningCompatibility {
    /// Identical tuning and capo position.
    Identical,
    /// Same tuning, capo adjustment only.
    CapoShiftOnly,
    /// Different tuning requiring instrument switch or retuning.
    RetuneRequired,
    /// Tuning or capo metadata unknown.
    Unknown,
}

/// Primary transition classification category.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum TransitionClassification {
    /// Seamless mix with compatible key, tempo, and energy.
    Smooth,
    /// Energy or tempo ramp driving dancefloor intensity upward.
    Rising,
    /// Controlled cool-down or energy decrescendo.
    Falling,
    /// Harmonically consonant modulation or relative shift.
    HarmonicTransition,
    /// Rhythmic / tempo shift or tempo half/double time modulation.
    RhythmicTempoTransition,
    /// Fast direct drop or abrupt cut on phrase boundary.
    HardCut,
    /// Intentional energy reset (e.g. peak to intimate ballad).
    EnergyReset,
    /// Intentional stylistic, tempo, or mood contrast.
    IntentionalContrast,
    /// High friction or dissonant transition with low musical compatibility.
    PoorFit,
}

/// Qualitative tier of overall transition compatibility.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum OverallCompatibility {
    /// Exceptional natural fit across all dimensions.
    Excellent,
    /// Strong musical match with minor adjustments.
    Good,
    /// Viable transition with intentional performance handling.
    Viable,
    /// Noticeable friction requiring skilled DJ technique.
    Challenging,
    /// Incompatible or dissonant transition.
    Clashing,
}

/// Structured explanation of the BPM dimension.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BpmExplanation {
    /// Numerical BPM difference (to_bpm - from_bpm).
    pub delta: Option<f64>,
    /// Ratio of incoming to outgoing BPM.
    pub ratio: Option<f64>,
    /// Compatibility category.
    pub compatibility: BpmCompatibility,
    /// Friction penalty in [0.0, 1.0].
    pub friction: f32,
    /// Human-readable explanation.
    pub explanation: String,
}

/// Structured explanation of the harmonic dimension.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct HarmonicExplanation {
    /// Harmonic relation category.
    pub relation: HarmonicRelation,
    /// Camelot circular distance (0..=6).
    pub camelot_distance: Option<u8>,
    /// Mode change indicator (minor <-> major).
    pub mode_flip: Option<bool>,
    /// Friction penalty in [0.0, 1.0].
    pub friction: f32,
    /// Human-readable explanation.
    pub explanation: String,
}

/// Structured explanation of the energy dimension.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct EnergyExplanation {
    /// Energy difference (to_energy - from_energy).
    pub delta: Option<i8>,
    /// Direction of movement.
    pub movement: EnergyMovement,
    /// Whether this jump is an intentional energy reset.
    pub is_reset: bool,
    /// Whether this jump is an intentional contrast.
    pub is_contrast: bool,
    /// Friction penalty in [0.0, 1.0].
    pub friction: f32,
    /// Human-readable explanation.
    pub explanation: String,
}

/// Structured explanation of tuning and capo compatibility.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TuningExplanation {
    /// Tuning compatibility tier.
    pub compatibility: TuningCompatibility,
    /// Friction penalty in [0.0, 1.0].
    pub friction: f32,
    /// Human-readable explanation.
    pub explanation: String,
}

/// Structured explanation of style and tag similarity.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct StyleExplanation {
    /// Shared tags between songs.
    pub shared_tags: Vec<String>,
    /// Normalized tag similarity in [0.0, 1.0].
    pub similarity: f32,
    /// Human-readable explanation.
    pub explanation: String,
}

/// Comprehensive multidimensional explanation of a song relationship.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RelationshipExplanation {
    /// BPM dimension explanation.
    pub bpm: BpmExplanation,
    /// Harmonic dimension explanation.
    pub harmony: HarmonicExplanation,
    /// Energy dimension explanation.
    pub energy: EnergyExplanation,
    /// Tuning/capo dimension explanation.
    pub tuning: TuningExplanation,
    /// Style/tag dimension explanation.
    pub style: StyleExplanation,
    /// Concise summary paragraph explaining why the songs work (or clash) together.
    pub summary: String,
}

/// Canonical multidimensional relationship between Song A and Song B (directional: A -> B).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SongRelationship {
    /// Source / outgoing song identifier.
    pub from_song_id: String,
    /// Target / incoming song identifier.
    pub to_song_id: String,
    /// Outgoing song title (for quick UI display).
    pub from_title: String,
    /// Incoming song title (for quick UI display).
    pub to_title: String,
    /// Outgoing song Camelot key code if available.
    #[serde(default)]
    pub from_key: Option<String>,
    /// Incoming song Camelot key code if available.
    #[serde(default)]
    pub to_key: Option<String>,
    /// Outgoing song BPM if available.
    #[serde(default)]
    pub from_bpm: Option<f64>,
    /// Incoming song BPM if available.
    #[serde(default)]
    pub to_bpm: Option<f64>,
    /// Outgoing song energy rating (1-10) if available.
    #[serde(default)]
    pub from_energy: Option<u8>,
    /// Incoming song energy rating (1-10) if available.
    #[serde(default)]
    pub to_energy: Option<u8>,
    /// Overall compatibility tier.
    pub compatibility: OverallCompatibility,
    /// Overall compatibility score in [0.0, 1.0] (1.0 = best).
    pub overall_score: f32,
    /// Transition friction in [0.0, 1.0] (0.0 = effortless, 1.0 = heavy intervention needed).
    pub transition_friction: f32,
    /// Primary classification.
    pub primary_classification: TransitionClassification,
    /// All applicable classifications/tags for this move.
    pub classifications: Vec<TransitionClassification>,
    /// Directional flag: whether A -> B has identical properties to B -> A.
    pub is_symmetric: bool,
    /// Detailed structured explanation data.
    pub explanation: RelationshipExplanation,
}

/// Bridge track candidate role.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum BridgeRole {
    /// Bridges two distant musical keys.
    HarmonicBridge,
    /// Bridges two disparate tempo ranges.
    TempoBridge,
    /// Bridges an abrupt energy gap.
    EnergyBridge,
    /// Bridges different genres or instrument tunings.
    StyleBridge,
}

/// Candidate bridge track connecting two disparate songs or clusters.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BridgeCandidateAnalysis {
    /// The recommended intermediate bridge song.
    pub bridge_song: Song,
    /// Relationship from Song A into Bridge Song.
    pub from_a_relationship: SongRelationship,
    /// Relationship from Bridge Song into Song B.
    pub to_b_relationship: SongRelationship,
    /// Combined route compatibility score [0.0, 1.0].
    pub combined_score: f32,
    /// Identified bridging functions performed by this song.
    pub bridge_roles: Vec<BridgeRole>,
    /// Plain-language musical explanation of why this song serves as a bridge.
    pub reason: String,
}

/// Candidate opener assessment for catalog sequencing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct OpenerCandidate {
    /// Song identifier.
    pub song_id: String,
    /// Song title.
    pub title: String,
    /// Primary artist.
    pub artist: String,
    /// Suitability score as an opener in [0.0, 1.0].
    pub opener_score: f32,
    /// Number of compatible outgoing transitions available in the catalog.
    pub compatible_outbound_count: usize,
    /// Energy rating of the song.
    #[serde(default)]
    pub energy_rating: Option<u8>,
    /// Tempo of the song.
    #[serde(default)]
    pub bpm: Option<f64>,
    /// Explanations and reasons for opener candidacy.
    pub reasons: Vec<String>,
}

/// Candidate closer assessment for catalog sequencing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CloserCandidate {
    /// Song identifier.
    pub song_id: String,
    /// Song title.
    pub title: String,
    /// Primary artist.
    pub artist: String,
    /// Suitability score as a closer in [0.0, 1.0].
    pub closer_score: f32,
    /// Number of compatible incoming transitions available in the catalog.
    pub compatible_inbound_count: usize,
    /// Energy rating of the song.
    #[serde(default)]
    pub energy_rating: Option<u8>,
    /// Tempo of the song.
    #[serde(default)]
    pub bpm: Option<f64>,
    /// Explanations and reasons for closer candidacy.
    pub reasons: Vec<String>,
}

/// A natural cluster of catalog songs that belong together.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CatalogCluster {
    /// Cluster unique identifier.
    pub id: String,
    /// Descriptive cluster label (e.g. "Peak House Groove ~124 BPM (8A/9A)").
    pub label: String,
    /// Song IDs belonging to this cluster.
    pub song_ids: Vec<String>,
    /// Average or representative tempo.
    #[serde(default)]
    pub center_bpm: Option<f64>,
    /// Camelot keys represented in the cluster.
    pub camelot_keys: Vec<String>,
    /// Average energy rating in [1.0, 10.0].
    #[serde(default)]
    pub average_energy: Option<f32>,
    /// Internal cohesion score in [0.0, 1.0].
    pub cohesion_score: f32,
    /// Plain-language description of why these songs cluster together.
    pub description: String,
}

/// Combined query result for openers and closers in the catalog.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CatalogOpenersAndClosers {
    /// Recommended opener candidates sorted by score descending.
    pub openers: Vec<OpenerCandidate>,
    /// Recommended closer candidates sorted by score descending.
    pub closers: Vec<CloserCandidate>,
}

/// Response payload containing incoming and outgoing relationships for a song.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SongRelationshipsResponse {
    /// Target song ID queried.
    pub song_id: String,
    /// Outgoing transitions from this song to other catalog songs.
    pub outgoing: Vec<SongRelationship>,
    /// Incoming transitions from other catalog songs into this song.
    pub incoming: Vec<SongRelationship>,
}

/// Catalog track identified as having low connectivity or unique outlier characteristics.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CatalogOutlier {
    /// Song identifier.
    pub song_id: String,
    /// Song title.
    pub title: String,
    /// Primary artist.
    pub artist: String,
    /// Number of strong outgoing/incoming connections (score >= 0.70).
    pub strong_connection_count: usize,
    /// Total number of viable connections (score >= 0.50).
    pub total_viable_count: usize,
    /// Maximum compatibility score achieved with any other catalog song.
    pub max_compatibility_score: f32,
    /// Tempo if analyzed.
    #[serde(default)]
    pub bpm: Option<f64>,
    /// Camelot code if analyzed.
    #[serde(default)]
    pub camelot_code: Option<String>,
    /// Energy rating if analyzed.
    #[serde(default)]
    pub energy_rating: Option<u8>,
    /// Plain-language reasons why this song is an outlier.
    pub reasons: Vec<String>,
}

/// A candidate sequenced path through the catalog satisfying discovery constraints.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DiscoveryCandidatePath {
    /// Ordered list of song identifiers along the path.
    pub song_ids: Vec<String>,
    /// Ordered song models along the path.
    pub songs: Vec<Song>,
    /// Transitions between adjacent songs along the path (length = songs.len() - 1).
    pub transitions: Vec<SongRelationship>,
    /// Total duration in seconds.
    pub total_duration_seconds: f64,
    /// Average compatibility score across all transitions [0.0, 1.0].
    pub average_score: f32,
    /// Minimum transition score along the path.
    pub min_score: f32,
    /// Energy progression array.
    pub energy_progression: Vec<u8>,
    /// Human-readable explanation of why this candidate path works.
    pub summary: String,
}

/// Discovery search query constraints for finding candidate paths.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DiscoveryConstraints {
    /// Optional starting song ID (anchor opener).
    #[serde(default)]
    pub start_song_id: Option<String>,
    /// Optional ending song ID (anchor closer).
    #[serde(default)]
    pub end_song_id: Option<String>,
    /// Required song IDs that must appear in the sequence.
    #[serde(default)]
    pub must_include_ids: Vec<String>,
    /// Target duration in minutes (e.g. 30, 45, 60).
    #[serde(default)]
    pub target_duration_minutes: Option<f64>,
    /// Duration tolerance in minutes (e.g. ±5.0 min).
    #[serde(default)]
    pub duration_tolerance_minutes: Option<f64>,
    /// Maximum number of candidate paths to return. Defaults to 5.
    #[serde(default)]
    pub limit: Option<usize>,
}

/// High-level catalog connectivity and discovery metrics.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CatalogSummaryStats {
    /// Total songs analyzed in catalog.
    pub total_songs: usize,
    /// Total possible directed song pairs.
    pub total_possible_transitions: usize,
    /// Number of highly compatible transitions (score >= 0.70).
    pub strong_transitions_count: usize,
    /// Average pairwise compatibility score across catalog.
    pub average_compatibility: f32,
    /// Number of identified clusters.
    pub cluster_count: usize,
    /// Number of low-connection outlier songs.
    pub outlier_count: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_bindings_discovery_types() {
        let _ = CatalogOutlier {
            song_id: "1".to_string(),
            title: "Outlier".to_string(),
            artist: "Artist".to_string(),
            strong_connection_count: 0,
            total_viable_count: 1,
            max_compatibility_score: 0.45,
            bpm: Some(160.0),
            camelot_code: Some("1A".to_string()),
            energy_rating: Some(10),
            reasons: vec!["Extreme tempo".to_string()],
        };

        let _ = DiscoveryConstraints::default();
    }
}
