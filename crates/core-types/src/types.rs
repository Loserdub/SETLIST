//! Shared domain types for DJ Set Assistant.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::camelot::{Camelot, Mode};

/// Audio buffer containing mono audio samples at a given sample rate.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AudioBuffer {
    /// Audio sample rate in Hz (typically 44100).
    pub sample_rate: u32,
    /// Mono audio samples normalized to [-1.0, 1.0].
    pub samples: Vec<f32>,
}

/// Loudness measurement information.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LoudnessInfo {
    /// Integrated loudness in LUFS.
    pub integrated_lufs: f32,
    /// Loudness range (LRA) in LU.
    pub loudness_range: f32,
    /// Maximum true peak in dBTP.
    pub true_peak: f32,
}

/// Metadata tags extracted from audio file container.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TrackTags {
    /// Track title.
    pub title: Option<String>,
    /// Track artist.
    pub artist: Option<String>,
    /// Album or release name.
    pub album: Option<String>,
}

/// Fully decoded audio file representation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DecodedAudio {
    /// Resampled mono audio buffer at standard analysis sample rate.
    pub buffer: AudioBuffer,
    /// Audio loudness measurements.
    pub loudness: LoudnessInfo,
    /// Container metadata tags.
    pub tags: TrackTags,
    /// Total duration in milliseconds.
    pub duration_ms: f64,
    /// Original audio sample rate prior to resampling.
    pub source_sample_rate: u32,
}

/// Beat grid containing downbeats, tempos, and precise beat timestamps.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BeatGrid {
    /// Timestamp of first downbeat in milliseconds.
    pub first_downbeat_ms: f64,
    /// Primary tempo in beats per minute.
    pub bpm: f64,
    /// Timestamps of all detected beats in milliseconds.
    pub beats_ms: Vec<f64>,
    /// Indicator flag for each beat whether it is a bar downbeat (typically 4/4).
    pub downbeat_flags: Vec<bool>,
    /// Whether the tempo remains steady across the entire track.
    pub steady: bool,
}

/// Rhythm analysis results.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RhythmAnalysis {
    /// Primary detected beat grid.
    pub grid: BeatGrid,
    /// Alternative BPM candidate peaks (e.g., half-time, double-time).
    pub bpm_alternates: Vec<f64>,
}

/// Configuration options for rhythm and tempo estimation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RhythmConfig {
    /// Minimum expected BPM threshold.
    pub min_bpm: f64,
    /// Maximum expected BPM threshold.
    pub max_bpm: f64,
    /// Center of the log-normal tempo prior in BPM (default 125.0).
    pub bpm_prior_center: f64,
    /// Width (standard deviation) of the log-normal tempo prior.
    pub bpm_prior_width: f64,
}

impl Default for RhythmConfig {
    fn default() -> Self {
        Self {
            min_bpm: 60.0,
            max_bpm: 200.0,
            bpm_prior_center: 125.0,
            bpm_prior_width: 0.6,
        }
    }
}

/// Musical key estimation including Camelot wheel representation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Key {
    /// Pitch class (0 = C, 1 = C#, ..., 11 = B).
    pub pitch_class: u8,
    /// Mode (Minor or Major).
    pub mode: Mode,
    /// Camelot code representation (e.g. 8A, 8B).
    pub camelot: Camelot,
    /// Tuning deviation from 440 Hz standard in cents (-50.0 to +50.0).
    pub tuning_cents: f32,
}

/// Dynamic and spectral feature trajectories over time.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DynamicsAnalysis {
    /// Feature sampling frame rate in Hz.
    pub frame_rate: f64,
    /// RMS energy curve over time.
    pub rms_curve: Vec<f32>,
    /// Ratio of low-frequency energy over time.
    pub low_ratio_curve: Vec<f32>,
    /// Spectral centroid curve over time.
    pub centroid_curve: Vec<f32>,
}

/// Energy curve mapped per bar.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct EnergyCurve {
    /// Normalized energy values per musical bar.
    pub per_bar: Vec<f32>,
}

/// Segment classification labels according to AGENTS.md section 6.7.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum SegmentLabel {
    /// Track introduction.
    Intro,
    /// Verse section.
    Verse,
    /// Tension buildup leading to drop.
    Buildup,
    /// High-energy peak drop section.
    Drop,
    /// Low-energy breakdown section.
    Breakdown,
    /// Outro or mix-out section.
    Outro,
}

