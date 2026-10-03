//! 3-band waveform analysis, Butterworth filtering, and compact serialization.
//!
//! Provides:
//! - 4th-order Butterworth low-pass (< 150 Hz), band-pass (150 - 2500 Hz), and high-pass (> 2500 Hz) filters.
//! - Downsampled peak and RMS extraction normalized to `u8` at 150 points per second.
//! - Compact binary encoding and decoding for database persistence.

use std::f64::consts::PI;

use crate::AnalysisError;
use core_types::{AudioBuffer, Waveform3Band, WaveformBand};

/// Standard target waveform points per second of audio.
pub const WAVEFORM_POINTS_PER_SEC: u32 = 150;

/// Low-pass filter cutoff frequency in Hz (sub / bass frequencies).
pub const LOW_CUTOFF_HZ: f64 = 150.0;

/// High-pass filter cutoff frequency in Hz (hi-hat / cymbal frequencies).
pub const HIGH_CUTOFF_HZ: f64 = 2500.0;

/// Magic byte header for compact waveform binary serialization.
const WAVEFORM_MAGIC: [u8; 4] = [b'W', b'A', b'V', 1];

/// Second-order IIR biquad filter in Direct Form II Transposed.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    s1: f32,
    s2: f32,
}

impl Biquad {
    /// Creates a new biquad filter with normalized coefficients.
    #[must_use]
    pub fn new(b0: f32, b1: f32, b2: f32, a1: f32, a2: f32) -> Self {
        Self {
            b0,
            b1,
            b2,
            a1,
            a2,
            s1: 0.0,
            s2: 0.0,
        }
    }

    /// Processes a single audio sample through Direct Form II Transposed.
    #[inline(always)]
    pub fn process(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.s1;
        self.s1 = self.b1 * x - self.a1 * y + self.s2;
        self.s2 = self.b2 * x - self.a2 * y;
        y
    }

    /// Resets the internal filter state memories to zero.
    pub fn reset(&mut self) {
        self.s1 = 0.0;
        self.s2 = 0.0;
    }
}

/// Computes second-order low-pass biquad coefficients using the RBJ Audio EQ Cookbook.
fn biquad_lowpass(sample_rate: f64, cutoff_hz: f64, q: f64) -> Biquad {
    let w0 = 2.0 * PI * (cutoff_hz / sample_rate);
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / (2.0 * q);

    let b0 = (1.0 - cos_w0) / 2.0;
    let b1 = 1.0 - cos_w0;
    let b2 = (1.0 - cos_w0) / 2.0;
    let a0 = 1.0 + alpha;
    let a1 = -2.0 * cos_w0;
    let a2 = 1.0 - alpha;

    Biquad::new(
        (b0 / a0) as f32,
        (b1 / a0) as f32,
        (b2 / a0) as f32,
        (a1 / a0) as f32,
        (a2 / a0) as f32,
    )
}

/// Computes second-order high-pass biquad coefficients using the RBJ Audio EQ Cookbook.
fn biquad_highpass(sample_rate: f64, cutoff_hz: f64, q: f64) -> Biquad {
    let w0 = 2.0 * PI * (cutoff_hz / sample_rate);
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / (2.0 * q);

    let b0 = (1.0 + cos_w0) / 2.0;
    let b1 = -(1.0 + cos_w0);
    let b2 = (1.0 + cos_w0) / 2.0;
    let a0 = 1.0 + alpha;
    let a1 = -2.0 * cos_w0;
    let a2 = 1.0 - alpha;

    Biquad::new(
        (b0 / a0) as f32,
        (b1 / a0) as f32,
        (b2 / a0) as f32,
        (a1 / a0) as f32,
        (a2 / a0) as f32,
    )
}

/// 4th-order Butterworth filter implemented as two cascaded 2nd-order biquads.
#[derive(Debug, Clone, PartialEq)]
pub struct Butterworth4 {
    biquad1: Biquad,
    biquad2: Biquad,
}

