//! Relationship and catalog intelligence engine for DJ Set Assistant.
//!
//! Provides multidimensional evaluation of song-to-song relationships,
//! explainable transition dimensions, catalog graph querying, deterministic clustering,
//! bridge track detection, and opener/closer heuristics.

use std::collections::{HashMap, HashSet};

use core_types::{
    BpmCompatibility, BpmExplanation, BridgeCandidateAnalysis, BridgeRole, Camelot, CamelotLetter,
    CatalogCluster, CatalogOpenersAndClosers, CatalogOutlier, CatalogSummaryStats, CloserCandidate,
    DiscoveryCandidatePath, DiscoveryConstraints, EnergyExplanation, EnergyMovement,
    HarmonicExplanation, HarmonicRelation, OpenerCandidate, OverallCompatibility,
    RelationshipExplanation, Song, SongRelationship, SongRelationshipsResponse, StyleExplanation,
    TransitionClassification, TuningCompatibility, TuningExplanation,
};

/// Parses a musical key or Camelot code string into a strongly-typed [`Camelot`] wheel representation.
///
/// Accepts Camelot codes (e.g. "8A", "11B", "8a") or standard musical key notations
/// (e.g. "A minor", "Am", "C major", "C", "F#m", "Eb").
#[must_use]
pub fn parse_key_to_camelot(key_str: &str) -> Option<Camelot> {
    let trimmed = key_str.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Direct Camelot string parse (e.g. "8A", "12B")
    if let Ok(c) = trimmed.parse::<Camelot>() {
        return Some(c);
    }

    let upper = trimmed.to_uppercase();
    // Normalized key names mapping to Camelot codes per AGENTS.md Table 6.1
    match upper.as_str() {
        // 1A / 1B
        "AB MINOR" | "ABM" | "G# MINOR" | "G#M" => Camelot::new(1, CamelotLetter::A).ok(),
        "B MAJOR" | "B" => Camelot::new(1, CamelotLetter::B).ok(),

        // 2A / 2B
        "EB MINOR" | "EBM" | "D# MINOR" | "D#M" => Camelot::new(2, CamelotLetter::A).ok(),
        "F# MAJOR" | "F#" | "GB MAJOR" | "GB" => Camelot::new(2, CamelotLetter::B).ok(),

        // 3A / 3B
        "BB MINOR" | "BBM" | "A# MINOR" | "A#M" => Camelot::new(3, CamelotLetter::A).ok(),
        "DB MAJOR" | "DB" | "C# MAJOR" | "C#" => Camelot::new(3, CamelotLetter::B).ok(),

        // 4A / 4B
        "F MINOR" | "FM" => Camelot::new(4, CamelotLetter::A).ok(),
        "AB MAJOR" | "AB" | "G# MAJOR" | "G#" => Camelot::new(4, CamelotLetter::B).ok(),

        // 5A / 5B
        "C MINOR" | "CM" => Camelot::new(5, CamelotLetter::A).ok(),
        "EB MAJOR" | "EB" | "D# MAJOR" | "D#" => Camelot::new(5, CamelotLetter::B).ok(),

        // 6A / 6B
        "G MINOR" | "GM" => Camelot::new(6, CamelotLetter::A).ok(),
        "BB MAJOR" | "BB" | "A# MAJOR" | "A#" => Camelot::new(6, CamelotLetter::B).ok(),

        // 7A / 7B
        "D MINOR" | "DM" => Camelot::new(7, CamelotLetter::A).ok(),
        "F MAJOR" | "F" => Camelot::new(7, CamelotLetter::B).ok(),

        // 8A / 8B
        "A MINOR" | "AM" => Camelot::new(8, CamelotLetter::A).ok(),
        "C MAJOR" | "C" => Camelot::new(8, CamelotLetter::B).ok(),

        // 9A / 9B
        "E MINOR" | "EM" => Camelot::new(9, CamelotLetter::A).ok(),
        "G MAJOR" | "G" => Camelot::new(9, CamelotLetter::B).ok(),

        // 10A / 10B
        "B MINOR" | "BM" => Camelot::new(10, CamelotLetter::A).ok(),
        "D MAJOR" | "D" => Camelot::new(10, CamelotLetter::B).ok(),

        // 11A / 11B
        "F# MINOR" | "F#M" | "GB MINOR" | "GBM" => Camelot::new(11, CamelotLetter::A).ok(),
        "A MAJOR" | "A" => Camelot::new(11, CamelotLetter::B).ok(),

        // 12A / 12B
        "C# MINOR" | "C#M" | "DB MINOR" | "DBM" => Camelot::new(12, CamelotLetter::A).ok(),
        "E MAJOR" | "E" => Camelot::new(12, CamelotLetter::B).ok(),

        _ => None,
    }
}

/// Evaluates the BPM relationship between two songs.
#[must_use]
pub fn evaluate_bpm_relationship(bpm_from: Option<f64>, bpm_to: Option<f64>) -> BpmExplanation {
    let (bpm_a, bpm_b) = match (bpm_from, bpm_to) {
        (Some(a), Some(b)) if a > 0.0 && b > 0.0 && !a.is_nan() && !b.is_nan() => (a, b),
        _ => {
            return BpmExplanation {
                delta: None,
                ratio: None,
                compatibility: BpmCompatibility::Unknown,
                friction: 0.40,
                explanation: "Tempo metadata unanalyzed or missing for one or both tracks."
                    .to_string(),
            };
        }
    };

    let delta = bpm_b - bpm_a;
    let abs_delta = delta.abs();
    let ratio = bpm_b / bpm_a;

    // Check for octave / half-time / double-time relations within 3% tolerance
    if (ratio - 0.5).abs() / 0.5 <= 0.03 {
        let adjusted_b = bpm_b * 2.0;
        let adj_delta = (adjusted_b - bpm_a).abs();
        let friction = (0.15 + (adj_delta / 20.0) as f32).clamp(0.15, 0.40);
        return BpmExplanation {
            delta: Some(delta),
            ratio: Some(ratio),
            compatibility: BpmCompatibility::HalfTime,
            friction,
            explanation: format!(
                "Half-time relationship ({:.1} -> {:.1} BPM, effective match {:.1} BPM): Rhythmic half-time lock with smooth half-speed pulse.",
                bpm_a, bpm_b, adjusted_b
            ),
        };
    }

    if (ratio - 2.0).abs() / 2.0 <= 0.03 {
        let adjusted_b = bpm_b * 0.5;
        let adj_delta = (adjusted_b - bpm_a).abs();
        let friction = (0.15 + (adj_delta / 20.0) as f32).clamp(0.15, 0.40);
        return BpmExplanation {
            delta: Some(delta),
            ratio: Some(ratio),
            compatibility: BpmCompatibility::DoubleTime,
            friction,
            explanation: format!(
                "Double-time relationship ({:.1} -> {:.1} BPM, effective match {:.1} BPM): Rhythmic double-time lock with driving double-speed tempo.",
                bpm_a, bpm_b, adjusted_b
            ),
        };
    }

    if abs_delta < 0.2 {
        BpmExplanation {
            delta: Some(delta),
            ratio: Some(ratio),
            compatibility: BpmCompatibility::Exact,
            friction: 0.00,
            explanation: format!(
                "Identical tempo ({:.1} BPM): Flawless beatmatching with zero pitch bend.",
                bpm_a
            ),
        }
    } else if abs_delta <= 2.0 {
        let friction = (abs_delta / 12.0) as f32;
        BpmExplanation {
            delta: Some(delta),
            ratio: Some(ratio),
            compatibility: BpmCompatibility::Close,
            friction,
            explanation: format!(
                "{:+0.1} BPM ({:.1} -> {:.1} BPM): Minimal tempo change; effortless blend with subtle pitch correction.",
                delta, bpm_a, bpm_b
            ),
        }
    } else if abs_delta <= 6.0 {
        let friction = (abs_delta / 8.0) as f32;
        BpmExplanation {
            delta: Some(delta),
            ratio: Some(ratio),
            compatibility: BpmCompatibility::Moderate,
            friction,
            explanation: format!(
                "{:+0.1} BPM ({:.1} -> {:.1} BPM): Moderate tempo shift; easily manageable with progressive pitch ride.",
                delta, bpm_a, bpm_b
            ),
        }
    } else {
        let friction = (0.50 + ((abs_delta - 6.0) / 24.0) as f32).clamp(0.50, 1.0);
        BpmExplanation {
            delta: Some(delta),
            ratio: Some(ratio),
            compatibility: BpmCompatibility::Wide,
            friction,
            explanation: format!(
                "{:+0.1} BPM ({:.1} -> {:.1} BPM): Wide tempo discrepancy; best transitioned during ambient breakdown, echo freeze, or direct cut.",
                delta, bpm_a, bpm_b
            ),
        }
    }
}