/// Structural musical segment snapped to bar boundaries.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Segment {
    /// Semantic segment label.
    pub label: SegmentLabel,
    /// Start time in milliseconds.
    pub start_ms: f64,
    /// End time in milliseconds.
    pub end_ms: f64,
    /// Energy rating for this segment from 1 to 10.
    pub energy: u8,
}

/// Kind of cue point.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum CueKind {
    /// Standard DJ hot cue.
    HotCue,
    /// Memory marker cue.
    MemoryCue,
    /// Looping section cue.
    Loop,
}

/// Cue point placement.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CuePoint {
    /// Cue register index (0 to 7, corresponding to A through H).
    pub index: u8,
    /// Cue position in milliseconds.
    pub time_ms: f64,
    /// Cue label description.
    pub label: String,
    /// Hex color code for display (e.g. "#FF5500").
    pub color_hex: String,
    /// Type of cue point.
    pub kind: CueKind,
    /// Loop end timestamp in milliseconds if this is a loop cue.
    pub loop_end_ms: Option<f64>,
}

/// Waveform data for a single frequency band.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct WaveformBand {
    /// Peak amplitude bytes.
    pub peak: Vec<u8>,
    /// RMS amplitude bytes.
    pub rms: Vec<u8>,
}

/// 3-band overview waveform (low, mid, high frequencies).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Waveform3Band {
    /// Sample points per second of audio.
    pub points_per_sec: u32,
    /// Low frequency band (bass).
    pub low: WaveformBand,
    /// Mid frequency band (vocals/leads).
    pub mid: WaveformBand,
    /// High frequency band (hi-hats/cymbals).
    pub high: WaveformBand,
}

/// Complete analysis results for an audio track.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TrackAnalysis {
    /// Integrated loudness and dynamic range info.
    pub loudness: LoudnessInfo,
    /// Beat grid and rhythm analysis.
    pub rhythm: RhythmAnalysis,
    /// Tonal and key analysis.
    pub key: Key,
    /// Dynamics and spectral envelope curves.
    pub dynamics: DynamicsAnalysis,
    /// Overall energy score (1 to 10).
    pub energy_score: u8,
    /// Bar-by-bar energy curve.
    pub energy_curve: EnergyCurve,
    /// Detected structural segments.
    pub segments: Vec<Segment>,
    /// Recommended cue points (indexes 0 to 7).
    pub cue_points: Vec<CuePoint>,
    /// 3-band waveform overview.
    pub waveform: Waveform3Band,
}

/// Track entry in the library.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Track {
    /// Unique track identifier (UUID string).
    pub id: String,
    /// Absolute filesystem path to audio file.
    pub path: String,
    /// Fast content hash (SHA-256 or BLAKE3 hex).
    pub hash: String,
    /// Extracted container tags.
    pub tags: TrackTags,
    /// Total duration in milliseconds.
    pub duration_ms: f64,
    /// Analysis results if completed.
    pub analysis: Option<TrackAnalysis>,
    /// ISO-8601 UTC timestamp of analysis completion.
    pub analyzed_at: Option<String>,
    /// Analysis pipeline version.
    pub analysis_version: Option<String>,
}

impl Track {
    /// Extracts a clean title and artist from a track, falling back intelligently to
    /// the audio file's name when ID3/container tags are absent.
    pub fn display_metadata(&self) -> (String, String) {
        let tag_title = self
            .tags
            .title
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let tag_artist = self
            .tags
            .artist
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());

        if let Some(t) = tag_title {
            let a = tag_artist.unwrap_or("Unknown Artist");
            return (t.to_string(), a.to_string());
        }

        // Fallback: Parse filename stem
        let raw_filename = std::path::Path::new(&self.path)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");

        let stem = if let Some(idx) = raw_filename.rfind('.') {
            &raw_filename[..idx]
        } else {
            raw_filename
        };

        // Clean leading track sequence numbers (e.g. "01 - ", "02. ", "03_")
        let mut stripped_stem = stem;

        let mut chars = stripped_stem.chars();
        let mut digit_count = 0;

        for c in &mut chars {
            if c.is_ascii_digit() {
                digit_count += 1;
            } else {
                break;
            }
        }

        if digit_count > 0 {
            let after_digits = &stripped_stem[digit_count..];
            let mut chars = after_digits.chars();
            let mut sep_bytes = 0;
            for c in &mut chars {
                if c.is_whitespace() || c == '.' || c == '_' || c == '-' {
                    sep_bytes += c.len_utf8();
                } else {
                    break;
                }
            }
            if sep_bytes > 0 {
                stripped_stem = &after_digits[sep_bytes..];
            }
        }