impl Butterworth4 {
    /// Creates a 4th-order Butterworth low-pass filter at `cutoff_hz`.
    ///
    /// Uses pole Q values: Q1 = 1 / (2 * sin(pi/8)) ≈ 1.30656, Q2 = 1 / (2 * cos(pi/8)) ≈ 0.54120.
    #[must_use]
    pub fn lowpass(sample_rate: f64, cutoff_hz: f64) -> Self {
        let q1 = 1.0 / (2.0 * (PI / 8.0).sin());
        let q2 = 1.0 / (2.0 * (PI / 8.0).cos());
        Self {
            biquad1: biquad_lowpass(sample_rate, cutoff_hz, q1),
            biquad2: biquad_lowpass(sample_rate, cutoff_hz, q2),
        }
    }

    /// Creates a 4th-order Butterworth high-pass filter at `cutoff_hz`.
    #[must_use]
    pub fn highpass(sample_rate: f64, cutoff_hz: f64) -> Self {
        let q1 = 1.0 / (2.0 * (PI / 8.0).sin());
        let q2 = 1.0 / (2.0 * (PI / 8.0).cos());
        Self {
            biquad1: biquad_highpass(sample_rate, cutoff_hz, q1),
            biquad2: biquad_highpass(sample_rate, cutoff_hz, q2),
        }
    }

    /// Processes a single audio sample through the cascaded filter stages.
    #[inline(always)]
    pub fn process(&mut self, x: f32) -> f32 {
        let y1 = self.biquad1.process(x);
        self.biquad2.process(y1)
    }

    /// Resets the internal state memories of both cascaded stages.
    pub fn reset(&mut self) {
        self.biquad1.reset();
        self.biquad2.reset();
    }
}

/// 4th-order band-pass filter constructed as a cascaded high-pass and low-pass filter.
#[derive(Debug, Clone, PartialEq)]
pub struct Bandpass4 {
    hp: Butterworth4,
    lp: Butterworth4,
}

impl Bandpass4 {
    /// Creates a band-pass filter passing frequencies between `low_cutoff_hz` and `high_cutoff_hz`.
    #[must_use]
    pub fn new(sample_rate: f64, low_cutoff_hz: f64, high_cutoff_hz: f64) -> Self {
        Self {
            hp: Butterworth4::highpass(sample_rate, low_cutoff_hz),
            lp: Butterworth4::lowpass(sample_rate, high_cutoff_hz),
        }
    }

    /// Processes a single audio sample through the cascaded band-pass filter.
    #[inline(always)]
    pub fn process(&mut self, x: f32) -> f32 {
        let y_hp = self.hp.process(x);
        self.lp.process(y_hp)
    }

    /// Resets the internal state memories of the filter.
    pub fn reset(&mut self) {
        self.hp.reset();
        self.lp.reset();
    }
}

/// Converts a floating-point amplitude value to a normalized `u8` in `[0, 255]`.
#[inline(always)]
fn to_u8(val: f32) -> u8 {
    if val.is_finite() && val > 0.0 {
        (val * 255.0).clamp(0.0, 255.0).round() as u8
    } else {
        0
    }
}

