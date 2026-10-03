//! Audio decoding, resampling, loudness calculation, and metadata extraction.

use core_types::{AudioBuffer, DecodedAudio, LoudnessInfo, TrackTags};
use lofty::file::TaggedFileExt;
use lofty::probe::Probe;
use lofty::tag::Accessor;
use rubato::{FastFixedIn, PolynomialDegree, Resampler};
use std::path::Path;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use thiserror::Error;

/// Error returned when audio decoding or I/O operations fail.
#[derive(Debug, Error)]
pub enum AudioIoError {
    /// Audio file was not found.
    #[error("file not found: {0}")]
    FileNotFound(String),
    /// Audio format or codec is unsupported.
    #[error("unsupported audio format: {0}")]
    UnsupportedFormat(String),
    /// Audio decoding error.
    #[error("decode error: {0}")]
    DecodeFailed(String),
}

/// Extracts metadata tags (title, artist, album) from an audio file.
///
/// Missing or unreadable tags are returned as `None`, never resulting in an error.
#[must_use]
pub fn extract_tags<P: AsRef<Path>>(path: P) -> TrackTags {
    let probe = match Probe::open(path) {
        Ok(probe) => probe,
        Err(_) => return TrackTags::default(),
    };
    let tagged_file = match probe.read() {
        Ok(tagged_file) => tagged_file,
        Err(_) => return TrackTags::default(),
    };

    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag());
    let clean = |opt: Option<&str>| {
        opt.map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    };

    if let Some(t) = tag {
        TrackTags {
            title: clean(t.title().as_deref()),
            artist: clean(t.artist().as_deref()),
            album: clean(t.album().as_deref()),
        }
    } else {
        TrackTags::default()
    }
}

/// Resamples mono audio samples from `source_rate` to `target_rate` using rubato.
///
/// If `source_rate == target_rate`, returns a copy of the input.
///
/// # Errors
/// Returns `AudioIoError::DecodeFailed` if either sample rate is 0 or resampling fails.
pub fn resample_mono(
    samples: &[f32],
    source_rate: u32,
    target_rate: u32,
) -> Result<Vec<f32>, AudioIoError> {
    if source_rate == 0 || target_rate == 0 {
        return Err(AudioIoError::DecodeFailed(
            "invalid sample rate (0 Hz)".into(),
        ));
    }
    if source_rate == target_rate || samples.is_empty() {
        return Ok(samples.to_vec());
    }

    let ratio = target_rate as f64 / source_rate as f64;
    let chunk_size = 1024;
    let mut resampler =
        FastFixedIn::<f32>::new(ratio, 1.0, PolynomialDegree::Septic, chunk_size, 1).map_err(
            |e| AudioIoError::DecodeFailed(format!("failed to initialize resampler: {e}")),
        )?;

    let expected_len = (samples.len() as f64 * ratio) as usize;
    let mut output = Vec::with_capacity(expected_len + 2048);

    let mut offset = 0;
    while offset + chunk_size <= samples.len() {
        let chunk = &[&samples[offset..offset + chunk_size]];
        let out = resampler
            .process(chunk, None)
            .map_err(|e| AudioIoError::DecodeFailed(format!("resampling error: {e}")))?;
        output.extend_from_slice(&out[0]);
        offset += chunk_size;
    }

    if offset < samples.len() {
        let remaining = &[&samples[offset..]];
        let out = resampler
            .process_partial(Some(remaining), None)
            .map_err(|e| AudioIoError::DecodeFailed(format!("resampling error: {e}")))?;
        let valid_frames = ((remaining[0].len() as f64 * ratio).round() as usize).min(out[0].len());
        output.extend_from_slice(&out[0][..valid_frames]);
    }

    Ok(output)
}