        let stripped_stem = stripped_stem.trim();

        if stripped_stem.contains(" - ") {
            let parts: Vec<&str> = stripped_stem
                .split(" - ")
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .collect();
            if parts.len() >= 2 {
                let parsed_title = parts.last().copied().unwrap_or(stem);
                let parsed_artist = parts[parts.len() - 2];
                return (
                    parsed_title.to_string(),
                    tag_artist.unwrap_or(parsed_artist).to_string(),
                );
            }
        }

        let title = if stripped_stem.is_empty() {
            if stem.is_empty() {
                "Untitled Track"
            } else {
                stem
            }
        } else {
            stripped_stem
        };

        (
            title.to_string(),
            tag_artist.unwrap_or("Unknown Artist").to_string(),
        )
    }
}

/// User-tunable weights for the transition cost model.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CostWeights {
    /// Weight for tempo discrepancy cost.
    pub tempo: f32,
    /// Weight for key distance cost.
    pub key: f32,
    /// Weight for energy distance cost.
    pub energy: f32,
    /// Weight for timbre distance cost (0.0 in v1).
    pub timbre: f32,
}

impl Default for CostWeights {
    fn default() -> Self {
        Self {
            tempo: 0.30,
            key: 0.35,
            energy: 0.35,
            timbre: 0.00,
        }
    }
}

/// A single row in the user-tunable Camelot key penalty table.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct KeyPenaltyRow {
    /// Circular distance on the Camelot wheel (0 to 6).
    pub distance: u8,
    /// Penalty when both tracks share the same mode (Minor-Minor or Major-Major).
    pub same_mode: f32,
    /// Penalty when the mode flips (Minor to Major or Major to Minor).
    pub mode_flip: f32,
}

/// Parameters controlling the energy trajectory penalty calculation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct EnergyModelSettings {
    /// Quadratic normalization divisor for energy distance: `min(((E_j - E_i) - dE_target)^2 / divisor, 1)`.
    /// Default is 16.0 per AGENTS.md 6.3.
    pub divisor: f32,
    /// Target step delta for linear ramp profile. Default is 1.5.
    pub target_step: f32,
}

impl Default for EnergyModelSettings {
    fn default() -> Self {
        Self {
            divisor: 16.0,
            target_step: 1.5,
        }
    }
}

/// Application settings persisted to the database.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AppSettings {
    /// Weights for the transition cost model.
    pub cost_weights: CostWeights,
    /// Penalty table for key distances d=0..=6.
    pub key_penalties: Vec<KeyPenaltyRow>,
    /// Parameters for energy trajectory scoring.
    pub energy_model: EnergyModelSettings,
    /// Number of concurrent background worker threads.
    pub worker_count: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            cost_weights: CostWeights::default(),
            key_penalties: vec![
                KeyPenaltyRow {
                    distance: 0,
                    same_mode: 0.00,
                    mode_flip: 0.10,
                },
                KeyPenaltyRow {
                    distance: 1,
                    same_mode: 0.10,
                    mode_flip: 0.40,
                },
                KeyPenaltyRow {
                    distance: 2,
                    same_mode: 0.35,
                    mode_flip: 0.60,
                },
                KeyPenaltyRow {
                    distance: 3,
                    same_mode: 0.70,
                    mode_flip: 0.80,
                },
                KeyPenaltyRow {
                    distance: 4,
                    same_mode: 0.85,
                    mode_flip: 0.90,
                },
                KeyPenaltyRow {
                    distance: 5,
                    same_mode: 0.95,
                    mode_flip: 0.95,
                },
                KeyPenaltyRow {
                    distance: 6,
                    same_mode: 1.00,
                    mode_flip: 1.00,
                },
            ],
            energy_model: EnergyModelSettings::default(),
            worker_count: 4,
        }
    }
}

/// Planned setlist energy profile shape.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum EnergyProfile {
    /// Energy rises steadily with 1-2 BPM steps.
    LinearRamp,
    /// Alternating peaks and valleys.
    Wave,
    /// Rapid ramp to high energy held for the duration.
    PeakPlateau,
}

/// Categorized harmonic/tempo transition types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum TransitionType {
    /// 0 semitones, same Camelot number and letter.
    ExactMatch,
    /// 0 semitones, swap between A and B mode.
    RelativeSwitch,
    /// +1 or -1 on Camelot circle (+7 or -5 semitones).
    Fifth,
    /// +2 semitones / +2 Camelot shift.
    WholeStepLift,
    /// +1 semitone / +7 Camelot shift.
    HalfStepLift,
    /// +6 semitones / +6 Camelot shift (maximum dissonance).
    Tritone,
    /// Other transition move.
    Other,
}