/// Computes the 3-band overview waveform (low, mid, high frequencies) with peak and RMS.
///
/// Filters the input audio through 4th-order Butterworth filters:
/// - Low: < 150 Hz
/// - Mid: 150 - 2500 Hz
/// - High: > 2500 Hz
///
/// Downsamples each band to 150 points per second with peak and RMS values normalized to `u8`.
///
/// # Errors
/// Returns `AnalysisError::InvalidInput` if the audio buffer is empty or sample rate is invalid.
pub fn compute_waveform(buffer: &AudioBuffer) -> Result<Waveform3Band, AnalysisError> {
    if buffer.samples.is_empty() {
        return Err(AnalysisError::InvalidInput(
            "audio buffer contains no samples".to_string(),
        ));
    }
    if buffer.sample_rate == 0 {
        return Err(AnalysisError::InvalidInput(
            "sample rate must be positive".to_string(),
        ));
    }

    let sr = buffer.sample_rate as f64;
    if sr <= 2.0 * HIGH_CUTOFF_HZ {
        return Err(AnalysisError::InvalidInput(format!(
            "sample rate ({sr} Hz) must be greater than twice the high cutoff ({HIGH_CUTOFF_HZ} Hz)"
        )));
    }

    let n = buffer.samples.len();
    let num_points = ((n as f64) * (WAVEFORM_POINTS_PER_SEC as f64) / sr).ceil() as usize;
    let num_points = num_points.max(1);

    let mut low_filter = Butterworth4::lowpass(sr, LOW_CUTOFF_HZ);
    let mut mid_filter = Bandpass4::new(sr, LOW_CUTOFF_HZ, HIGH_CUTOFF_HZ);
    let mut high_filter = Butterworth4::highpass(sr, HIGH_CUTOFF_HZ);

    let mut low_peak = Vec::with_capacity(num_points);
    let mut low_rms = Vec::with_capacity(num_points);
    let mut mid_peak = Vec::with_capacity(num_points);
    let mut mid_rms = Vec::with_capacity(num_points);
    let mut high_peak = Vec::with_capacity(num_points);
    let mut high_rms = Vec::with_capacity(num_points);

    for p in 0..num_points {
        let start = ((p as f64) * sr / (WAVEFORM_POINTS_PER_SEC as f64)).round() as usize;
        let end = (((p + 1) as f64) * sr / (WAVEFORM_POINTS_PER_SEC as f64)).round() as usize;
        let start = start.min(n);
        let end = end.min(n);

        let mut lp_peak = 0.0f32;
        let mut lp_sum_sq = 0.0f64;
        let mut bp_peak = 0.0f32;
        let mut bp_sum_sq = 0.0f64;
        let mut hp_peak = 0.0f32;
        let mut hp_sum_sq = 0.0f64;
        let count = end - start;

        for i in start..end {
            let s = buffer.samples[i];
            let y_low = low_filter.process(s);
            let y_mid = mid_filter.process(s);
            let y_high = high_filter.process(s);

            let abs_low = y_low.abs();
            if abs_low > lp_peak {
                lp_peak = abs_low;
            }
            lp_sum_sq += (y_low as f64) * (y_low as f64);

            let abs_mid = y_mid.abs();
            if abs_mid > bp_peak {
                bp_peak = abs_mid;
            }
            bp_sum_sq += (y_mid as f64) * (y_mid as f64);

            let abs_high = y_high.abs();
            if abs_high > hp_peak {
                hp_peak = abs_high;
            }
            hp_sum_sq += (y_high as f64) * (y_high as f64);
        }

        if count > 0 {
            let lp_rms = (lp_sum_sq / count as f64).sqrt() as f32;
            let bp_rms = (bp_sum_sq / count as f64).sqrt() as f32;
            let hp_rms = (hp_sum_sq / count as f64).sqrt() as f32;

            low_peak.push(to_u8(lp_peak));
            low_rms.push(to_u8(lp_rms));
            mid_peak.push(to_u8(bp_peak));
            mid_rms.push(to_u8(bp_rms));
            high_peak.push(to_u8(hp_peak));
            high_rms.push(to_u8(hp_rms));
        }
    }

    Ok(Waveform3Band {
        points_per_sec: WAVEFORM_POINTS_PER_SEC,
        low: WaveformBand {
            peak: low_peak,
            rms: low_rms,
        },
        mid: WaveformBand {
            peak: mid_peak,
            rms: mid_rms,
        },
        high: WaveformBand {
            peak: high_peak,
            rms: high_rms,
        },
    })
}

