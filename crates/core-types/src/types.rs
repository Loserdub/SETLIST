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
}

impl Default for RhythmConfig {
    fn default() -> Self {
        Self {
            min_bpm: 60.0,
            max_bpm: 200.0,
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