/// Transition advice and recommendations between two tracks.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TransitionAdvice {
    /// Transition harmonic category.
    pub transition_type: TransitionType,
    /// BPM difference between outgoing and incoming tracks.
    pub bpm_delta: f64,
    /// Circular Camelot number distance (0 to 6).
    pub key_distance: u8,
    /// Whether the mode changes between minor and major.
    pub mode_flip: bool,
    /// True if ΔBPM > 8 or key distance d > 3.
    pub intervention_required: bool,
    /// True if outro is shorter than 16 bars.
    pub loop_extension_recommended: bool,
    /// Recommended phrase length for transition (8, 16, or 32 bars).
    pub phrase_bars: u32,
    /// Explanatory guidance and transition tips.
    pub notes: Vec<String>,
    /// Total weighted transition cost in [0.0, 1.0].
    #[serde(default)]
    pub total_cost: Option<f32>,
    /// Unweighted tempo discrepancy term Phi_tempo in [0.0, 1.0].
    #[serde(default)]
    pub tempo_cost: Option<f32>,
    /// Unweighted musical key distance term Phi_key in [0.0, 1.0].
    #[serde(default)]
    pub key_cost: Option<f32>,
    /// Unweighted energy trajectory penalty term Phi_energy in [0.0, 1.0].
    #[serde(default)]
    pub energy_cost: Option<f32>,
    /// Unweighted timbre difference term Phi_timbre in [0.0, 1.0].
    #[serde(default)]
    pub timbre_cost: Option<f32>,
    /// Expected energy change target dE_target used for evaluation.
    #[serde(default)]
    pub de_target: Option<f32>,
    /// Cost weights applied during evaluation.
    #[serde(default)]
    pub weights: Option<CostWeights>,
    /// Energy profile used for transition evaluation if applicable.
    #[serde(default)]
    pub profile: Option<EnergyProfile>,
}

impl Default for TransitionAdvice {
    fn default() -> Self {
        Self {
            transition_type: TransitionType::Other,
            bpm_delta: 0.0,
            key_distance: 0,
            mode_flip: false,
            intervention_required: false,
            loop_extension_recommended: false,
            phrase_bars: 16,
            notes: Vec::new(),
            total_cost: None,
            tempo_cost: None,
            key_cost: None,
            energy_cost: None,
            timbre_cost: None,
            de_target: None,
            weights: None,
            profile: None,
        }
    }
}

/// Single track entry in a setlist sequence.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SetlistEntry {
    /// 1-based order in the setlist.
    pub position: u32,
    /// Referenced track ID.
    pub track_id: String,
    /// Full track details if populated.
    pub track: Option<Track>,
    /// Transition advice into this track from preceding track.
    pub transition: Option<TransitionAdvice>,
    /// Target energy level at this position.
    pub target_energy: Option<f32>,
}

/// Export format targets supported by the application.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum ExportTarget {
    /// Rekordbox XML playlist and cue points format.
    RekordboxXml,
    /// Standard M3U8 UTF-8 playlist format.
    M3u8,
    /// Tabular set sheet in CSV format.
    SetSheetCsv,
    /// Set sheet formatted as Markdown.
    SetSheetMarkdown,
}

/// Structured result of a setlist export operation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ExportResult {
    /// Full path of the exported file.
    pub path: String,
    /// Export format target used.
    pub format: ExportTarget,
    /// Number of tracks/items written to the export.
    pub track_count: usize,
}

/// Strongly typed musical song entity representing performance and acoustic properties.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Song {
    /// Unique song identifier (UUID string).
    pub id: String,
    /// Song title.
    pub title: String,
    /// Primary artist or composer.
    pub artist: String,
    /// Duration of the song in seconds.
    pub duration_seconds: f64,
    /// Musical tempo in beats per minute, if known.
    #[serde(default)]
    pub bpm: Option<f64>,
    /// Musical key notation (e.g. "C", "Am", "F#m", "8A").
    #[serde(default)]
    pub musical_key: Option<String>,
    /// Musical mode (Major or Minor).
    #[serde(default)]
    pub mode: Option<Mode>,
    /// Camelot code representation (e.g. "8A", "11B").
    #[serde(default)]
    pub camelot_code: Option<String>,
    /// Instrument tuning identifier (e.g. "Standard", "Drop D", "DADGAD").
    #[serde(default)]
    pub tuning: Option<String>,
    /// Capo fret position (0 = no capo, 1 = 1st fret, etc.).
    #[serde(default)]
    pub capo: Option<u8>,
    /// Energy rating on a discrete 1 to 10 scale.
    #[serde(default)]
    pub energy_rating: Option<u8>,
    /// Lead performer or vocalist.
    #[serde(default)]
    pub lead_performer: Option<String>,
    /// User or genre tags.
    #[serde(default)]
    pub tags: Vec<String>,
    /// Performance or arrangement notes.
    #[serde(default)]
    pub notes: Option<String>,
}