/// Decodes an audio file from `path`, downmixes to mono, resamples to 44100 Hz,
/// computes EBU R128 loudness metrics, and extracts container metadata tags.
///
/// Supports MP3, FLAC, WAV, AIFF, AAC, M4A, and OGG formats with 16, 24, and 32-bit samples.
///
/// # Errors
/// Returns `AudioIoError::FileNotFound` if the file does not exist.
/// Returns `AudioIoError::UnsupportedFormat` if the container format or codec is unrecognized.
/// Returns `AudioIoError::DecodeFailed` if decoding or audio processing fails.
pub fn decode_file<P: AsRef<Path>>(path: P) -> Result<DecodedAudio, AudioIoError> {
    let path = path.as_ref();
    if !path.exists() {
        return Err(AudioIoError::FileNotFound(path.display().to_string()));
    }

    let file = std::fs::File::open(path).map_err(|e| {
        AudioIoError::DecodeFailed(format!("failed to open file {}: {e}", path.display()))
    })?;

    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let format_opts = FormatOptions {
        enable_gapless: true,
        ..Default::default()
    };
    let meta_opts = MetadataOptions::default();

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &format_opts, &meta_opts)
        .map_err(|e| {
            AudioIoError::UnsupportedFormat(format!(
                "unsupported format for {}: {e}",
                path.display()
            ))
        })?;

    let mut format = probed.format;

    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| AudioIoError::UnsupportedFormat("no audio track found in file".into()))?;

    let track_id = track.id;
    let codec_params = track.codec_params.clone();

    let mut decoder = symphonia::default::get_codecs()
        .make(&codec_params, &DecoderOptions::default())
        .map_err(|e| AudioIoError::UnsupportedFormat(format!("unsupported codec: {e}")))?;

    let mut source_sample_rate = codec_params.sample_rate.unwrap_or(0);
    let mut num_channels = codec_params.channels.map_or(0, |c| c.count());

    let mut eb: Option<ebur128::EbuR128> = None;
    let mut sample_buf: Option<SampleBuffer<f32>> = None;
    let mut mono_samples: Vec<f32> = Vec::new();
    let mut total_source_frames: u64 = 0;
    let mut stereo_chunk: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(SymphoniaError::IoError(ref err))
                if err.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(SymphoniaError::ResetRequired) => {
                continue;
            }
            Err(SymphoniaError::IoError(err)) => {
                if total_source_frames > 0 {
                    break;
                }
                return Err(AudioIoError::DecodeFailed(format!(
                    "I/O error reading packet: {err}"
                )));
            }
            Err(err) => {
                if total_source_frames > 0 {
                    break;
                }
                return Err(AudioIoError::DecodeFailed(format!(
                    "packet decode error: {err}"
                )));
            }
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(SymphoniaError::DecodeError(_)) => {
                continue;
            }
            Err(SymphoniaError::ResetRequired) => {
                decoder.reset();
                continue;
            }
            Err(err) => {
                if total_source_frames > 0 {
                    break;
                }
                return Err(AudioIoError::DecodeFailed(format!(
                    "frame decode error: {err}"
                )));
            }
        };

        let spec = *decoded.spec();
        if source_sample_rate == 0 {
            source_sample_rate = spec.rate;
        }
        if num_channels == 0 {
            num_channels = spec.channels.count();
        }

        if eb.is_none() {
            let mode = ebur128::Mode::I | ebur128::Mode::LRA | ebur128::Mode::TRUE_PEAK;
            let eb_inst = ebur128::EbuR128::new(2, source_sample_rate, mode).map_err(|e| {
                AudioIoError::DecodeFailed(format!("failed to initialize ebur128: {e:?}"))
            })?;
            eb = Some(eb_inst);
        }

        let decoded_frames = decoded.frames();
        if decoded_frames == 0 {
            continue;
        }

        let needed_cap = decoded.capacity() as u64;
        let buf = match &mut sample_buf {
            Some(b) if b.capacity() as u64 >= needed_cap => b,
            _ => {
                sample_buf = Some(SampleBuffer::<f32>::new(needed_cap, spec));
                if let Some(ref mut b) = sample_buf {
                    b
                } else {
                    return Err(AudioIoError::DecodeFailed(
                        "failed to allocate sample buffer".into(),
                    ));
                }
            }
        };

        buf.copy_interleaved_ref(decoded);
        let samples = buf.samples();
        let ch = spec.channels.count();
        if ch == 0 {
            continue;
        }

        total_source_frames += decoded_frames as u64;

        stereo_chunk.clear();
        stereo_chunk.reserve(decoded_frames * 2);
        mono_samples.reserve(decoded_frames);

        match ch {
            1 => {
                for &s in samples {
                    stereo_chunk.push(s);
                    stereo_chunk.push(s);
                    mono_samples.push(s);
                }
            }
            2 => {
                for frame_idx in 0..decoded_frames {
                    let left = samples[2 * frame_idx];
                    let right = samples[2 * frame_idx + 1];
                    stereo_chunk.push(left);
                    stereo_chunk.push(right);
                    mono_samples.push(0.5 * (left + right));
                }
            }
            _ => {
                for frame_idx in 0..decoded_frames {
                    let frame_start = frame_idx * ch;
                    let left = samples[frame_start];
                    let right = samples[frame_start + 1];
                    stereo_chunk.push(left);
                    stereo_chunk.push(right);

                    let frame = &samples[frame_start..frame_start + ch];
                    let sum: f32 = frame.iter().copied().sum();
                    mono_samples.push(sum / ch as f32);
                }
            }
        }

        if let Some(ref mut eb_inst) = eb {
            eb_inst.add_frames_f32(&stereo_chunk).map_err(|e| {
                AudioIoError::DecodeFailed(format!("ebur128 add_frames error: {e:?}"))
            })?;
        }
    }

    if total_source_frames == 0 || mono_samples.is_empty() {
        return Err(AudioIoError::DecodeFailed(
            "file contains no decodable audio frames".into(),
        ));
    }

    if source_sample_rate == 0 {
        return Err(AudioIoError::DecodeFailed(
            "unknown audio sample rate".into(),
        ));
    }

    let loudness = if let Some(eb_inst) = eb {
        let integrated = match eb_inst.loudness_global() {
            Ok(v) if v.is_nan() => -70.0,
            Ok(v) => v as f32,
            Err(_) => -70.0,
        };
        let lra = match eb_inst.loudness_range() {
            Ok(v) if v.is_nan() => 0.0,
            Ok(v) => v as f32,
            Err(_) => 0.0,
        };
        let tp_0 = eb_inst.true_peak(0).unwrap_or(0.0);
        let tp_1 = eb_inst.true_peak(1).unwrap_or(0.0);
        let max_tp = tp_0.max(tp_1);
        let true_peak = if max_tp > 0.0 {
            (20.0 * max_tp.log10()) as f32
        } else {
            f32::NEG_INFINITY
        };
        LoudnessInfo {
            integrated_lufs: integrated,
            loudness_range: lra,
            true_peak,
        }
    } else {
        LoudnessInfo {
            integrated_lufs: -70.0,
            loudness_range: 0.0,
            true_peak: f32::NEG_INFINITY,
        }
    };

    let duration_ms = (total_source_frames as f64 / source_sample_rate as f64) * 1000.0;
    let resampled = resample_mono(&mono_samples, source_sample_rate, 44100)?;

    let buffer = AudioBuffer {
        sample_rate: 44100,
        samples: resampled,
    };

    let tags = extract_tags(path);

    Ok(DecodedAudio {
        buffer,
        loudness,
        tags,
        duration_ms,
        source_sample_rate,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use hound::{SampleFormat, WavSpec, WavWriter};
    use std::f32::consts::PI;

    struct TempFile(std::path::PathBuf);
    impl Drop for TempFile {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    fn temp_wav_path(name: &str) -> (TempFile, std::path::PathBuf) {
        let mut path = std::env::temp_dir();
        let unique = format!(
            "audio_io_{}_{}_{}.wav",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        path.push(unique);
        (TempFile(path.clone()), path)
    }

    #[test]
    fn test_file_not_found() {
        let result = decode_file("non_existent_file_xyz_12345.wav");
        assert!(matches!(result, Err(AudioIoError::FileNotFound(_))));
    }

    #[test]
    fn test_corrupt_file() {
        let (_guard, path) = temp_wav_path("corrupt");
        std::fs::write(&path, b"not a valid audio file content").unwrap();
        let result = decode_file(&path);
        assert!(result.is_err());
        assert!(!matches!(result, Err(AudioIoError::FileNotFound(_))));
    }

    #[test]
    fn test_decode_stereo_16bit_44100_sine_lufs() {
        let (_guard, path) = temp_wav_path("stereo_16_44100");
        let sample_rate = 44100;
        let duration_secs = 2.0;
        let num_frames = (sample_rate as f32 * duration_secs) as usize;

        let spec = WavSpec {
            channels: 2,
            sample_rate,
            bits_per_sample: 16,
            sample_format: SampleFormat::Int,
        };
        let mut writer = WavWriter::create(&path, spec).unwrap();

        // 1 kHz sine wave with peak amplitude 0.5 (-6.02 dBFS, expected LUFS ~ -6.0)
        let peak_amp = 0.5f32;
        let freq = 1000.0f32;
        for i in 0..num_frames {
            let t = i as f32 / sample_rate as f32;
            let val = peak_amp * (2.0 * PI * freq * t).sin();
            let sample_i16 = (val * i16::MAX as f32) as i16;
            writer.write_sample(sample_i16).unwrap(); // left
            writer.write_sample(sample_i16).unwrap(); // right
        }
        writer.finalize().unwrap();

        let decoded = decode_file(&path).unwrap();
        assert_eq!(decoded.source_sample_rate, 44100);
        assert_eq!(decoded.buffer.sample_rate, 44100);
        assert!((decoded.duration_ms - 2000.0).abs() < 1.0);
        assert_eq!(decoded.buffer.samples.len(), num_frames);

        // Expected LUFS: 20 * log10(0.5) = -6.02 LUFS
        let expected_lufs = -6.02;
        assert!(
            (decoded.loudness.integrated_lufs - expected_lufs).abs() < 0.5,
            "Integrated LUFS {} should be within 0.5 of {}",
            decoded.loudness.integrated_lufs,
            expected_lufs
        );

        // True peak: 20 * log10(0.5) = -6.02 dBTP
        assert!((decoded.loudness.true_peak - (-6.02)).abs() < 0.5);
    }

    #[test]
    fn test_decode_mono_24bit_48000() {
        let (_guard, path) = temp_wav_path("mono_24_48000");
        let sample_rate = 48000;
        let duration_secs = 1.5;
        let num_frames = (sample_rate as f32 * duration_secs) as usize;

        let spec = WavSpec {
            channels: 1,
            sample_rate,
            bits_per_sample: 24,
            sample_format: SampleFormat::Int,
        };
        let mut writer = WavWriter::create(&path, spec).unwrap();

        let peak_amp = 0.707f32;
        let freq = 440.0f32;
        for i in 0..num_frames {
            let t = i as f32 / sample_rate as f32;
            let val = peak_amp * (2.0 * PI * freq * t).sin();
            let sample_i32 = (val * 8_388_607.0) as i32;
            writer.write_sample(sample_i32).unwrap();
        }
        writer.finalize().unwrap();

        let decoded = decode_file(&path).unwrap();
        assert_eq!(decoded.source_sample_rate, 48000);
        assert_eq!(decoded.buffer.sample_rate, 44100);
        assert!((decoded.duration_ms - 1500.0).abs() < 1.0);

        // Expected resampled frame count ~ 1.5 * 44100 = 66150
        let expected_resampled = (1.5 * 44100.0) as usize;
        let diff = (decoded.buffer.samples.len() as isize - expected_resampled as isize).abs();
        assert!(
            diff < 50,
            "Resampled length {} should be close to {}",
            decoded.buffer.samples.len(),
            expected_resampled
        );
    }

    #[test]
    fn test_decode_stereo_24bit_48000() {
        let (_guard, path) = temp_wav_path("stereo_24_48000");
        let sample_rate = 48000;
        let duration_secs = 2.0;
        let num_frames = (sample_rate as f32 * duration_secs) as usize;

        let spec = WavSpec {
            channels: 2,
            sample_rate,
            bits_per_sample: 24,
            sample_format: SampleFormat::Int,
        };
        let mut writer = WavWriter::create(&path, spec).unwrap();

        let peak_amp = 0.25f32;
        let freq = 1000.0f32;
        for i in 0..num_frames {
            let t = i as f32 / sample_rate as f32;
            let val = peak_amp * (2.0 * PI * freq * t).sin();
            let sample_i32 = (val * 8_388_607.0) as i32;
            writer.write_sample(sample_i32).unwrap();
            writer.write_sample(sample_i32).unwrap();
        }
        writer.finalize().unwrap();

        let decoded = decode_file(&path).unwrap();
        assert_eq!(decoded.source_sample_rate, 48000);
        assert_eq!(decoded.buffer.sample_rate, 44100);
        assert!((decoded.duration_ms - 2000.0).abs() < 1.0);

        // 20 * log10(0.25) = -12.04 LUFS
        let expected_lufs = -12.04;
        assert!(
            (decoded.loudness.integrated_lufs - expected_lufs).abs() < 0.5,
            "Integrated LUFS {} should be within 0.5 of {}",
            decoded.loudness.integrated_lufs,
            expected_lufs
        );
    }

    #[test]
    fn test_decode_32bit_float() {
        let (_guard, path) = temp_wav_path("float_32_44100");
        let sample_rate = 44100;
        let duration_secs = 1.0;
        let num_frames = (sample_rate as f32 * duration_secs) as usize;

        let spec = WavSpec {
            channels: 2,
            sample_rate,
            bits_per_sample: 32,
            sample_format: SampleFormat::Float,
        };
        let mut writer = WavWriter::create(&path, spec).unwrap();

        for i in 0..num_frames {
            let t = i as f32 / sample_rate as f32;
            let val = 0.1 * (2.0 * PI * 500.0 * t).sin();
            writer.write_sample(val).unwrap();
            writer.write_sample(val).unwrap();
        }
        writer.finalize().unwrap();

        let decoded = decode_file(&path).unwrap();
        assert_eq!(decoded.source_sample_rate, 44100);
        assert_eq!(decoded.buffer.sample_rate, 44100);
        assert_eq!(decoded.buffer.samples.len(), num_frames);
        assert!((decoded.duration_ms - 1000.0).abs() < 1.0);
    }

    #[test]
    fn test_extract_tags_missing_is_none() {
        let (_guard, path) = temp_wav_path("notags");
        let spec = WavSpec {
            channels: 1,
            sample_rate: 44100,
            bits_per_sample: 16,
            sample_format: SampleFormat::Int,
        };
        let mut writer = WavWriter::create(&path, spec).unwrap();
        writer.write_sample(0i16).unwrap();
        writer.finalize().unwrap();

        let tags = extract_tags(&path);
        assert_eq!(tags.title, None);
        assert_eq!(tags.artist, None);
        assert_eq!(tags.album, None);
    }

    #[test]
    fn test_extract_tags_present() {
        use lofty::tag::{Tag, TagType};
        let (_guard, path) = temp_wav_path("withtags");
        let spec = WavSpec {
            channels: 2,
            sample_rate: 44100,
            bits_per_sample: 16,
            sample_format: SampleFormat::Int,
        };
        let mut writer = WavWriter::create(&path, spec).unwrap();
        for _ in 0..1000 {
            writer.write_sample(0i16).unwrap();
            writer.write_sample(0i16).unwrap();
        }
        writer.finalize().unwrap();

        use lofty::tag::TagExt;
        let mut tag = Tag::new(TagType::Id3v2);
        tag.set_title("Resonance".into());
        tag.set_artist("HOME".into());
        tag.set_album("Odyssey".into());
        tag.save_to_path(&path, lofty::config::WriteOptions::default())
            .unwrap();

        let tags = extract_tags(&path);
        assert_eq!(tags.title.as_deref(), Some("Resonance"));
        assert_eq!(tags.artist.as_deref(), Some("HOME"));
        assert_eq!(tags.album.as_deref(), Some("Odyssey"));
    }

    #[test]
    fn test_decode_32bit_int() {
        let (_guard, path) = temp_wav_path("int_32_44100");
        let sample_rate = 44100;
        let duration_secs = 0.5;
        let num_frames = (sample_rate as f32 * duration_secs) as usize;

        let spec = WavSpec {
            channels: 1,
            sample_rate,
            bits_per_sample: 32,
            sample_format: SampleFormat::Int,
        };
        let mut writer = WavWriter::create(&path, spec).unwrap();

        for i in 0..num_frames {
            let t = i as f32 / sample_rate as f32;
            let val = 0.5 * (2.0 * PI * 1000.0 * t).sin();
            let sample_i32 = (val * i32::MAX as f32) as i32;
            writer.write_sample(sample_i32).unwrap();
        }
        writer.finalize().unwrap();

        let decoded = decode_file(&path).unwrap();
        assert_eq!(decoded.source_sample_rate, 44100);
        assert_eq!(decoded.buffer.sample_rate, 44100);
        assert_eq!(decoded.buffer.samples.len(), num_frames);
        assert!((decoded.duration_ms - 500.0).abs() < 1.0);
    }

    #[test]
    fn test_resample_mono_direct_cases() {
        let original = vec![0.1f32, 0.2, 0.3, 0.4, 0.5];
        // Same rate returns copy
        let same = resample_mono(&original, 44100, 44100).unwrap();
        assert_eq!(same, original);

        // Empty returns empty
        let empty = resample_mono(&[], 48000, 44100).unwrap();
        assert!(empty.is_empty());

        // Zero rate returns error
        assert!(resample_mono(&original, 0, 44100).is_err());
        assert!(resample_mono(&original, 44100, 0).is_err());

        // Upsampling from 22050 to 44100
        let in_samples = vec![0.5f32; 22050];
        let upsampled = resample_mono(&in_samples, 22050, 44100).unwrap();
        assert!((upsampled.len() as isize - 44100).abs() < 50);
    }

    #[test]
    fn test_empty_audio_file() {
        let (_guard, path) = temp_wav_path("empty");
        std::fs::File::create(&path).unwrap();
        let result = decode_file(&path);
        assert!(result.is_err());
    }

    #[test]
    fn test_silence_lufs() {
        let (_guard, path) = temp_wav_path("silence");
        let spec = WavSpec {
            channels: 2,
            sample_rate: 44100,
            bits_per_sample: 16,
            sample_format: SampleFormat::Int,
        };
        let mut writer = WavWriter::create(&path, spec).unwrap();
        for _ in 0..44100 {
            writer.write_sample(0i16).unwrap();
            writer.write_sample(0i16).unwrap();
        }
        writer.finalize().unwrap();

        let decoded = decode_file(&path).unwrap();
        assert!(
            decoded.loudness.integrated_lufs <= -70.0
                || decoded.loudness.integrated_lufs.is_infinite()
        );
        assert!(decoded.loudness.true_peak <= -70.0 || decoded.loudness.true_peak.is_infinite());
    }
}