/// Evaluates the harmonic relationship between two songs.
#[must_use]
pub fn evaluate_harmonic_relationship(
    key_from: Option<&str>,
    key_to: Option<&str>,
) -> HarmonicExplanation {
    let camelot_a = key_from.and_then(parse_key_to_camelot);
    let camelot_b = key_to.and_then(parse_key_to_camelot);

    let (c_a, c_b) = match (camelot_a, camelot_b) {
        (Some(a), Some(b)) => (a, b),
        _ => {
            return HarmonicExplanation {
                relation: HarmonicRelation::Unknown,
                camelot_distance: None,
                mode_flip: None,
                friction: 0.40,
                explanation: "Musical key or Camelot metadata unanalyzed for one or both tracks."
                    .to_string(),
            };
        }
    };

    let (d, mode_flip) = c_a.distance(&c_b);

    if d == 0 && !mode_flip {
        HarmonicExplanation {
            relation: HarmonicRelation::SameKey,
            camelot_distance: Some(0),
            mode_flip: Some(false),
            friction: 0.00,
            explanation: format!(
                "Exact key match ({} / {}): Perfect harmonic consonance with identical tonal center.",
                c_a,
                c_a.to_standard_name()
            ),
        }
    } else if d == 0 && mode_flip {
        HarmonicExplanation {
            relation: HarmonicRelation::RelativeSwitch,
            camelot_distance: Some(0),
            mode_flip: Some(true),
            friction: 0.10,
            explanation: format!(
                "Relative major/minor shift ({} <-> {}): High harmonic consonance with expressive tonal color shift.",
                c_a, c_b
            ),
        }
    } else if d == 1 && !mode_flip {
        HarmonicExplanation {
            relation: HarmonicRelation::Fifth,
            camelot_distance: Some(1),
            mode_flip: Some(false),
            friction: 0.10,
            explanation: format!(
                "Perfect fifth step on Camelot ring ({} -> {}): Classic harmonic modulation with smooth resolution.",
                c_a, c_b
            ),
        }
    } else if d == 2 && !mode_flip {
        HarmonicExplanation {
            relation: HarmonicRelation::WholeStepLift,
            camelot_distance: Some(2),
            mode_flip: Some(false),
            friction: 0.35,
            explanation: format!(
                "Whole-step lift (+2 semitones, {} -> {}): Moderate harmonic tension producing an exhilarating energy lift.",
                c_a, c_b
            ),
        }
    } else if d == 5 && !mode_flip {
        // Half-step lift is +7 around the Camelot circle: circular distance is 5
        HarmonicExplanation {
            relation: HarmonicRelation::HalfStepLift,
            camelot_distance: Some(5),
            mode_flip: Some(false),
            friction: 0.65,
            explanation: format!(
                "Half-step lift (+1 semitone, {} -> {}): High dissonance during overlap; best executed via rapid drop swap or direct phrase cut.",
                c_a, c_b
            ),
        }
    } else if d == 6 {
        HarmonicExplanation {
            relation: HarmonicRelation::Tritone,
            camelot_distance: Some(6),
            mode_flip: Some(mode_flip),
            friction: 1.00,
            explanation: format!(
                "Tritone jump ({} -> {}): Maximum harmonic dissonance (+6 semitones); avoid overlapping tonal stems.",
                c_a, c_b
            ),
        }
    } else {
        let friction = match (d, mode_flip) {
            (1, true) => 0.40,
            (2, true) => 0.60,
            (3, false) => 0.70,
            (3, true) => 0.80,
            (4, false) => 0.85,
            (4, true) => 0.90,
            (5, _) => 0.95,
            _ => 0.85,
        };
        HarmonicExplanation {
            relation: HarmonicRelation::Dissonant,
            camelot_distance: Some(d),
            mode_flip: Some(mode_flip),
            friction,
            explanation: format!(
                "Harmonically distant keys ({} -> {}, circular step {}): Tonal clash; separate with percussion loop or filter cut.",
                c_a, c_b, d
            ),
        }
    }
}

/// Evaluates the energy trajectory and movement between two songs.
#[must_use]
pub fn evaluate_energy_relationship(
    energy_from: Option<u8>,
    energy_to: Option<u8>,
) -> EnergyExplanation {
    let (e_a, e_b) = match (energy_from, energy_to) {
        (Some(a), Some(b)) => (a as i8, b as i8),
        _ => {
            return EnergyExplanation {
                delta: None,
                movement: EnergyMovement::Unknown,
                is_reset: false,
                is_contrast: false,
                friction: 0.30,
                explanation: "Energy rating not specified for one or both tracks.".to_string(),
            };
        }
    };

    let delta = e_b - e_a;
    let movement = if delta > 0 {
        EnergyMovement::Rise
    } else if delta < 0 {
        EnergyMovement::Fall
    } else {
        EnergyMovement::Steady
    };

    // Intentional energy reset: dropping from peak intensity (>= 7) to low/medium (<= 4)
    if e_a >= 7 && e_b <= 4 {
        return EnergyExplanation {
            delta: Some(delta),
            movement,
            is_reset: true,
            is_contrast: false,
            friction: 0.20,
            explanation: format!(
                "Intentional energy reset (drop from level {} to {}): Clears floor intensity and creates breathing room for a new buildup arc.",
                e_a, e_b
            ),
        };
    }

    // Intentional dynamic contrast: large jump of >= 4 levels without being a classic reset
    if delta.abs() >= 4 {
        return EnergyExplanation {
            delta: Some(delta),
            movement,
            is_reset: false,
            is_contrast: true,
            friction: 0.35,
            explanation: format!(
                "Intentional dynamic contrast (shift from level {} to {}): Bold contrast that commands listener attention.",
                e_a, e_b
            ),
        };
    }

    if delta == 0 {
        EnergyExplanation {
            delta: Some(0),
            movement,
            is_reset: false,
            is_contrast: false,
            friction: 0.00,
            explanation: format!(
                "Maintains consistent energy plateau at intensity level {}.",
                e_a
            ),
        }
    } else if delta == 1 || delta == 2 {
        let friction = (delta as f32) * 0.05;
        EnergyExplanation {
            delta: Some(delta),
            movement,
            is_reset: false,
            is_contrast: false,
            friction,
            explanation: format!(
                "Smooth upward momentum (+{} energy level, {} -> {}): Naturally elevates room energy.",
                delta, e_a, e_b
            ),
        }
    } else if delta == -1 || delta == -2 {
        let friction = (delta.abs() as f32) * 0.08;
        EnergyExplanation {
            delta: Some(delta),
            movement,
            is_reset: false,
            is_contrast: false,
            friction,
            explanation: format!(
                "Gentle cool-down ({} energy level, {} -> {}): Smoothly lowers intensity without disrupting set flow.",
                delta, e_a, e_b
            ),
        }
    } else if delta > 0 {
        EnergyExplanation {
            delta: Some(delta),
            movement,
            is_reset: false,
            is_contrast: false,
            friction: 0.30,
            explanation: format!(
                "Noticeable energy surge (+{} energy levels, {} -> {}): Powerful upward push.",
                delta, e_a, e_b
            ),
        }
    } else {
        EnergyExplanation {
            delta: Some(delta),
            movement,
            is_reset: false,
            is_contrast: false,
            friction: 0.30,
            explanation: format!(
                "Noticeable energy drop ({} energy levels, {} -> {}): Substantial deceleration.",
                delta, e_a, e_b
            ),
        }
    }
}

/// Evaluates guitar tuning and capo compatibility between two songs.
#[must_use]
pub fn evaluate_tuning_relationship(
    tuning_from: Option<&str>,
    capo_from: Option<u8>,
    tuning_to: Option<&str>,
    capo_to: Option<u8>,
) -> TuningExplanation {
    let t_a = tuning_from.unwrap_or("Standard");
    let t_b = tuning_to.unwrap_or("Standard");
    let c_a = capo_from.unwrap_or(0);
    let c_b = capo_to.unwrap_or(0);

    if t_a.eq_ignore_ascii_case(t_b) && c_a == c_b {
        TuningExplanation {
            compatibility: TuningCompatibility::Identical,
            friction: 0.00,
            explanation: format!(
                "Identical setup ({}, Capo {}): Seamless transition with zero instrument changes.",
                t_a, c_a
            ),
        }
    } else if t_a.eq_ignore_ascii_case(t_b) {
        TuningExplanation {
            compatibility: TuningCompatibility::CapoShiftOnly,
            friction: 0.15,
            explanation: format!(
                "Same tuning ({}), adjust capo from fret {} to fret {}.",
                t_a, c_a, c_b
            ),
        }
    } else {
        TuningExplanation {
            compatibility: TuningCompatibility::RetuneRequired,
            friction: 0.45,
            explanation: format!(
                "Retuning or instrument change required ({} -> {}).",
                t_a, t_b
            ),
        }
    }
}

/// Evaluates style and tag similarity between two songs.
#[must_use]
pub fn evaluate_style_relationship(tags_from: &[String], tags_to: &[String]) -> StyleExplanation {
    if tags_from.is_empty() && tags_to.is_empty() {
        return StyleExplanation {
            shared_tags: Vec::new(),
            similarity: 0.50,
            explanation: "No genre or stylistic tags recorded for either track.".to_string(),
        };
    }

    let set_a: HashSet<String> = tags_from.iter().map(|s| s.to_lowercase()).collect();
    let set_b: HashSet<String> = tags_to.iter().map(|s| s.to_lowercase()).collect();

    let shared: Vec<String> = set_a.intersection(&set_b).cloned().collect();
    let union_size = set_a.union(&set_b).count();

    let similarity = if union_size > 0 {
        (shared.len() as f32) / (union_size as f32)
    } else {
        0.50
    };

    let explanation = if !shared.is_empty() {
        format!("Shared stylistic elements: [{}].", shared.join(", "))
    } else {
        "Distinct stylistic palettes providing genre contrast.".to_string()
    };

    StyleExplanation {
        shared_tags: shared,
        similarity,
        explanation,
    }
}