impl From<&Track> for Song {
    fn from(track: &Track) -> Self {
        let (title, artist) = track.display_metadata();

        let duration_seconds = (track.duration_ms / 1000.0).max(0.0);
        let bpm = track.analysis.as_ref().map(|a| a.rhythm.grid.bpm);
        let musical_key = track.analysis.as_ref().map(|a| a.key.camelot.to_string());
        let mode = track.analysis.as_ref().map(|a| a.key.mode);
        let camelot_code = track.analysis.as_ref().map(|a| a.key.camelot.to_string());
        let energy_rating = track.analysis.as_ref().map(|a| a.energy_score);

        Song {
            id: track.id.clone(),
            title,
            artist,
            duration_seconds,
            bpm,
            musical_key,
            mode,
            camelot_code,
            tuning: Some("Standard".to_string()),
            capo: Some(0),
            energy_rating,
            lead_performer: None,
            tags: Vec::new(),
            notes: None,
        }
    }
}

/// Domain transition representation between two setlist items.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Transition {
    /// Transition harmonic/tempo category.
    pub transition_type: TransitionType,
    /// BPM discrepancy between items.
    pub bpm_delta: f64,
    /// Circular Camelot number distance (0 to 6).
    pub key_distance: u8,
    /// Mode change indicator.
    pub mode_flip: bool,
    /// Whether DJ intervention is recommended.
    pub intervention_required: bool,
    /// Whether loop extension is recommended.
    pub loop_extension_recommended: bool,
    /// Recommended phrase length in bars (8, 16, or 32).
    pub phrase_bars: u32,
    /// Transition notes or performance tips.
    pub notes: Vec<String>,
    /// Total computed transition cost in [0.0, 1.0].
    #[serde(default)]
    pub total_cost: Option<f32>,
}

impl From<TransitionAdvice> for Transition {
    fn from(adv: TransitionAdvice) -> Self {
        Self {
            transition_type: adv.transition_type,
            bpm_delta: adv.bpm_delta,
            key_distance: adv.key_distance,
            mode_flip: adv.mode_flip,
            intervention_required: adv.intervention_required,
            loop_extension_recommended: adv.loop_extension_recommended,
            phrase_bars: adv.phrase_bars,
            notes: adv.notes,
            total_cost: adv.total_cost,
        }
    }
}

impl From<Transition> for TransitionAdvice {
    fn from(t: Transition) -> Self {
        Self {
            transition_type: t.transition_type,
            bpm_delta: t.bpm_delta,
            key_distance: t.key_distance,
            mode_flip: t.mode_flip,
            intervention_required: t.intervention_required,
            loop_extension_recommended: t.loop_extension_recommended,
            phrase_bars: t.phrase_bars,
            notes: t.notes,
            total_cost: t.total_cost,
            ..Default::default()
        }
    }
}

/// Category of a setlist performance item.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "type", content = "data")]
#[ts(export)]
#[allow(clippy::large_enum_variant)]
pub enum SetlistItemType {
    /// Musical song performance block.
    Song {
        /// Song identifier.
        song_id: String,
        /// Full song details if resolved.
        #[serde(default)]
        song: Option<Song>,
    },
    /// Spoken banter or crowd interaction block.
    Banter {
        /// Topic or description of spoken banter.
        topic: String,
        /// Estimated duration in seconds.
        #[serde(default)]
        duration_seconds: Option<f64>,
    },
    /// Performance intermission or break.
    Intermission {
        /// Planned intermission duration in seconds.
        duration_seconds: f64,
        /// Optional notes for intermission.
        #[serde(default)]
        notes: Option<String>,
    },
    /// Instrument change or guitar retuning block.
    TuningChange {
        /// Target tuning notation (e.g. "Drop D").
        target_tuning: String,
        /// Instrument name (e.g. "Acoustic Guitar").
        #[serde(default)]
        instrument: Option<String>,
    },
    /// Custom performance block (e.g. guest intro, solo, encore announcement).
    Custom {
        /// Block title.
        title: String,
        /// Block description or cues.
        #[serde(default)]
        description: Option<String>,
        /// Estimated duration in seconds.
        #[serde(default)]
        duration_seconds: Option<f64>,
    },
}

