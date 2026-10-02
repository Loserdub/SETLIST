//! Bridge track suggestion finding intermediate tracks to minimize transition costs.

use crate::scoring::transition_cost;
use core_types::{CostWeights, Track, TrackAnalysis};

/// Trait to access `TrackAnalysis` and optional track identification from heterogeneous track references.
pub trait AsTrackAnalysis {
    /// Returns a reference to the track analysis if available.
    fn as_analysis(&self) -> Option<&TrackAnalysis>;

    /// Returns the track identifier if available.
    fn track_id(&self) -> Option<&str> {
        None
    }
}

impl AsTrackAnalysis for Track {
    fn as_analysis(&self) -> Option<&TrackAnalysis> {
        self.analysis.as_ref()
    }

    fn track_id(&self) -> Option<&str> {
        Some(&self.id)
    }
}

impl AsTrackAnalysis for TrackAnalysis {
    fn as_analysis(&self) -> Option<&TrackAnalysis> {
        Some(self)
    }
}

/// Detailed bridge track candidate recommendation including intermediate costs.
#[derive(Debug, Clone, PartialEq)]
pub struct BridgeCandidate {
    /// Recommended bridge track.
    pub track: Track,
    /// Transition cost from track A to bridge track X.
    pub cost_a_to_bridge: f32,
    /// Transition cost from bridge track X to track B.
    pub cost_bridge_to_b: f32,
    /// Total combined bridge cost: cost(a, x) + cost(x, b).
    pub total_cost: f32,
}

/// Recommends the top 3 tracks from `library` that minimize `cost(a, x) + cost(x, b)`.
///
/// Filters out tracks identical to `a` or `b` and tracks lacking completed analysis.
/// Evaluates costs using [`CostWeights::default`] with flat energy profile (`slope = 0.0`).
///
/// # Arguments
/// * `a` - Outgoing source track or analysis
/// * `b` - Incoming target track or analysis
/// * `library` - Candidate library tracks to search
///
/// # Returns
/// Vector of up to 3 `Track` entries sorted in ascending order of combined transition cost.
#[must_use]
pub fn suggest_bridge<T: AsTrackAnalysis>(a: &T, b: &T, library: &[Track]) -> Vec<Track> {
    suggest_bridge_with_weights(a, b, library, &CostWeights::default())
}

/// Recommends the top 3 bridge tracks using custom cost weights.
#[must_use]
pub fn suggest_bridge_with_weights<T: AsTrackAnalysis>(
    a: &T,
    b: &T,
    library: &[Track],
    weights: &CostWeights,
) -> Vec<Track> {
    suggest_bridge_candidates(a, b, library, weights)
        .into_iter()
        .map(|c| c.track)
        .collect()
}