/// Encodes a `Waveform3Band` into a compact byte payload for database storage.
///
/// Binary format:
/// - 4 bytes: Magic header `[b'W', b'A', b'V', 1]`
/// - 4 bytes: `points_per_sec: u32` (little-endian)
/// - 4 bytes: `num_points: u32` (little-endian)
/// - `num_points` bytes: low band peak
/// - `num_points` bytes: low band RMS
/// - `num_points` bytes: mid band peak
/// - `num_points` bytes: mid band RMS
/// - `num_points` bytes: high band peak
/// - `num_points` bytes: high band RMS
#[must_use]
pub fn encode_waveform(waveform: &Waveform3Band) -> Vec<u8> {
    let n = waveform.low.peak.len();
    let mut bytes = Vec::with_capacity(12 + 6 * n);
    bytes.extend_from_slice(&WAVEFORM_MAGIC);
    bytes.extend_from_slice(&waveform.points_per_sec.to_le_bytes());
    bytes.extend_from_slice(&(n as u32).to_le_bytes());
    bytes.extend_from_slice(&waveform.low.peak);
    bytes.extend_from_slice(&waveform.low.rms);
    bytes.extend_from_slice(&waveform.mid.peak);
    bytes.extend_from_slice(&waveform.mid.rms);
    bytes.extend_from_slice(&waveform.high.peak);
    bytes.extend_from_slice(&waveform.high.rms);
    bytes
}

/// Decodes a compact byte payload into a `Waveform3Band`.
///
/// # Errors
/// Returns `AnalysisError::InvalidInput` if payload magic or length is invalid.
pub fn decode_waveform(bytes: &[u8]) -> Result<Waveform3Band, AnalysisError> {
    if bytes.len() < 12 {
        return Err(AnalysisError::InvalidInput(
            "waveform payload too short (< 12 bytes)".to_string(),
        ));
    }
    if bytes[0..4] != WAVEFORM_MAGIC {
        return Err(AnalysisError::InvalidInput(
            "invalid waveform magic header".to_string(),
        ));
    }
    let points_per_sec = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
    let num_points = u32::from_le_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]) as usize;

    let expected_len = 12 + 6 * num_points;
    if bytes.len() != expected_len {
        return Err(AnalysisError::InvalidInput(format!(
            "waveform payload length mismatch: expected {expected_len}, got {}",
            bytes.len()
        )));
    }

    let mut offset = 12;
    let low_peak = bytes[offset..offset + num_points].to_vec();
    offset += num_points;
    let low_rms = bytes[offset..offset + num_points].to_vec();
    offset += num_points;
    let mid_peak = bytes[offset..offset + num_points].to_vec();
    offset += num_points;
    let mid_rms = bytes[offset..offset + num_points].to_vec();
    offset += num_points;
    let high_peak = bytes[offset..offset + num_points].to_vec();
    offset += num_points;
    let high_rms = bytes[offset..offset + num_points].to_vec();

    Ok(Waveform3Band {
        points_per_sec,
        low: WaveformBand {
            peak: low_peak,
            rms: low_rms,
        },
        mid: WaveformBand {
            peak: mid_peak,
            rms: mid_rms,
        },
        high: WaveformBand {
            peak: high_peak,
            rms: high_rms,
        },
    })
}

/// Encodes a single `WaveformBand` into a compact byte vector.
#[must_use]
pub fn encode_waveform_band(band: &WaveformBand) -> Vec<u8> {
    let n = band.peak.len();
    let mut bytes = Vec::with_capacity(4 + 2 * n);
    bytes.extend_from_slice(&(n as u32).to_le_bytes());
    bytes.extend_from_slice(&band.peak);
    bytes.extend_from_slice(&band.rms);
    bytes
}