/// A discrete performance item in a setlist sequence.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SetlistItem {
    /// Unique item instance ID in the setlist.
    pub id: String,
    /// 1-based sequence position in the setlist.
    pub position: u32,
    /// Typed item payload (Song, Banter, Intermission, TuningChange, Custom).
    pub item: SetlistItemType,
    /// Transition guidance into this item from preceding item.
    #[serde(default)]
    pub transition: Option<TransitionAdvice>,
    /// Target energy curve rating at this position.
    #[serde(default)]
    pub target_energy: Option<f32>,
    /// Stage notes or performance cues for this item.
    #[serde(default)]
    pub notes: Option<String>,
}

impl From<&SetlistEntry> for SetlistItem {
    fn from(entry: &SetlistEntry) -> Self {
        let song = entry.track.as_ref().map(Song::from);
        Self {
            id: format!("item_{}_{}", entry.position, entry.track_id),
            position: entry.position,
            item: SetlistItemType::Song {
                song_id: entry.track_id.clone(),
                song,
            },
            transition: entry.transition.clone(),
            target_energy: entry.target_energy,
            notes: None,
        }
    }
}

impl From<&SetlistItem> for SetlistEntry {
    fn from(item: &SetlistItem) -> Self {
        let (track_id, track) = match &item.item {
            SetlistItemType::Song { song_id, song } => {
                let track = song.as_ref().map(|s| Track {
                    id: s.id.clone(),
                    path: String::new(),
                    hash: String::new(),
                    tags: TrackTags {
                        title: Some(s.title.clone()),
                        artist: Some(s.artist.clone()),
                        album: None,
                    },
                    duration_ms: s.duration_seconds * 1000.0,
                    analysis: None,
                    analyzed_at: None,
                    analysis_version: None,
                });
                (song_id.clone(), track)
            }
            SetlistItemType::Banter { topic, .. } => (format!("banter:{}", topic), None),
            SetlistItemType::Intermission { .. } => ("intermission".to_string(), None),
            SetlistItemType::TuningChange { target_tuning, .. } => {
                (format!("tuning:{}", target_tuning), None)
            }
            SetlistItemType::Custom { title, .. } => (format!("custom:{}", title), None),
        };

        SetlistEntry {
            position: item.position,
            track_id,
            track,
            transition: item.transition.clone(),
            target_energy: item.target_energy,
        }
    }
}

/// Complete planned setlist document containing metadata and performance items.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Setlist {
    /// Unique setlist identifier (UUID string).
    pub id: String,
    /// User-assigned name of the setlist.
    pub name: String,
    /// Energy progression profile.
    pub energy_profile: EnergyProfile,
    /// Ordered performance items in the setlist.
    pub items: Vec<SetlistItem>,
    /// ISO-8601 UTC timestamp of creation.
    #[serde(default)]
    pub created_at: Option<String>,
    /// ISO-8601 UTC timestamp of last update.
    #[serde(default)]
    pub updated_at: Option<String>,
}

impl Setlist {
    /// Creates a new setlist.
    #[must_use]
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        energy_profile: EnergyProfile,
        items: Vec<SetlistItem>,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            energy_profile,
            items,
            created_at: None,
            updated_at: None,
        }
    }

    /// Creates a setlist from legacy SetlistEntry slice or vector.
    #[must_use]
    pub fn from_entries(
        id: impl Into<String>,
        name: impl Into<String>,
        energy_profile: EnergyProfile,
        entries: impl AsRef<[SetlistEntry]>,
    ) -> Self {
        let items = entries.as_ref().iter().map(SetlistItem::from).collect();
        Self::new(id, name, energy_profile, items)
    }

    /// Converts setlist items to legacy SetlistEntry list.
    #[must_use]
    pub fn to_entries(&self) -> Vec<SetlistEntry> {
        self.items.iter().map(SetlistEntry::from).collect()
    }

    /// Alias for `to_entries()` for ergonomics.
    #[must_use]
    pub fn entries(&self) -> Vec<SetlistEntry> {
        self.to_entries()
    }
}