/// Evaluates the complete multidimensional relationship between Song A and Song B (directional: A -> B).
#[must_use]
pub fn evaluate_song_relationship(from: &Song, to: &Song) -> SongRelationship {
    let bpm_exp = evaluate_bpm_relationship(from.bpm, to.bpm);
    let harmonic_exp = evaluate_harmonic_relationship(
        from.camelot_code.as_deref().or(from.musical_key.as_deref()),
        to.camelot_code.as_deref().or(to.musical_key.as_deref()),
    );
    let energy_exp = evaluate_energy_relationship(from.energy_rating, to.energy_rating);
    let tuning_exp = evaluate_tuning_relationship(
        from.tuning.as_deref(),
        from.capo,
        to.tuning.as_deref(),
        to.capo,
    );
    let style_exp = evaluate_style_relationship(&from.tags, &to.tags);

    // Compute weighted transition friction
    let transition_friction = (0.35 * harmonic_exp.friction
        + 0.35 * bpm_exp.friction
        + 0.20 * energy_exp.friction
        + 0.10 * tuning_exp.friction)
        .clamp(0.0, 1.0);

    let overall_score = (1.0 - transition_friction).clamp(0.0, 1.0);

    let compatibility = if overall_score >= 0.85 {
        OverallCompatibility::Excellent
    } else if overall_score >= 0.70 {
        OverallCompatibility::Good
    } else if overall_score >= 0.50 {
        OverallCompatibility::Viable
    } else if overall_score >= 0.30 {
        OverallCompatibility::Challenging
    } else {
        OverallCompatibility::Clashing
    };

    // Determine applicable transition classifications
    let mut classifications = Vec::new();

    let is_smooth_bpm = matches!(
        bpm_exp.compatibility,
        BpmCompatibility::Exact | BpmCompatibility::Close
    );
    let is_smooth_harmonic = matches!(
        harmonic_exp.relation,
        HarmonicRelation::SameKey | HarmonicRelation::RelativeSwitch | HarmonicRelation::Fifth
    );
    let is_smooth_energy = energy_exp.delta.is_none_or(|d| d.abs() <= 2);

    if is_smooth_bpm && is_smooth_harmonic && is_smooth_energy {
        classifications.push(TransitionClassification::Smooth);
    }

    if let Some(delta) = energy_exp.delta {
        if delta > 0 {
            classifications.push(TransitionClassification::Rising);
        } else if delta < 0 {
            classifications.push(TransitionClassification::Falling);
        }
    }

    if matches!(
        harmonic_exp.relation,
        HarmonicRelation::RelativeSwitch
            | HarmonicRelation::Fifth
            | HarmonicRelation::WholeStepLift
            | HarmonicRelation::HalfStepLift
    ) {
        classifications.push(TransitionClassification::HarmonicTransition);
    }

    if matches!(
        bpm_exp.compatibility,
        BpmCompatibility::HalfTime | BpmCompatibility::DoubleTime | BpmCompatibility::Moderate
    ) {
        classifications.push(TransitionClassification::RhythmicTempoTransition);
    }

    if energy_exp.is_reset {
        classifications.push(TransitionClassification::EnergyReset);
    }

    if energy_exp.is_contrast {
        classifications.push(TransitionClassification::IntentionalContrast);
    }

    if matches!(harmonic_exp.relation, HarmonicRelation::Tritone)
        || matches!(bpm_exp.compatibility, BpmCompatibility::Wide)
        || transition_friction >= 0.75
    {
        classifications.push(TransitionClassification::PoorFit);
    }

    if classifications.is_empty() {
        classifications.push(TransitionClassification::HardCut);
    }

    // Pick primary classification with prioritized logic
    let primary_classification = if energy_exp.is_reset {
        TransitionClassification::EnergyReset
    } else if energy_exp.is_contrast {
        TransitionClassification::IntentionalContrast
    } else if classifications.contains(&TransitionClassification::PoorFit) {
        TransitionClassification::PoorFit
    } else if classifications.contains(&TransitionClassification::Smooth) {
        TransitionClassification::Smooth
    } else if classifications.contains(&TransitionClassification::Rising)
        && energy_exp.delta.unwrap_or(0) >= 2
    {
        TransitionClassification::Rising
    } else if classifications.contains(&TransitionClassification::Falling)
        && energy_exp.delta.unwrap_or(0) <= -2
    {
        TransitionClassification::Falling
    } else if classifications.contains(&TransitionClassification::HarmonicTransition) {
        TransitionClassification::HarmonicTransition
    } else if classifications.contains(&TransitionClassification::RhythmicTempoTransition) {
        TransitionClassification::RhythmicTempoTransition
    } else {
        TransitionClassification::HardCut
    };

    // Determine symmetry (A -> B is symmetric to B -> A only if delta energy is 0 and bpm matches closely)
    let is_symmetric = energy_exp.delta == Some(0)
        && bpm_exp.delta.is_some_and(|d| d.abs() < 0.2)
        && matches!(harmonic_exp.relation, HarmonicRelation::SameKey);

    // Build synthesized human explanation summary
    let summary = format!(
        "{}. {}. {}",
        bpm_exp.explanation, harmonic_exp.explanation, energy_exp.explanation
    );

    let explanation = RelationshipExplanation {
        bpm: bpm_exp,
        harmony: harmonic_exp,
        energy: energy_exp,
        tuning: tuning_exp,
        style: style_exp,
        summary,
    };

    SongRelationship {
        from_song_id: from.id.clone(),
        to_song_id: to.id.clone(),
        from_title: from.title.clone(),
        to_title: to.title.clone(),
        from_key: from
            .camelot_code
            .clone()
            .or_else(|| from.musical_key.clone()),
        to_key: to.camelot_code.clone().or_else(|| to.musical_key.clone()),
        from_bpm: from.bpm,
        to_bpm: to.bpm,
        from_energy: from.energy_rating,
        to_energy: to.energy_rating,
        compatibility,
        overall_score,
        transition_friction,
        primary_classification,
        classifications,
        is_symmetric,
        explanation,
    }
}

/// Catalog graph representation providing relational intelligence across an artist's catalog.
#[derive(Debug, Clone)]
pub struct CatalogGraph {
    /// Song storage indexed by unique song ID.
    songs: HashMap<String, Song>,
}

impl CatalogGraph {
    /// Constructs a catalog graph from a slice or vector of songs.
    #[must_use]
    pub fn new(songs: impl IntoIterator<Item = Song>) -> Self {
        let mut map = HashMap::new();
        for song in songs {
            map.insert(song.id.clone(), song);
        }
        Self { songs: map }
    }

    /// Returns a reference to a song by its unique ID.
    #[must_use]
    pub fn get_song(&self, id: &str) -> Option<&Song> {
        self.songs.get(id)
    }

    /// Returns all songs in the catalog graph.
    #[must_use]
    pub fn all_songs(&self) -> Vec<&Song> {
        self.songs.values().collect()
    }

