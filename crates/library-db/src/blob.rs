//! BLOB encoding and decoding helpers for waveform bands and energy curves.

use core_types::WaveformBand;

/// Encodes a slice of `f32` numbers into a little-endian byte vector for BLOB storage.
#[must_use]
pub fn encode_f32_blob(values: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(values.len() * 4);
    for &val in values {
        bytes.extend_from_slice(&val.to_le_bytes());
    }
    bytes
}

/// Decodes a byte slice into a vector of `f32` numbers from little-endian bytes.
#[must_use]
pub fn decode_f32_blob(bytes: &[u8]) -> Vec<f32> {
    bytes
        .as_chunks::<4>()
        .0
        .iter()
        .map(|&arr| f32::from_le_bytes(arr))
        .collect()
}

/// Extracts peak and rms byte slices from a `WaveformBand`.
#[must_use]
pub fn encode_waveform_band(band: &WaveformBand) -> (&[u8], &[u8]) {
    (&band.peak, &band.rms)
}

/// Reconstructs a `WaveformBand` from peak and rms byte vectors.
#[must_use]
pub fn decode_waveform_band(peak: Vec<u8>, rms: Vec<u8>) -> WaveformBand {
    WaveformBand { peak, rms }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_f32_blob_roundtrip() {
        let original = vec![0.0_f32, 1.5, -3.25, 100.125, 0.0001];
        let blob = encode_f32_blob(&original);
        assert_eq!(blob.len(), original.len() * 4);
        let decoded = decode_f32_blob(&blob);
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_waveform_band_helpers() {
        let band = WaveformBand {
            peak: vec![10, 20, 30],
            rms: vec![5, 10, 15],
        };
        let (peak_ref, rms_ref) = encode_waveform_band(&band);
        assert_eq!(peak_ref, &[10, 20, 30]);
        assert_eq!(rms_ref, &[5, 10, 15]);

        let reconstructed = decode_waveform_band(peak_ref.to_vec(), rms_ref.to_vec());
        assert_eq!(reconstructed, band);
    }
}
