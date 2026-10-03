//! Beat click synthesizer for auditory grid and cue verification.

use rodio::source::SeekError;
use rodio::Source;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// Click sound duration in milliseconds.
const CLICK_DURATION_MS: f64 = 15.0;

/// Audio source producing short synthetic clicks on each detected beat timestamp.
pub struct ClickTrackSource {
    beats_ms: Vec<f64>,
    downbeat_flags: Vec<bool>,
    sample_rate: u32,
    channels: u16,
    total_frames: usize,
    current_frame: usize,
    channel_idx: u16,
    current_sample_val: f32,
    enabled: Arc<AtomicBool>,
}

impl ClickTrackSource {
    /// Creates a new click track source aligned with the given beat timestamps.
    #[must_use]
    pub fn new(
        beats_ms: Vec<f64>,
        downbeat_flags: Vec<bool>,
        sample_rate: u32,
        channels: u16,
        total_frames: usize,
        enabled: Arc<AtomicBool>,
    ) -> Self {
        Self {
            beats_ms,
            downbeat_flags,
            sample_rate,
            channels: channels.max(1),
            total_frames,
            current_frame: 0,
            channel_idx: 0,
            current_sample_val: 0.0,
            enabled,
        }
    }

    /// Computes the mono audio click sample for the specified frame.
    fn compute_frame_sample(&self, frame: usize) -> f32 {
        if !self.enabled.load(Ordering::Relaxed) || self.beats_ms.is_empty() {
            return 0.0;
        }

        let time_ms = (frame as f64 / self.sample_rate as f64) * 1000.0;

        // Binary search for nearest prior beat
        let partition = self.beats_ms.partition_point(|&b| b <= time_ms);
        if partition == 0 {
            return 0.0;
        }

        let beat_idx = partition - 1;
        let beat_time = self.beats_ms[beat_idx];
        let dt_ms = time_ms - beat_time;

        if (0.0..CLICK_DURATION_MS).contains(&dt_ms) {
            let is_downbeat = *self.downbeat_flags.get(beat_idx).unwrap_or(&false);
            let freq = if is_downbeat { 1760.0 } else { 880.0 };
            let amp = if is_downbeat { 0.45 } else { 0.30 };
            let t_sec = dt_ms / 1000.0;
            let decay = (-t_sec * 350.0).exp() as f32;
            let phase = (2.0 * std::f64::consts::PI * freq * t_sec).sin() as f32;
            amp * phase * decay
        } else {
            0.0
        }
    }
}

impl Iterator for ClickTrackSource {
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        if self.current_frame >= self.total_frames {
            return None;
        }

        if self.channel_idx == 0 {
            self.current_sample_val = self.compute_frame_sample(self.current_frame);
        }

        let val = self.current_sample_val;
        self.channel_idx += 1;
        if self.channel_idx >= self.channels {
            self.channel_idx = 0;
            self.current_frame += 1;
        }

        Some(val)
    }
}

impl Source for ClickTrackSource {
    fn current_frame_len(&self) -> Option<usize> {
        Some(self.total_frames.saturating_sub(self.current_frame))
    }

    fn channels(&self) -> u16 {
        self.channels
    }

    fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    fn total_duration(&self) -> Option<Duration> {
        Some(Duration::from_secs_f64(
            self.total_frames as f64 / self.sample_rate as f64,
        ))
    }

    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        let target_frame = (pos.as_secs_f64() * self.sample_rate as f64).round() as usize;
        self.current_frame = target_frame.min(self.total_frames);
        self.channel_idx = 0;
        self.current_sample_val = 0.0;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_click_track_synthesis_and_toggling() {
        let beats = vec![0.0, 500.0, 1000.0];
        let downbeats = vec![true, false, false];
        let enabled = Arc::new(AtomicBool::new(true));

        let mut source = ClickTrackSource::new(
            beats,
            downbeats,
            44100,
            2,
            44100 * 2, // 2 seconds
            enabled.clone(),
        );

        // Frame 0 (time 0 ms) should have an audible sample since it's at beat 0.0
        // Wait, at dt = 0, sin(0) = 0.0. But at t > 0 (subsequent samples in the click window):
        let samples: Vec<f32> = (0..200).filter_map(|_| source.next()).collect();
        let max_amp = samples.iter().copied().fold(0.0f32, f32::max);
        assert!(
            max_amp > 0.1,
            "expected click sound wave at beat 0, got max {max_amp}"
        );

        // Now disable click track and verify silence
        enabled.store(false, Ordering::SeqCst);
        let silent_sample = source.compute_frame_sample(source.current_frame);
        assert_eq!(silent_sample, 0.0);

        // Seek to 500 ms (frame 22050) and re-enable
        enabled.store(true, Ordering::SeqCst);
        source
            .try_seek(Duration::from_millis(500))
            .expect("seek succeeds");
        let samples_500: Vec<f32> = (0..200).filter_map(|_| source.next()).collect();
        let max_amp_500 = samples_500.iter().copied().fold(0.0f32, f32::max);
        assert!(
            max_amp_500 > 0.05,
            "expected click sound wave at beat 500ms"
        );
    }
}