/// Decodes bytes into a `WaveformBand`.
///
/// # Errors
/// Returns `AnalysisError::InvalidInput` if payload size does not match.
pub fn decode_waveform_band(bytes: &[u8]) -> Result<WaveformBand, AnalysisError> {
    if bytes.len() < 4 {
        return Err(AnalysisError::InvalidInput(
            "waveform band payload too short".to_string(),
        ));
    }
    let n = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
    let expected = 4 + 2 * n;
    if bytes.len() != expected {
        return Err(AnalysisError::InvalidInput(format!(
            "waveform band payload size mismatch: expected {expected}, got {}",
            bytes.len()
        )));
    }
    let peak = bytes[4..4 + n].to_vec();
    let rms = bytes[4 + n..4 + 2 * n].to_vec();
    Ok(WaveformBand { peak, rms })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn generate_sine(freq_hz: f64, duration_secs: f64, sample_rate: u32, amp: f32) -> AudioBuffer {
        let total_samples = (duration_secs * sample_rate as f64).round() as usize;
        let mut samples = Vec::with_capacity(total_samples);
        for i in 0..total_samples {
            let t = i as f64 / sample_rate as f64;
            let val = amp * (2.0 * PI * freq_hz * t).sin() as f32;
            samples.push(val);
        }
        AudioBuffer {
            sample_rate,
            samples,
        }
    }

    fn average_u8(slice: &[u8]) -> f64 {
        if slice.is_empty() {
            return 0.0;
        }
        // Exclude the first 5% of samples to allow initial IIR filter transient settling
        let skip = (slice.len() / 20).max(1);
        let valid = &slice[skip..];
        let sum: u64 = valid.iter().map(|&v| v as u64).sum();
        sum as f64 / valid.len() as f64
    }

    #[test]
    fn test_sine_60hz_lights_up_low_band() {
        let buffer = generate_sine(60.0, 1.5, 44100, 0.85);
        let waveform = compute_waveform(&buffer).expect("compute waveform");

        let avg_low = average_u8(&waveform.low.peak);
        let avg_mid = average_u8(&waveform.mid.peak);
        let avg_high = average_u8(&waveform.high.peak);

        assert!(
            avg_low > 180.0,
            "60 Hz low band peak average should be high (got {avg_low})"
        );
        assert!(
            avg_low > avg_mid * 5.0,
            "low band ({avg_low}) must dominate mid band ({avg_mid})"
        );
        assert!(
            avg_low > avg_high * 10.0,
            "low band ({avg_low}) must dominate high band ({avg_high})"
        );
    }

    #[test]
    fn test_sine_1000hz_lights_up_mid_band() {
        let buffer = generate_sine(1000.0, 1.5, 44100, 0.85);
        let waveform = compute_waveform(&buffer).expect("compute waveform");

        let avg_low = average_u8(&waveform.low.peak);
        let avg_mid = average_u8(&waveform.mid.peak);
        let avg_high = average_u8(&waveform.high.peak);

        assert!(
            avg_mid > 180.0,
            "1000 Hz mid band peak average should be high (got {avg_mid})"
        );
        assert!(
            avg_mid > avg_low * 5.0,
            "mid band ({avg_mid}) must dominate low band ({avg_low})"
        );
        assert!(
            avg_mid > avg_high * 5.0,
            "mid band ({avg_mid}) must dominate high band ({avg_high})"
        );
    }

    #[test]
    fn test_sine_8000hz_lights_up_high_band() {
        let buffer = generate_sine(8000.0, 1.5, 44100, 0.85);
        let waveform = compute_waveform(&buffer).expect("compute waveform");

        let avg_low = average_u8(&waveform.low.peak);
        let avg_mid = average_u8(&waveform.mid.peak);
        let avg_high = average_u8(&waveform.high.peak);

        assert!(
            avg_high > 180.0,
            "8000 Hz high band peak average should be high (got {avg_high})"
        );
        assert!(
            avg_high > avg_low * 10.0,
            "high band ({avg_high}) must dominate low band ({avg_low})"
        );
        assert!(
            avg_high > avg_mid * 5.0,
            "high band ({avg_high}) must dominate mid band ({avg_mid})"
        );
    }

    #[test]
    fn test_encode_decode_roundtrip() {
        let buffer = generate_sine(440.0, 1.0, 44100, 0.7);
        let original = compute_waveform(&buffer).expect("compute waveform");

        let encoded = encode_waveform(&original);
        assert_eq!(encoded[0..4], WAVEFORM_MAGIC);

        let decoded = decode_waveform(&encoded).expect("decode waveform");
        assert_eq!(decoded.points_per_sec, original.points_per_sec);
        assert_eq!(decoded.low, original.low);
        assert_eq!(decoded.mid, original.mid);
        assert_eq!(decoded.high, original.high);
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_encode_decode_band_roundtrip() {
        let band = WaveformBand {
            peak: vec![10, 20, 30, 40, 50],
            rms: vec![5, 12, 18, 25, 32],
        };
        let encoded = encode_waveform_band(&band);
        let decoded = decode_waveform_band(&encoded).expect("decode band");
        assert_eq!(decoded, band);
    }

    #[test]
    fn test_decode_invalid_payloads() {
        assert!(decode_waveform(&[]).is_err());
        assert!(decode_waveform(&[0; 10]).is_err());
        assert!(decode_waveform(b"BADM12345678").is_err());

        // Header valid but truncated body
        let mut truncated = vec![b'W', b'A', b'V', 1];
        truncated.extend_from_slice(&150u32.to_le_bytes());
        truncated.extend_from_slice(&10u32.to_le_bytes()); // expects 60 bytes
        truncated.extend_from_slice(&[0; 10]); // only 10 bytes
        assert!(decode_waveform(&truncated).is_err());

        assert!(decode_waveform_band(&[0; 3]).is_err());
    }

    #[test]
    fn test_empty_buffer_and_invalid_sample_rate() {
        let empty_buf = AudioBuffer {
            sample_rate: 44100,
            samples: vec![],
        };
        assert!(matches!(
            compute_waveform(&empty_buf),
            Err(AnalysisError::InvalidInput(_))
        ));

        let zero_sr_buf = AudioBuffer {
            sample_rate: 0,
            samples: vec![0.5; 100],
        };
        assert!(matches!(
            compute_waveform(&zero_sr_buf),
            Err(AnalysisError::InvalidInput(_))
        ));

        let low_sr_buf = AudioBuffer {
            sample_rate: 4000, // below 2 * 2500 Hz
            samples: vec![0.5; 100],
        };
        assert!(matches!(
            compute_waveform(&low_sr_buf),
            Err(AnalysisError::InvalidInput(_))
        ));
    }

    #[test]
    fn test_six_minute_buffer_performance() {
        let sample_rate = 44100;
        let six_minutes_samples = (6 * 60 * sample_rate) as usize; // 15,876,000 samples
        let buffer = AudioBuffer {
            sample_rate,
            samples: vec![0.2; six_minutes_samples],
        };

        let start = std::time::Instant::now();
        let waveform = compute_waveform(&buffer).expect("compute waveform for 6 min buffer");
        let elapsed = start.elapsed();

        assert_eq!(waveform.points_per_sec, 150);
        let expected_points = 6 * 60 * 150;
        assert_eq!(waveform.low.peak.len(), expected_points);
        assert_eq!(waveform.low.rms.len(), expected_points);
        assert_eq!(waveform.mid.peak.len(), expected_points);
        assert_eq!(waveform.mid.rms.len(), expected_points);
        assert_eq!(waveform.high.peak.len(), expected_points);
        assert_eq!(waveform.high.rms.len(), expected_points);

        println!("6-minute buffer waveform computation took: {:?}", elapsed);
        assert!(
            elapsed.as_secs_f64() < 2.0,
            "Rendering 6-minute buffer took {:?}, expected < 2.0s",
            elapsed
        );
    }
}