    /// Computes all outgoing relationships from the specified song to other catalog tracks,
    /// sorted in descending order of compatibility score.
    #[must_use]
    pub fn get_outgoing_relationships(&self, song_id: &str) -> Vec<SongRelationship> {
        let from_song = match self.get_song(song_id) {
            Some(s) => s,
            None => return Vec::new(),
        };

        let mut relationships: Vec<SongRelationship> = self
            .songs
            .values()
            .filter(|s| s.id != song_id)
            .map(|to_song| evaluate_song_relationship(from_song, to_song))
            .collect();

        relationships.sort_by(|a, b| {
            b.overall_score
                .partial_cmp(&a.overall_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        relationships
    }

    /// Computes all incoming relationships from other catalog tracks into the specified song,
    /// sorted in descending order of compatibility score.
    #[must_use]
    pub fn get_incoming_relationships(&self, song_id: &str) -> Vec<SongRelationship> {
        let to_song = match self.get_song(song_id) {
            Some(s) => s,
            None => return Vec::new(),
        };

        let mut relationships: Vec<SongRelationship> = self
            .songs
            .values()
            .filter(|s| s.id != song_id)
            .map(|from_song| evaluate_song_relationship(from_song, to_song))
            .collect();

        relationships.sort_by(|a, b| {
            b.overall_score
                .partial_cmp(&a.overall_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        relationships
    }

    /// Returns both incoming and outgoing relationships for a target song.
    #[must_use]
    pub fn get_song_relationships(&self, song_id: &str) -> SongRelationshipsResponse {
        SongRelationshipsResponse {
            song_id: song_id.to_string(),
            outgoing: self.get_outgoing_relationships(song_id),
            incoming: self.get_incoming_relationships(song_id),
        }
    }

    /// Returns the top strongest outgoing transitions from a song.
    #[must_use]
    pub fn get_strongest_transitions(&self, song_id: &str, limit: usize) -> Vec<SongRelationship> {
        let mut out = self.get_outgoing_relationships(song_id);
        out.truncate(limit);
        out
    }

    /// Returns the weakest outgoing transitions from a song.
    #[must_use]
    pub fn get_weakest_transitions(&self, song_id: &str, limit: usize) -> Vec<SongRelationship> {
        let mut out = self.get_outgoing_relationships(song_id);
        out.reverse();
        out.truncate(limit);
        out
    }

    /// Discovers candidate bridge tracks that connect two disparate songs (`A -> Bridge -> B`).
    ///
    /// Identifies intermediate tracks that minimize transition friction across tempo,
    /// musical key, energy, or stylistic boundaries.
    #[must_use]
    pub fn get_potential_bridges(
        &self,
        song_a_id: &str,
        song_b_id: &str,
        limit: usize,
    ) -> Vec<BridgeCandidateAnalysis> {
        let song_a = match self.get_song(song_a_id) {
            Some(s) => s,
            None => return Vec::new(),
        };
        let song_b = match self.get_song(song_b_id) {
            Some(s) => s,
            None => return Vec::new(),
        };

        let direct = evaluate_song_relationship(song_a, song_b);

        let mut candidates = Vec::new();

        for bridge_song in self.songs.values() {
            if bridge_song.id == song_a_id || bridge_song.id == song_b_id {
                continue;
            }

            let rel_a_bridge = evaluate_song_relationship(song_a, bridge_song);
            let rel_bridge_b = evaluate_song_relationship(bridge_song, song_b);

            // Combined route score via geometric mean
            let combined_score = (rel_a_bridge.overall_score * rel_bridge_b.overall_score).sqrt();

            let mut bridge_roles = Vec::new();

            // Check Harmonic Bridge role
            let harmonic_bridge = if let (Some(ca), Some(cb), Some(cx)) = (
                rel_a_bridge.explanation.harmony.camelot_distance,
                rel_bridge_b.explanation.harmony.camelot_distance,
                direct.explanation.harmony.camelot_distance,
            ) {
                (cx >= 2 && ca < cx && cb < cx)
                    || (rel_a_bridge.explanation.harmony.friction
                        < direct.explanation.harmony.friction
                        && rel_bridge_b.explanation.harmony.friction
                            < direct.explanation.harmony.friction)
            } else {
                rel_a_bridge.explanation.harmony.friction < direct.explanation.harmony.friction
                    && rel_bridge_b.explanation.harmony.friction
                        < direct.explanation.harmony.friction
            };
            if harmonic_bridge {
                bridge_roles.push(BridgeRole::HarmonicBridge);
            }

            // Check Tempo Bridge role
            let tempo_bridge = if let (Some(ba), Some(bb), Some(bx)) =
                (song_a.bpm, song_b.bpm, bridge_song.bpm)
            {
                let direct_tempo_diff = (bb - ba).abs();
                (direct_tempo_diff > 8.0 && ((ba < bx && bx < bb) || (bb < bx && bx < ba)))
                    || (rel_a_bridge.explanation.bpm.friction < direct.explanation.bpm.friction
                        && rel_bridge_b.explanation.bpm.friction < direct.explanation.bpm.friction)
            } else {
                rel_a_bridge.explanation.bpm.friction < direct.explanation.bpm.friction
                    && rel_bridge_b.explanation.bpm.friction < direct.explanation.bpm.friction
            };
            if tempo_bridge {
                bridge_roles.push(BridgeRole::TempoBridge);
            }

            // Check Energy Bridge role
            if let (Some(ea), Some(eb), Some(ex)) = (
                song_a.energy_rating,
                song_b.energy_rating,
                bridge_song.energy_rating,
            ) {
                let direct_energy_diff = ((eb as i8) - (ea as i8)).abs();
                if direct_energy_diff >= 3 && ((ea <= ex && ex <= eb) || (eb <= ex && ex <= ea)) {
                    bridge_roles.push(BridgeRole::EnergyBridge);
                }
            }

            // Check Style / Tuning Bridge role
            if direct.explanation.tuning.friction > 0.2
                && rel_a_bridge.explanation.tuning.friction < direct.explanation.tuning.friction
            {
                bridge_roles.push(BridgeRole::StyleBridge);
            }

            // A valid bridge should either have identified roles or provide a better overall route
            if combined_score > direct.overall_score || !bridge_roles.is_empty() {
                let reason = if !bridge_roles.is_empty() {
                    let roles_str: Vec<&str> = bridge_roles
                        .iter()
                        .map(|r| match r {
                            BridgeRole::HarmonicBridge => "harmonically bridges key gap",
                            BridgeRole::TempoBridge => "steps tempo smoothly between tracks",
                            BridgeRole::EnergyBridge => "provides intermediate energy staging",
                            BridgeRole::StyleBridge => "mediates tuning/style change",
                        })
                        .collect();
                    format!(
                        "Acts as a bridge ({}) connecting '{}' and '{}' with combined route score {:.0}%.",
                        roles_str.join(", "),
                        song_a.title,
                        song_b.title,
                        combined_score * 100.0
                    )
                } else {
                    format!(
                        "Provides a smoother two-stage transition via '{}' (combined score {:.0}% vs direct {:.0}%).",
                        bridge_song.title,
                        combined_score * 100.0,
                        direct.overall_score * 100.0
                    )
                };

                candidates.push(BridgeCandidateAnalysis {
                    bridge_song: bridge_song.clone(),
                    from_a_relationship: rel_a_bridge,
                    to_b_relationship: rel_bridge_b,
                    combined_score,
                    bridge_roles,
                    reason,
                });
            }
        }

        candidates.sort_by(|a, b| {
            b.combined_score
                .partial_cmp(&a.combined_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        candidates.truncate(limit);
        candidates
    }

    /// Discovers natural clusters of songs within the catalog that belong together.
    ///
    /// Implements deterministic, understandable clustering based on mutual high compatibility
    /// across tempo, harmonic Camelot alignment, and energy trajectories.
    #[must_use]
    pub fn find_clusters(&self) -> Vec<CatalogCluster> {
        let song_list: Vec<&Song> = self.songs.values().collect();
        if song_list.len() < 2 {
            return Vec::new();
        }

        // Build adjacency graph for pairs with mutual high compatibility (score >= 0.70)
        let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();
        for s in &song_list {
            adj.insert(&s.id, Vec::new());
        }

        for i in 0..song_list.len() {
            for j in (i + 1)..song_list.len() {
                let s_a = song_list[i];
                let s_b = song_list[j];
                let rel_ab = evaluate_song_relationship(s_a, s_b);
                let rel_ba = evaluate_song_relationship(s_b, s_a);

                if rel_ab.overall_score >= 0.68 && rel_ba.overall_score >= 0.68 {
                    if let Some(neighbors) = adj.get_mut(s_a.id.as_str()) {
                        neighbors.push(s_b.id.as_str());
                    }
                    if let Some(neighbors) = adj.get_mut(s_b.id.as_str()) {
                        neighbors.push(s_a.id.as_str());
                    }
                }
            }
        }

        // Find connected components using Breadth-First Search (BFS)
        let mut visited: HashSet<&str> = HashSet::new();
        let mut raw_clusters = Vec::new();

        for song in &song_list {
            let id = song.id.as_str();
            if visited.contains(id) {
                continue;
            }

            let mut component = Vec::new();
            let mut queue = vec![id];
            visited.insert(id);

            while let Some(current) = queue.pop() {
                component.push(current);
                if let Some(neighbors) = adj.get(current) {
                    for &nbr in neighbors {
                        if !visited.contains(nbr) {
                            visited.insert(nbr);
                            queue.push(nbr);
                        }
                    }
                }
            }

            // Retain clusters with at least 2 tracks
            if component.len() >= 2 {
                raw_clusters.push(component);
            }
        }

        // Build structured CatalogCluster models
        let mut clusters = Vec::new();
        for (idx, member_ids) in raw_clusters.into_iter().enumerate() {
            let member_songs: Vec<&Song> = member_ids
                .iter()
                .filter_map(|id| self.get_song(id))
                .collect();

            // Calculate center BPM
            let bpms: Vec<f64> = member_songs.iter().filter_map(|s| s.bpm).collect();
            let center_bpm = if !bpms.is_empty() {
                Some(bpms.iter().sum::<f64>() / (bpms.len() as f64))
            } else {
                None
            };

            // Collect Camelot keys
            let mut keys: Vec<String> = member_songs
                .iter()
                .filter_map(|s| s.camelot_code.clone().or_else(|| s.musical_key.clone()))
                .collect();
            keys.sort();
            keys.dedup();

            // Calculate average energy
            let energies: Vec<f32> = member_songs
                .iter()
                .filter_map(|s| s.energy_rating.map(|e| e as f32))
                .collect();
            let average_energy = if !energies.is_empty() {
                Some(energies.iter().sum::<f32>() / (energies.len() as f32))
            } else {
                None
            };

            // Calculate cluster cohesion: average pairwise compatibility within cluster
            let mut pair_scores = Vec::new();
            for i in 0..member_songs.len() {
                for j in (i + 1)..member_songs.len() {
                    let rel = evaluate_song_relationship(member_songs[i], member_songs[j]);
                    pair_scores.push(rel.overall_score);
                }
            }
            let cohesion_score = if !pair_scores.is_empty() {
                pair_scores.iter().sum::<f32>() / (pair_scores.len() as f32)
            } else {
                0.80
            };

            // Generate descriptive label
            let tempo_str = center_bpm
                .map(|b| format!("~{:.0} BPM", b))
                .unwrap_or_else(|| "Mixed BPM".to_string());
            let keys_str = if !keys.is_empty() {
                format!(" ({})", keys.join(", "))
            } else {
                String::new()
            };
            let label = format!("Cluster #{}: {}{}", idx + 1, tempo_str, keys_str);

            let description = format!(
                "A cohesive group of {} songs featuring aligned tempo ({}) and harmonious key progression.",
                member_songs.len(),
                tempo_str
            );

            clusters.push(CatalogCluster {
                id: format!("cluster_{}", idx + 1),
                label,
                song_ids: member_ids.into_iter().map(String::from).collect(),
                center_bpm,
                camelot_keys: keys,
                average_energy,
                cohesion_score,
                description,
            });
        }

        // Sort by member count descending, then cohesion score descending
        clusters.sort_by(|a, b| {
            b.song_ids.len().cmp(&a.song_ids.len()).then_with(|| {
                b.cohesion_score
                    .partial_cmp(&a.cohesion_score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
        });

        clusters
    }

    /// Evaluates all catalog tracks as candidate openers.
    #[must_use]
    pub fn find_candidate_openers(&self) -> Vec<OpenerCandidate> {
        let total_songs = self.songs.len();
        if total_songs == 0 {
            return Vec::new();
        }

        let mut candidates = Vec::new();

        for song in self.songs.values() {
            let outgoing = self.get_outgoing_relationships(&song.id);
            let compatible_outbound = outgoing.iter().filter(|r| r.overall_score >= 0.70).count();

            let mut reasons = Vec::new();
            let mut score: f32 = 0.50;

            // Ratio of catalog songs reachable with high compatibility
            let reachability_ratio = if total_songs > 1 {
                (compatible_outbound as f32) / ((total_songs - 1) as f32)
            } else {
                1.0
            };
            score += reachability_ratio * 0.30;

            if reachability_ratio >= 0.50 {
                reasons.push(format!(
                    "High outbound compatibility: flows cleanly into {} other catalog tracks ({:.0}% of catalog).",
                    compatible_outbound,
                    reachability_ratio * 100.0
                ));
            }

            // Check establishing energy (preferred opener energy is 4 to 7)
            if let Some(e) = song.energy_rating {
                if (4..=7).contains(&e) {
                    score += 0.15;
                    reasons.push(format!(
                        "Ideal set-establishing energy level (rating {}/10).",
                        e
                    ));
                } else if e <= 3 {
                    score += 0.05;
                    reasons.push(format!(
                        "Mellow ambient/intro energy rating ({}/10); suits an intimate opening.",
                        e
                    ));
                }
            }

            // Check if it has rising transitions available
            let rising_transitions = outgoing
                .iter()
                .filter(|r| {
                    r.classifications
                        .contains(&TransitionClassification::Rising)
                })
                .count();
            if rising_transitions > 0 {
                score += 0.05;
                reasons.push(format!(
                    "Supports {} upward energy ramps to build momentum early in the set.",
                    rising_transitions
                ));
            }

            candidates.push(OpenerCandidate {
                song_id: song.id.clone(),
                title: song.title.clone(),
                artist: song.artist.clone(),
                opener_score: score.clamp(0.0, 1.0),
                compatible_outbound_count: compatible_outbound,
                energy_rating: song.energy_rating,
                bpm: song.bpm,
                reasons,
            });
        }

        candidates.sort_by(|a, b| {
            b.opener_score
                .partial_cmp(&a.opener_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        candidates
    }

    /// Evaluates all catalog tracks as candidate closers.
    #[must_use]
    pub fn find_candidate_closers(&self) -> Vec<CloserCandidate> {
        let total_songs = self.songs.len();
        if total_songs == 0 {
            return Vec::new();
        }

        let mut candidates = Vec::new();

        for song in self.songs.values() {
            let incoming = self.get_incoming_relationships(&song.id);
            let compatible_inbound = incoming.iter().filter(|r| r.overall_score >= 0.70).count();

            let mut reasons = Vec::new();
            let mut score: f32 = 0.50;

            // Inbound reachability ratio
            let reachability_ratio = if total_songs > 1 {
                (compatible_inbound as f32) / ((total_songs - 1) as f32)
            } else {
                1.0
            };
            score += reachability_ratio * 0.30;

            if reachability_ratio >= 0.50 {
                reasons.push(format!(
                    "Strong endpoint: {} catalog tracks can transition smoothly into it ({:.0}% reachability).",
                    compatible_inbound,
                    reachability_ratio * 100.0
                ));
            }

            // Closer energy: either climax peak (8-10) or conclusive wind-down (1-3)
            if let Some(e) = song.energy_rating {
                if e >= 8 {
                    score += 0.20;
                    reasons.push(format!(
                        "Peak climax energy ({}/10) delivers a high-impact festival finale.",
                        e
                    ));
                } else if e <= 3 {
                    score += 0.15;
                    reasons.push(format!(
                        "Gentle reflective energy ({}/10) provides an emotional encore or conclusive resolution.",
                        e
                    ));
                }
            }

            candidates.push(CloserCandidate {
                song_id: song.id.clone(),
                title: song.title.clone(),
                artist: song.artist.clone(),
                closer_score: score.clamp(0.0, 1.0),
                compatible_inbound_count: compatible_inbound,
                energy_rating: song.energy_rating,
                bpm: song.bpm,
                reasons,
            });
        }

        candidates.sort_by(|a, b| {
            b.closer_score
                .partial_cmp(&a.closer_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        candidates
    }

    /// Evaluates both candidate openers and closers across the catalog.
    #[must_use]
    pub fn get_openers_and_closers(&self) -> CatalogOpenersAndClosers {
        CatalogOpenersAndClosers {
            openers: self.find_candidate_openers(),
            closers: self.find_candidate_closers(),
        }
    }

    /// Discovers catalog tracks with unusually few strong connections or outlier characteristics.
    ///
    /// Identifies isolated tracks and provides plain-language musical explanations and
    /// creative application suggestions (e.g. dramatic resets, hard cuts, tempo modulations).
    #[must_use]
    pub fn find_outliers(&self) -> Vec<CatalogOutlier> {
        let total_songs = self.songs.len();
        if total_songs < 2 {
            return Vec::new();
        }

        // Compute average BPM across analyzed songs
        let bpms: Vec<f64> = self.songs.values().filter_map(|s| s.bpm).collect();
        let avg_bpm = if !bpms.is_empty() {
            Some(bpms.iter().sum::<f64>() / (bpms.len() as f64))
        } else {
            None
        };

        let mut outliers = Vec::new();

        for song in self.songs.values() {
            let outgoing = self.get_outgoing_relationships(&song.id);
            let incoming = self.get_incoming_relationships(&song.id);

            let mut max_score: f32 = 0.0;
            let mut strong_connections = 0;
            let mut viable_connections = 0;

            for other in self.songs.values() {
                if other.id == song.id {
                    continue;
                }
                let out_rel = outgoing.iter().find(|r| r.to_song_id == other.id);
                let in_rel = incoming.iter().find(|r| r.from_song_id == other.id);

                let best_pair_score = match (out_rel, in_rel) {
                    (Some(o), Some(i)) => o.overall_score.max(i.overall_score),
                    (Some(o), None) => o.overall_score,
                    (None, Some(i)) => i.overall_score,
                    (None, None) => 0.0,
                };

                if best_pair_score > max_score {
                    max_score = best_pair_score;
                }
                if best_pair_score >= 0.70 {
                    strong_connections += 1;
                }
                if best_pair_score >= 0.50 {
                    viable_connections += 1;
                }
            }

            let mut reasons = Vec::new();

            if song.bpm.is_none() || (song.camelot_code.is_none() && song.musical_key.is_none()) {
                reasons.push(
                    "Missing BPM or musical key analysis — track metadata incomplete.".to_string(),
                );
            }

            if let (Some(bpm), Some(avg)) = (song.bpm, avg_bpm) {
                let delta = (bpm - avg).abs();
                if delta >= 18.0 {
                    reasons.push(format!(
                        "Unusual tempo ({:.1} BPM vs catalog average ~{:.1} BPM).",
                        bpm, avg
                    ));
                }
            }

            if let Some(e) = song.energy_rating {
                if e == 10 {
                    reasons.push("Extreme maximum energy (rating 10/10); functions best as an explosive climax or hard drop.".to_string());
                } else if e == 1 {
                    reasons.push("Minimal acoustic energy (rating 1/10); functions best as a quiet intro or atmospheric encore.".to_string());
                }
            }

            if strong_connections == 0 {
                reasons.push("No strong (≥70% compatibility) harmonic or tempo transitions found in the catalog.".to_string());
            } else if strong_connections == 1 {
                reasons.push("Only 1 strong connection found in the catalog.".to_string());
            }

            // Flag as outlier if it has <= 1 strong connection, max score < 0.68, or missing key/tempo
            let is_outlier = strong_connections <= 1
                || max_score < 0.68
                || song.bpm.is_none()
                || (song.camelot_code.is_none() && song.musical_key.is_none());

            if is_outlier {
                reasons.push("Creative opportunity: suitable for intentional hard cuts, energy resets, or bridge-mediated transitions.".to_string());

                outliers.push(CatalogOutlier {
                    song_id: song.id.clone(),
                    title: song.title.clone(),
                    artist: song.artist.clone(),
                    strong_connection_count: strong_connections,
                    total_viable_count: viable_connections,
                    max_compatibility_score: max_score,
                    bpm: song.bpm,
                    camelot_code: song
                        .camelot_code
                        .clone()
                        .or_else(|| song.musical_key.clone()),
                    energy_rating: song.energy_rating,
                    reasons,
                });
            }
        }

        // Sort by least connected (lowest max score) first
        outliers.sort_by(|a, b| {
            a.max_compatibility_score
                .partial_cmp(&b.max_compatibility_score)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.strong_connection_count.cmp(&b.strong_connection_count))
        });

        outliers
    }

    /// Discovers unusual, high-contrast, or creative transition possibilities from a song.
    ///
    /// Identifies energy resets, intentional mood contrasts, half-time/double-time tempo jumps,
    /// and harmonic lifts that offer creative performance opportunities rather than pure smooth blending.
    #[must_use]
    pub fn get_unusual_transitions(&self, song_id: &str, limit: usize) -> Vec<SongRelationship> {
        let outgoing = self.get_outgoing_relationships(song_id);

        let mut unusual: Vec<SongRelationship> = outgoing
            .into_iter()
            .filter(|r| {
                r.explanation.energy.is_reset
                    || r.explanation.energy.is_contrast
                    || matches!(
                        r.explanation.bpm.compatibility,
                        BpmCompatibility::HalfTime
                            | BpmCompatibility::DoubleTime
                            | BpmCompatibility::Wide
                    )
                    || matches!(
                        r.explanation.harmony.relation,
                        HarmonicRelation::WholeStepLift
                            | HarmonicRelation::HalfStepLift
                            | HarmonicRelation::Tritone
                    )
                    || r.primary_classification == TransitionClassification::HardCut
                    || r.primary_classification == TransitionClassification::EnergyReset
                    || r.primary_classification == TransitionClassification::IntentionalContrast
            })
            .collect();

        // Sort by interest: prioritize viable contrasts (score >= 0.40) over total dissonance
        unusual.sort_by(|a, b| {
            b.overall_score
                .partial_cmp(&a.overall_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        unusual.truncate(limit);
        unusual
    }

    /// Computes high-level catalog connectivity statistics and health metrics.
    #[must_use]
    pub fn get_catalog_summary_stats(&self) -> CatalogSummaryStats {
        let total_songs = self.songs.len();
        if total_songs < 2 {
            return CatalogSummaryStats {
                total_songs,
                total_possible_transitions: 0,
                strong_transitions_count: 0,
                average_compatibility: 0.0,
                cluster_count: 0,
                outlier_count: total_songs,
            };
        }

        let total_possible = total_songs * (total_songs - 1);
        let mut strong_count = 0;
        let mut total_score = 0.0;

        for from_song in self.songs.values() {
            for to_song in self.songs.values() {
                if from_song.id == to_song.id {
                    continue;
                }
                let rel = evaluate_song_relationship(from_song, to_song);
                total_score += rel.overall_score;
                if rel.overall_score >= 0.70 {
                    strong_count += 1;
                }
            }
        }

        let average_compatibility = if total_possible > 0 {
            total_score / (total_possible as f32)
        } else {
            0.0
        };

        let clusters = self.find_clusters();
        let outliers = self.find_outliers();

        CatalogSummaryStats {
            total_songs,
            total_possible_transitions: total_possible,
            strong_transitions_count: strong_count,
            average_compatibility,
            cluster_count: clusters.len(),
            outlier_count: outliers.len(),
        }
    }

    /// Explores candidate sequenced paths through the catalog satisfying discovery constraints.
    ///
    /// Supports target duration (e.g. 30/45/60 min), anchor start track, anchor closer track,
    /// and required track inclusions.
    #[must_use]
    pub fn find_candidate_paths(
        &self,
        constraints: &DiscoveryConstraints,
    ) -> Vec<DiscoveryCandidatePath> {
        let total_songs = self.songs.len();
        if total_songs < 2 {
            return Vec::new();
        }

        // Calculate average song duration
        let total_dur: f64 = self.songs.values().map(|s| s.duration_seconds).sum();
        let avg_duration = (total_dur / (total_songs as f64)).max(60.0);

        // Determine target count
        let (target_count, target_seconds_opt) =
            if let Some(target_min) = constraints.target_duration_minutes {
                let target_sec = target_min * 60.0;
                let count = ((target_sec / avg_duration).round() as usize).clamp(2, total_songs);
                (count, Some(target_sec))
            } else if !constraints.must_include_ids.is_empty() {
                let count = (constraints.must_include_ids.len() + 2).clamp(2, total_songs);
                (count, None)
            } else {
                (total_songs.clamp(2, 5), None)
            };

        let tolerance_sec = constraints
            .duration_tolerance_minutes
            .map(|m| (m * 60.0).max(60.0))
            .unwrap_or(300.0); // 5 min default tolerance

        // Determine candidate start songs
        let mut start_song_ids: Vec<String> = Vec::new();
        if let Some(ref start_id) = constraints.start_song_id {
            if self.songs.contains_key(start_id) {
                start_song_ids.push(start_id.clone());
            }
        }

        if start_song_ids.is_empty() {
            let openers = self.find_candidate_openers();
            for op in openers.iter().take(6) {
                start_song_ids.push(op.song_id.clone());
            }
            if start_song_ids.is_empty() || start_song_ids.len() < 2 {
                for id in self.songs.keys().take(6) {
                    if !start_song_ids.contains(id) {
                        start_song_ids.push(id.clone());
                    }
                }
            }
        }

        let mut discovered_raw_paths: Vec<Vec<String>> = Vec::new();
        let mut fallback_raw_paths: Vec<Vec<String>> = Vec::new();

        // Helper to compute cumulative duration of a path of song IDs
        let compute_path_duration = |path: &[String]| -> f64 {
            path.iter()
                .filter_map(|id| self.get_song(id))
                .map(|s| s.duration_seconds)
                .sum::<f64>()
        };

        // Explore paths from each start song using greedy best-first branching
        for start_id in &start_song_ids {
            let mut beam: Vec<(Vec<String>, f32)> = vec![(vec![start_id.clone()], 1.0)];

            while !beam.is_empty() {
                let mut next_beam: Vec<(Vec<String>, f32)> = Vec::new();

                for (current_path, path_score) in beam {
                    let current_duration = compute_path_duration(&current_path);

                    // Check if path has reached completion criteria
                    let is_target_duration_reached = match target_seconds_opt {
                        Some(target_sec) => current_duration >= target_sec - tolerance_sec,
                        None => false,
                    };
                    let is_target_count_reached = current_path.len() >= target_count;

                    // If end anchor is specified, verify current end matches anchor
                    let matches_end_anchor = match constraints.end_song_id {
                        Some(ref end_id) => current_path.last() == Some(end_id),
                        None => true,
                    };

                    if current_path.len() >= 2
                        && (is_target_duration_reached || is_target_count_reached)
                        && matches_end_anchor
                    {
                        discovered_raw_paths.push(current_path);
                        continue;
                    }

                    // If already reached max catalog length without hitting target duration
                    if current_path.len() >= total_songs {
                        if current_path.len() >= 2 && matches_end_anchor {
                            discovered_raw_paths.push(current_path);
                        } else if current_path.len() >= 2 {
                            fallback_raw_paths.push(current_path);
                        }
                        continue;
                    }

                    let last_id = match current_path.last() {
                        Some(id) => id,
                        None => continue,
                    };
                    let last_song = match self.get_song(last_id) {
                        Some(s) => s,
                        None => continue,
                    };

                    let is_near_end = current_path.len() + 1 >= target_count
                        || match target_seconds_opt {
                            Some(target_sec) => {
                                current_duration + avg_duration >= target_sec - tolerance_sec
                            }
                            None => false,
                        };

                    // If approaching end and end_song_id specified, attempt forcing end anchor
                    if is_near_end {
                        if let Some(ref end_id) = constraints.end_song_id {
                            if !current_path.contains(end_id) {
                                if let Some(end_song) = self.get_song(end_id) {
                                    let rel = evaluate_song_relationship(last_song, end_song);
                                    let mut extended = current_path.clone();
                                    extended.push(end_id.clone());
                                    next_beam.push((extended, path_score * rel.overall_score));
                                    continue;
                                }
                            }
                        }
                    }

                    // Score candidate next tracks
                    let mut candidates: Vec<(&str, f32)> = Vec::new();
                    for next_song in self.songs.values() {
                        if current_path.contains(&next_song.id) {
                            continue;
                        }
                        if let Some(ref end_id) = constraints.end_song_id {
                            if !is_near_end && next_song.id == *end_id {
                                // Save end song for the final step
                                continue;
                            }
                        }

                        let rel = evaluate_song_relationship(last_song, next_song);
                        let mut score = rel.overall_score;

                        // Priority bonus for required tracks
                        if constraints.must_include_ids.contains(&next_song.id) {
                            score += 0.35;
                        }

                        candidates.push((next_song.id.as_str(), score));
                    }

                    if candidates.is_empty() {
                        // Dead end: store current path as a fallback candidate if len >= 2
                        if current_path.len() >= 2 && matches_end_anchor {
                            fallback_raw_paths.push(current_path);
                        }
                        continue;
                    }

                    candidates
                        .sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

                    // Branch up to top 4 choices
                    for (cand_id, cand_score) in candidates.into_iter().take(4) {
                        let mut extended = current_path.clone();
                        extended.push(cand_id.to_string());
                        next_beam.push((extended, path_score * cand_score));
                    }
                }

                // Keep top 16 paths in beam
                next_beam
                    .sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
                next_beam.truncate(16);
                beam = next_beam;
            }
        }

        // If no paths met exact criteria, use best fallback paths
        if discovered_raw_paths.is_empty() {
            discovered_raw_paths = fallback_raw_paths;
        }

        // Build and evaluate candidate paths
        let mut evaluated_paths = Vec::new();

        for raw_ids in discovered_raw_paths {
            if raw_ids.len() < 2 {
                continue;
            }

            // Verify end constraint if specified
            if let Some(ref end_id) = constraints.end_song_id {
                if raw_ids.last() != Some(end_id) {
                    continue;
                }
            }

            let songs: Vec<Song> = raw_ids
                .iter()
                .filter_map(|id| self.get_song(id).cloned())
                .collect();
            if songs.len() != raw_ids.len() {
                continue;
            }

            let mut transitions = Vec::new();
            for i in 0..(songs.len() - 1) {
                transitions.push(evaluate_song_relationship(&songs[i], &songs[i + 1]));
            }

            let total_dur: f64 = songs.iter().map(|s| s.duration_seconds).sum();
            let avg_score = if !transitions.is_empty() {
                transitions.iter().map(|t| t.overall_score).sum::<f32>()
                    / (transitions.len() as f32)
            } else {
                0.0
            };
            let min_score = transitions
                .iter()
                .map(|t| t.overall_score)
                .fold(1.0f32, |acc, s| acc.min(s));

            let energy_progression: Vec<u8> =
                songs.iter().map(|s| s.energy_rating.unwrap_or(5)).collect();

            // Calculate inclusion count
            let included_required_count = constraints
                .must_include_ids
                .iter()
                .filter(|id| raw_ids.contains(id))
                .count();

            // Scoring with penalties
            let mut final_ranking_score = avg_score;

            // Penalty for missing must-include tracks
            let missing_required = constraints
                .must_include_ids
                .len()
                .saturating_sub(included_required_count);
            final_ranking_score -= (missing_required as f32) * 0.40;

            // Penalty for duration deviation
            if let Some(target_sec) = target_seconds_opt {
                let dur_diff = (total_dur - target_sec).abs();
                let dur_penalty = (dur_diff / target_sec) as f32 * 0.20;
                final_ranking_score -= dur_penalty;
            }

            // Plain-English path summary
            let total_mins = (total_dur / 60.0).round() as u32;
            let first_song = &songs[0];
            let last_song = &songs[songs.len() - 1];
            let summary = format!(
                "A cohesive {}-track path (~{} min) moving from '{}' to '{}' with {:.0}% average harmonic/energy compatibility.",
                songs.len(),
                total_mins,
                first_song.title,
                last_song.title,
                avg_score * 100.0
            );

            evaluated_paths.push((
                final_ranking_score,
                DiscoveryCandidatePath {
                    song_ids: raw_ids,
                    songs,
                    transitions,
                    total_duration_seconds: total_dur,
                    average_score: avg_score,
                    min_score,
                    energy_progression,
                    summary,
                },
            ));
        }

        // Deduplicate paths by song_ids
        let mut seen_signatures = HashSet::new();
        let mut unique_paths = Vec::new();

        evaluated_paths.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

        for (_score, path) in evaluated_paths {
            let sig = path.song_ids.join("->");
            if seen_signatures.insert(sig) {
                unique_paths.push(path);
            }
        }

        let limit = constraints.limit.unwrap_or(5);
        unique_paths.truncate(limit);
        unique_paths
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_song(
        id: &str,
        title: &str,
        bpm: Option<f64>,
        key: Option<&str>,
        energy: Option<u8>,
    ) -> Song {
        Song {
            id: id.to_string(),
            title: title.to_string(),
            artist: "Loserdub".to_string(),
            duration_seconds: 240.0,
            bpm,
            musical_key: key.map(|k| k.to_string()),
            mode: None,
            camelot_code: key.map(|k| k.to_string()),
            tuning: Some("Standard".to_string()),
            capo: Some(0),
            energy_rating: energy,
            lead_performer: None,
            tags: vec!["electronic".to_string(), "deep".to_string()],
            notes: None,
        }
    }

    #[test]
    fn test_same_bpm_and_same_key() {
        let a = make_test_song("1", "Song A", Some(124.0), Some("8A"), Some(6));
        let b = make_test_song("2", "Song B", Some(124.0), Some("8A"), Some(6));

        let rel = evaluate_song_relationship(&a, &b);
        assert_eq!(rel.explanation.bpm.compatibility, BpmCompatibility::Exact);
        assert_eq!(rel.explanation.bpm.friction, 0.0);
        assert_eq!(rel.explanation.harmony.relation, HarmonicRelation::SameKey);
        assert_eq!(rel.explanation.harmony.friction, 0.0);
        assert_eq!(rel.explanation.energy.delta, Some(0));
        assert!(rel.overall_score >= 0.95);
        assert_eq!(rel.compatibility, OverallCompatibility::Excellent);
        assert!(rel
            .classifications
            .contains(&TransitionClassification::Smooth));
    }

    #[test]
    fn test_nearby_bpm() {
        let a = make_test_song("1", "Song A", Some(120.0), Some("8A"), Some(6));
        let b = make_test_song("2", "Song B", Some(122.0), Some("8A"), Some(7));

        let rel = evaluate_song_relationship(&a, &b);
        assert_eq!(rel.explanation.bpm.compatibility, BpmCompatibility::Close);
        assert!(rel.explanation.bpm.delta.unwrap() - 2.0 < 0.001);
        assert_eq!(rel.explanation.energy.movement, EnergyMovement::Rise);
        assert!(rel.overall_score >= 0.85);
    }

    #[test]
    fn test_half_time_and_double_time_bpm() {
        // 70 BPM to 140 BPM is double time
        let a = make_test_song("1", "Slow Dub", Some(70.0), Some("8A"), Some(5));
        let b = make_test_song("2", "Fast DnB", Some(140.0), Some("8A"), Some(8));

        let rel_double = evaluate_song_relationship(&a, &b);
        assert_eq!(
            rel_double.explanation.bpm.compatibility,
            BpmCompatibility::DoubleTime
        );
        assert!(rel_double.explanation.bpm.friction <= 0.25);
        assert!(rel_double
            .classifications
            .contains(&TransitionClassification::RhythmicTempoTransition));

        // 140 BPM to 70 BPM is half time
        let rel_half = evaluate_song_relationship(&b, &a);
        assert_eq!(
            rel_half.explanation.bpm.compatibility,
            BpmCompatibility::HalfTime
        );
        assert!(rel_half.explanation.bpm.friction <= 0.25);
    }

    #[test]
    fn test_adjacent_camelot_fifth() {
        let a = make_test_song("1", "Song A", Some(124.0), Some("8A"), Some(6));
        let b = make_test_song("2", "Song B", Some(124.0), Some("9A"), Some(6));

        let rel = evaluate_song_relationship(&a, &b);
        assert_eq!(rel.explanation.harmony.relation, HarmonicRelation::Fifth);
        assert_eq!(rel.explanation.harmony.camelot_distance, Some(1));
        assert_eq!(rel.explanation.harmony.mode_flip, Some(false));
        assert!(rel.explanation.harmony.friction <= 0.15);
    }

    #[test]
    fn test_compatible_relative_key() {
        let a = make_test_song("1", "Song A", Some(124.0), Some("8A"), Some(6));
        let b = make_test_song("2", "Song B", Some(124.0), Some("8B"), Some(6));

        let rel = evaluate_song_relationship(&a, &b);
        assert_eq!(
            rel.explanation.harmony.relation,
            HarmonicRelation::RelativeSwitch
        );
        assert_eq!(rel.explanation.harmony.camelot_distance, Some(0));
        assert_eq!(rel.explanation.harmony.mode_flip, Some(true));
        assert!(rel.explanation.harmony.friction <= 0.15);
    }

    #[test]
    fn test_incompatible_tritone_key() {
        let a = make_test_song("1", "Song A", Some(124.0), Some("8A"), Some(6));
        let b = make_test_song("2", "Song B", Some(124.0), Some("2A"), Some(6));

        let rel = evaluate_song_relationship(&a, &b);
        assert_eq!(rel.explanation.harmony.relation, HarmonicRelation::Tritone);
        assert_eq!(rel.explanation.harmony.camelot_distance, Some(6));
        assert_eq!(rel.explanation.harmony.friction, 1.0);
        assert!(rel
            .classifications
            .contains(&TransitionClassification::PoorFit));
    }

    #[test]
    fn test_intentional_energy_reset() {
        // High peak (8) dropping to ballad (3)
        let a = make_test_song("1", "Peak Anthem", Some(126.0), Some("8A"), Some(8));
        let b = make_test_song("2", "Intimate Ballad", Some(126.0), Some("8A"), Some(3));

        let rel = evaluate_song_relationship(&a, &b);
        assert!(rel.explanation.energy.is_reset);
        assert_eq!(rel.explanation.energy.movement, EnergyMovement::Fall);
        assert_eq!(
            rel.primary_classification,
            TransitionClassification::EnergyReset
        );
        // Energy reset is NOT penalized as a failure
        assert!(rel.overall_score >= 0.70);
    }

    #[test]
    fn test_directional_relationships_asymmetry() {
        let a = make_test_song("1", "Warmup", Some(118.0), Some("8A"), Some(4));
        let b = make_test_song("2", "Banger", Some(126.0), Some("8A"), Some(8));

        let a_to_b = evaluate_song_relationship(&a, &b);
        let b_to_a = evaluate_song_relationship(&b, &a);

        assert_eq!(a_to_b.explanation.energy.movement, EnergyMovement::Rise);
        assert_eq!(b_to_a.explanation.energy.movement, EnergyMovement::Fall);
        assert!(a_to_b
            .classifications
            .contains(&TransitionClassification::Rising));
        assert!(b_to_a
            .classifications
            .contains(&TransitionClassification::Falling));
        assert!(!a_to_b.is_symmetric);
    }

    #[test]
    fn test_missing_metadata_handled_gracefully() {
        let mut a = make_test_song("1", "Unanalyzed Track", None, None, None);
        a.tags = Vec::new();
        let b = make_test_song("2", "Analyzed Track", Some(124.0), Some("8A"), Some(7));

        let rel = evaluate_song_relationship(&a, &b);
        assert_eq!(rel.explanation.bpm.compatibility, BpmCompatibility::Unknown);
        assert_eq!(rel.explanation.harmony.relation, HarmonicRelation::Unknown);
        assert_eq!(rel.explanation.energy.movement, EnergyMovement::Unknown);
        // Does not panic or crash; produces a viable/challenging structured score
        assert!(rel.overall_score > 0.0 && rel.overall_score < 1.0);
    }

    #[test]
    fn test_bridge_candidate_discovery() {
        // Song A: 100 BPM, 8A, Energy 4
        // Song B: 130 BPM, 10A, Energy 8
        // Bridge X: 115 BPM, 9A, Energy 6 (perfect intermediate!)
        // Non-bridge Y: 90 BPM, 2A, Energy 2
        let a = make_test_song("A", "Song A", Some(100.0), Some("8A"), Some(4));
        let b = make_test_song("B", "Song B", Some(130.0), Some("10A"), Some(8));
        let x = make_test_song("X", "Bridge X", Some(115.0), Some("9A"), Some(6));
        let y = make_test_song("Y", "Irrelevant Y", Some(90.0), Some("2A"), Some(2));

        let graph = CatalogGraph::new(vec![a, b, x, y]);
        let bridges = graph.get_potential_bridges("A", "B", 5);

        assert!(!bridges.is_empty());
        assert_eq!(bridges[0].bridge_song.id, "X");
        assert!(bridges[0]
            .bridge_roles
            .contains(&BridgeRole::HarmonicBridge));
        assert!(bridges[0].bridge_roles.contains(&BridgeRole::TempoBridge));
        assert!(bridges[0].bridge_roles.contains(&BridgeRole::EnergyBridge));
    }

    #[test]
    fn test_natural_clustering() {
        // Cluster 1: 124 BPM, 8A / 9A
        let s1 = make_test_song("1", "Track 1", Some(124.0), Some("8A"), Some(6));
        let s2 = make_test_song("2", "Track 2", Some(124.5), Some("8A"), Some(6));
        let s3 = make_test_song("3", "Track 3", Some(125.0), Some("9A"), Some(7));

        // Cluster 2: 85 BPM, 4B / 5B
        let s4 = make_test_song("4", "Track 4", Some(85.0), Some("4B"), Some(4));
        let s5 = make_test_song("5", "Track 5", Some(86.0), Some("5B"), Some(4));

        let graph = CatalogGraph::new(vec![s1, s2, s3, s4, s5]);
        let clusters = graph.find_clusters();

        assert_eq!(clusters.len(), 2);
        // First cluster should be the 3-song group
        assert_eq!(clusters[0].song_ids.len(), 3);
        assert_eq!(clusters[1].song_ids.len(), 2);
    }

    #[test]
    fn test_opener_and_closer_detection() {
        // Opener candidate: moderate energy 5, tempo 124, matches well with others
        let op = make_test_song("op", "Great Opener", Some(124.0), Some("8A"), Some(5));
        let mid1 = make_test_song("m1", "Mid 1", Some(124.0), Some("8A"), Some(6));
        let mid2 = make_test_song("m2", "Mid 2", Some(125.0), Some("9A"), Some(7));
        // Closer candidate: peak energy 9
        let cl = make_test_song("cl", "Peak Closer", Some(125.0), Some("9A"), Some(9));

        let graph = CatalogGraph::new(vec![op, mid1, mid2, cl]);
        let openers = graph.find_candidate_openers();
        let closers = graph.find_candidate_closers();

        assert!(!openers.is_empty());
        assert!(!closers.is_empty());
        assert_eq!(closers[0].song_id, "cl");
    }

    #[test]
    fn test_large_energy_change_contrast() {
        let a = make_test_song("1", "Chilled", Some(120.0), Some("8A"), Some(3));
        let b = make_test_song("2", "Surge", Some(120.0), Some("8A"), Some(8));

        let rel = evaluate_song_relationship(&a, &b);
        assert!(rel.explanation.energy.is_contrast);
        assert_eq!(rel.explanation.energy.movement, EnergyMovement::Rise);
        assert_eq!(
            rel.primary_classification,
            TransitionClassification::IntentionalContrast
        );
        assert!(rel.overall_score >= 0.65);
    }

    #[test]
    fn test_malformed_metadata() {
        let a = make_test_song(
            "1",
            "Garbled Key",
            Some(-12.0),
            Some("INVALID_XYZ_99"),
            Some(15),
        );
        let b = make_test_song("2", "Normal", Some(124.0), Some("8A"), Some(6));

        let rel = evaluate_song_relationship(&a, &b);
        assert_eq!(rel.explanation.bpm.compatibility, BpmCompatibility::Unknown);
        assert_eq!(rel.explanation.harmony.relation, HarmonicRelation::Unknown);
        // Does not panic or produce NaN
        assert!(!rel.overall_score.is_nan());
        assert!(!rel.transition_friction.is_nan());
    }

    #[test]
    fn test_tuning_and_capo_transitions() {
        // Same tuning, different capo
        let mut a = make_test_song("1", "Capo 0", Some(120.0), Some("8A"), Some(5));
        a.tuning = Some("Standard".to_string());
        a.capo = Some(0);

        let mut b = make_test_song("2", "Capo 2", Some(120.0), Some("8A"), Some(5));
        b.tuning = Some("Standard".to_string());
        b.capo = Some(2);

        let rel_capo = evaluate_song_relationship(&a, &b);
        assert_eq!(
            rel_capo.explanation.tuning.compatibility,
            TuningCompatibility::CapoShiftOnly
        );

        // Different tuning (Standard to Drop D)
        let mut c = make_test_song("3", "Drop D", Some(120.0), Some("8A"), Some(5));
        c.tuning = Some("Drop D".to_string());
        c.capo = Some(0);

        let rel_retune = evaluate_song_relationship(&a, &c);
        assert_eq!(
            rel_retune.explanation.tuning.compatibility,
            TuningCompatibility::RetuneRequired
        );
        assert!(rel_retune.explanation.tuning.friction >= 0.40);
    }

    #[test]
    fn test_incomplete_analysis_variations() {
        // Case 1: BPM only
        let s_bpm_only = make_test_song("1", "BPM Only", Some(124.0), None, None);
        // Case 2: Key only
        let s_key_only = make_test_song("2", "Key Only", None, Some("8A"), None);
        // Case 3: Energy only
        let s_energy_only = make_test_song("3", "Energy Only", None, None, Some(7));

        let rel_1_2 = evaluate_song_relationship(&s_bpm_only, &s_key_only);
        assert_eq!(
            rel_1_2.explanation.bpm.compatibility,
            BpmCompatibility::Unknown
        );
        assert_eq!(
            rel_1_2.explanation.harmony.relation,
            HarmonicRelation::Unknown
        );
        assert_eq!(rel_1_2.explanation.energy.movement, EnergyMovement::Unknown);
        assert!(!rel_1_2.overall_score.is_nan());

        let rel_2_3 = evaluate_song_relationship(&s_key_only, &s_energy_only);
        assert!(!rel_2_3.overall_score.is_nan());
    }

    #[test]
    fn test_catalog_outliers_detection() {
        // Cohesive group: 124 BPM, 8A / 9A
        let s1 = make_test_song("1", "Track 1", Some(124.0), Some("8A"), Some(6));
        let s2 = make_test_song("2", "Track 2", Some(124.5), Some("8A"), Some(6));
        let s3 = make_test_song("3", "Track 3", Some(125.0), Some("9A"), Some(7));
        // Isolated Outlier: 175 BPM, 1B, Energy 10
        let out = make_test_song("out", "Speedcore Banger", Some(175.0), Some("1B"), Some(10));
        // Unanalyzed Outlier: no BPM, no key
        let mut un = make_test_song("un", "Unanalyzed", None, None, None);
        un.tags = Vec::new();

        let graph = CatalogGraph::new(vec![s1, s2, s3, out, un]);
        let outliers = graph.find_outliers();

        assert!(!outliers.is_empty());
        let outlier_ids: Vec<&str> = outliers.iter().map(|o| o.song_id.as_str()).collect();
        assert!(outlier_ids.contains(&"out"));
        assert!(outlier_ids.contains(&"un"));

        let speedcore = outliers.iter().find(|o| o.song_id == "out").unwrap();
        assert_eq!(speedcore.strong_connection_count, 0);
        assert!(speedcore
            .reasons
            .iter()
            .any(|r| r.contains("Unusual tempo")));
    }

    #[test]
    fn test_unusual_transitions_discovery() {
        let a = make_test_song("1", "Main House", Some(124.0), Some("8A"), Some(6));
        let smooth = make_test_song("2", "Smooth Next", Some(124.0), Some("9A"), Some(6));
        let reset = make_test_song("3", "Ambient Reset", Some(124.0), Some("8A"), Some(2));
        let double = make_test_song("4", "Drum and Bass", Some(62.0), Some("8A"), Some(8));

        let graph = CatalogGraph::new(vec![a, smooth, reset, double]);
        let unusual = graph.get_unusual_transitions("1", 5);

        assert!(!unusual.is_empty());
        let to_ids: Vec<&str> = unusual.iter().map(|r| r.to_song_id.as_str()).collect();
        assert!(to_ids.contains(&"3") || to_ids.contains(&"4"));
    }

    #[test]
    fn test_catalog_summary_stats() {
        let s1 = make_test_song("1", "Track 1", Some(124.0), Some("8A"), Some(6));
        let s2 = make_test_song("2", "Track 2", Some(124.5), Some("8A"), Some(6));
        let s3 = make_test_song("3", "Track 3", Some(125.0), Some("9A"), Some(7));

        let graph = CatalogGraph::new(vec![s1, s2, s3]);
        let stats = graph.get_catalog_summary_stats();

        assert_eq!(stats.total_songs, 3);
        assert_eq!(stats.total_possible_transitions, 6);
        assert!(stats.strong_transitions_count >= 4);
        assert!(stats.average_compatibility >= 0.80);
        assert_eq!(stats.cluster_count, 1);
        assert_eq!(stats.outlier_count, 0);
    }

    #[test]
    fn test_candidate_path_exploration_with_constraints() {
        let s1 = make_test_song("1", "Opener", Some(120.0), Some("8A"), Some(4));
        let s2 = make_test_song("2", "Build 1", Some(122.0), Some("9A"), Some(5));
        let s3 = make_test_song("3", "Must Play", Some(124.0), Some("10A"), Some(7));
        let s4 = make_test_song("4", "Peak Closer", Some(126.0), Some("11A"), Some(9));

        let graph = CatalogGraph::new(vec![s1.clone(), s2.clone(), s3.clone(), s4.clone()]);

        let constraints = DiscoveryConstraints {
            start_song_id: Some("1".to_string()),
            end_song_id: Some("4".to_string()),
            must_include_ids: vec!["3".to_string()],
            target_duration_minutes: None,
            duration_tolerance_minutes: None,
            limit: Some(3),
        };

        let paths = graph.find_candidate_paths(&constraints);
        assert!(!paths.is_empty());

        let top_path = &paths[0];
        assert_eq!(top_path.song_ids.first().unwrap(), "1");
        assert_eq!(top_path.song_ids.last().unwrap(), "4");
        assert!(top_path.song_ids.contains(&"3".to_string()));
        assert!(top_path.average_score >= 0.70);
        assert_eq!(top_path.transitions.len(), top_path.songs.len() - 1);
        assert!(!top_path.summary.is_empty());
    }

    #[test]
    fn test_candidate_path_duration_awareness() {
        // 4 songs with 240s (4 min) duration each
        let s1 = make_test_song("1", "Track 1", Some(124.0), Some("8A"), Some(5));
        let s2 = make_test_song("2", "Track 2", Some(124.0), Some("8A"), Some(6));
        let s3 = make_test_song("3", "Track 3", Some(124.0), Some("9A"), Some(7));
        let s4 = make_test_song("4", "Track 4", Some(124.0), Some("9A"), Some(8));

        let graph = CatalogGraph::new(vec![s1, s2, s3, s4]);

        // Target ~12 minutes (approx 3 tracks)
        let constraints = DiscoveryConstraints {
            start_song_id: None,
            end_song_id: None,
            must_include_ids: Vec::new(),
            target_duration_minutes: Some(12.0),
            duration_tolerance_minutes: Some(3.0),
            limit: Some(2),
        };

        let paths = graph.find_candidate_paths(&constraints);
        assert!(!paths.is_empty());
        let path = &paths[0];
        assert_eq!(path.songs.len(), 3);
        assert_eq!(path.total_duration_seconds, 720.0); // 12 minutes
    }

    #[test]
    fn test_candidate_path_small_catalog_large_duration() {
        // 4 tracks totaling 16 minutes with target duration 45 minutes
        let s1 = make_test_song("1", "Track 1", Some(124.0), Some("8A"), Some(5));
        let s2 = make_test_song("2", "Track 2", Some(124.0), Some("8A"), Some(6));
        let s3 = make_test_song("3", "Track 3", Some(124.0), Some("9A"), Some(7));
        let s4 = make_test_song("4", "Track 4", Some(124.0), Some("9A"), Some(8));

        let graph = CatalogGraph::new(vec![s1, s2, s3, s4]);

        let constraints = DiscoveryConstraints {
            start_song_id: None,
            end_song_id: None,
            must_include_ids: Vec::new(),
            target_duration_minutes: Some(45.0),
            duration_tolerance_minutes: Some(5.0),
            limit: Some(3),
        };

        let paths = graph.find_candidate_paths(&constraints);
        // Fallback should guarantee paths are returned even when catalog cannot fill 45 minutes
        assert!(
            !paths.is_empty(),
            "Paths should not be empty for small catalogs"
        );
        assert!(paths[0].songs.len() >= 2);
    }

    #[test]
    fn test_candidate_path_duration_tolerance_completion() {
        // 5 tracks with 300s (5 min) each: total 25 mins
        let s1 = make_test_song("1", "Track 1", Some(120.0), Some("8A"), Some(4));
        let s2 = make_test_song("2", "Track 2", Some(122.0), Some("8A"), Some(5));
        let s3 = make_test_song("3", "Track 3", Some(124.0), Some("9A"), Some(6));
        let s4 = make_test_song("4", "Track 4", Some(126.0), Some("9A"), Some(7));
        let s5 = make_test_song("5", "Track 5", Some(128.0), Some("10A"), Some(8));

        let mut songs = vec![s1, s2, s3, s4, s5];
        for s in &mut songs {
            s.duration_seconds = 300.0;
        }

        let graph = CatalogGraph::new(songs);

        // Target: 15 mins (3 tracks = 900s), tolerance: 6 mins (360s).
        // A 2-track path is 600s = 10 mins.
        // target (15m = 900s) - tolerance (6m = 360s) = 540s (9 mins).
        // Since 600s >= 540s, 2-track paths reach the tolerance threshold and complete early!
        let constraints = DiscoveryConstraints {
            start_song_id: Some("1".to_string()),
            end_song_id: None,
            must_include_ids: Vec::new(),
            target_duration_minutes: Some(15.0),
            duration_tolerance_minutes: Some(6.0),
            limit: Some(5),
        };

        let paths = graph.find_candidate_paths(&constraints);
        assert!(!paths.is_empty());
        for p in &paths {
            assert!(p.total_duration_seconds >= 540.0);
        }
    }
}