/// Evaluates all candidates in `library` and returns detailed recommendations for the top 3 bridges.
#[must_use]
pub fn suggest_bridge_candidates<T: AsTrackAnalysis>(
    a: &T,
    b: &T,
    library: &[Track],
    weights: &CostWeights,
) -> Vec<BridgeCandidate> {
    let analysis_a = match a.as_analysis() {
        Some(an) => an,
        None => return Vec::new(),
    };
    let analysis_b = match b.as_analysis() {
        Some(an) => an,
        None => return Vec::new(),
    };

    let id_a = a.track_id();
    let id_b = b.track_id();

    let mut scored: Vec<BridgeCandidate> = library
        .iter()
        .filter_map(|track| {
            // Exclude tracks without completed analysis
            let analysis_x = track.analysis.as_ref()?;

            // Exclude tracks that match outgoing track A or incoming track B
            if let Some(a_id) = id_a {
                if track.id == a_id {
                    return None;
                }
            }
            if let Some(b_id) = id_b {
                if track.id == b_id {
                    return None;
                }
            }

            // Exclude identical memory pointers if references were passed
            if std::ptr::eq(analysis_x, analysis_a) || std::ptr::eq(analysis_x, analysis_b) {
                return None;
            }

            let cost_ax = transition_cost(analysis_a, analysis_x, weights, 0.0).total;
            let cost_xb = transition_cost(analysis_x, analysis_b, weights, 0.0).total;
            let total_cost = cost_ax + cost_xb;

            Some(BridgeCandidate {
                track: track.clone(),
                cost_a_to_bridge: cost_ax,
                cost_bridge_to_b: cost_xb,
                total_cost,
            })
        })
        .collect();

    // Sort by total cost ascending (lowest cost first)
    scored.sort_by(|c1, c2| {
        c1.total_cost
            .partial_cmp(&c2.total_cost)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    scored.truncate(3);
    scored
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_types::{
        BeatGrid, Camelot, CamelotLetter, DynamicsAnalysis, EnergyCurve, Key, LoudnessInfo, Mode,
        RhythmAnalysis, TrackTags, Waveform3Band, WaveformBand,
    };

    fn make_test_track(
        id: &str,
        bpm: f64,
        camelot_num: u8,
        camelot_letter: CamelotLetter,
        energy: u8,
    ) -> Track {
        Track {
            id: id.to_string(),
            path: format!("/music/{}.mp3", id),
            hash: format!("hash-{}", id),
            tags: TrackTags {
                title: Some(id.to_string()),
                artist: Some("Test Artist".to_string()),
                album: None,
            },
            duration_ms: 180_000.0,
            analysis: Some(TrackAnalysis {
                loudness: LoudnessInfo {
                    integrated_lufs: -14.0,
                    loudness_range: 6.0,
                    true_peak: -1.0,
                },
                rhythm: RhythmAnalysis {
                    grid: BeatGrid {
                        first_downbeat_ms: 0.0,
                        bpm,
                        beats_ms: vec![],
                        downbeat_flags: vec![],
                        steady: true,
                    },
                    bpm_alternates: vec![],
                },
                key: Key {
                    pitch_class: 0,
                    mode: match camelot_letter {
                        CamelotLetter::A => Mode::Minor,
                        CamelotLetter::B => Mode::Major,
                    },
                    camelot: Camelot::new(camelot_num, camelot_letter).unwrap(),
                    tuning_cents: 0.0,
                },
                dynamics: DynamicsAnalysis {
                    frame_rate: 44100.0,
                    rms_curve: vec![],
                    low_ratio_curve: vec![],
                    centroid_curve: vec![],
                },
                energy_score: energy,
                energy_curve: EnergyCurve { per_bar: vec![] },
                segments: vec![],
                cue_points: vec![],
                waveform: Waveform3Band {
                    points_per_sec: 100,
                    low: WaveformBand {
                        peak: vec![],
                        rms: vec![],
                    },
                    mid: WaveformBand {
                        peak: vec![],
                        rms: vec![],
                    },
                    high: WaveformBand {
                        peak: vec![],
                        rms: vec![],
                    },
                },
            }),
            analyzed_at: Some("2026-10-01T20:00:00Z".to_string()),
            analysis_version: Some("1.0.0".to_string()),
        }
    }

    #[test]
    fn test_suggest_bridge_top_3() {
        // Source track A: 120 BPM, 8A, Energy 4
        let track_a = make_test_track("track-a", 120.0, 8, CamelotLetter::A, 4);
        // Destination track B: 128 BPM, 10A, Energy 8
        let track_b = make_test_track("track-b", 128.0, 10, CamelotLetter::A, 8);

        // Bridge candidates:
        // Candidate 1: 124 BPM, 9A, Energy 6 (Perfect bridge: midway in BPM, key, and energy)
        let c1 = make_test_track("cand-ideal", 124.0, 9, CamelotLetter::A, 6);
        // Candidate 2: 123 BPM, 8A, Energy 5 (Good bridge)
        let c2 = make_test_track("cand-good", 123.0, 8, CamelotLetter::A, 5);
        // Candidate 3: 125 BPM, 10A, Energy 7 (Good bridge)
        let c3 = make_test_track("cand-okay", 125.0, 10, CamelotLetter::A, 7);
        // Candidate 4: 175 BPM, 2A, Energy 10 (Poor bridge: huge tempo & key clash)
        let c4 = make_test_track("cand-poor", 175.0, 2, CamelotLetter::A, 10);
        // Candidate 5: Track identical to A (must be excluded)
        let c5 = track_a.clone();
        // Candidate 6: Track identical to B (must be excluded)
        let c6 = track_b.clone();
        // Candidate 7: Track without analysis (must be excluded)
        let mut c7 = make_test_track("cand-unanalyzed", 124.0, 9, CamelotLetter::A, 6);
        c7.analysis = None;

        let library = vec![
            c4.clone(),
            c1.clone(),
            c5.clone(),
            c2.clone(),
            c7.clone(),
            c3.clone(),
            c6.clone(),
        ];

        let bridges = suggest_bridge(&track_a, &track_b, &library);

        // Must return top 3
        assert_eq!(bridges.len(), 3);

        // Neither A nor B nor unanalyzed should be returned
        assert!(!bridges.iter().any(|t| t.id == "track-a"));
        assert!(!bridges.iter().any(|t| t.id == "track-b"));
        assert!(!bridges.iter().any(|t| t.id == "cand-unanalyzed"));

        // Ideal bridge (c1) must be first (lowest total cost)
        assert_eq!(bridges[0].id, "cand-ideal");

        // Verify detailed candidates ordering
        let detailed =
            suggest_bridge_candidates(&track_a, &track_b, &library, &CostWeights::default());
        assert_eq!(detailed.len(), 3);
        assert!(detailed[0].total_cost <= detailed[1].total_cost);
        assert!(detailed[1].total_cost <= detailed[2].total_cost);
    }

    #[test]
    fn test_suggest_bridge_analyses_and_empty_library() {
        let track_a = make_test_track("track-a", 120.0, 8, CamelotLetter::A, 4);
        let track_b = make_test_track("track-b", 128.0, 10, CamelotLetter::A, 8);

        // Empty library returns empty vec
        let empty_result = suggest_bridge(&track_a, &track_b, &[]);
        assert!(empty_result.is_empty());

        // Calling with TrackAnalysis references directly via AsTrackAnalysis trait
        let an_a = track_a.analysis.as_ref().unwrap();
        let an_b = track_b.analysis.as_ref().unwrap();
        let c1 = make_test_track("c1", 124.0, 9, CamelotLetter::A, 6);
        let bridges = suggest_bridge(an_a, an_b, &[c1.clone()]);
        assert_eq!(bridges.len(), 1);
        assert_eq!(bridges[0].id, "c1");
    }
}
