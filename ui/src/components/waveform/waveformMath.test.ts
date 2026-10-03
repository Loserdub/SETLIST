import { describe, it, expect } from 'vitest';
import {
  timeToPixel,
  pixelToTime,
  clampViewport,
  getVisibleWindow,
  sliceWaveformWindow,
  filterVisibleBeats,
  filterVisibleSegments,
  filterVisibleCues,
  formatTimeMs,
} from './waveformMath';
import type { Waveform3Band } from '../../bindings/Waveform3Band';
import type { Segment } from '../../bindings/Segment';
import type { CuePoint } from '../../bindings/CuePoint';

describe('waveformMath: time and pixel coordinate transformations', () => {
  it('maps time to pixel correctly at start, middle, and end', () => {
    const startTimeMs = 10_000;
    const visibleDurationMs = 20_000;
    const canvasWidth = 1000;

    // Start of window -> 0 px
    expect(timeToPixel(10_000, startTimeMs, visibleDurationMs, canvasWidth)).toBe(0);
    // Middle of window -> 500 px
    expect(timeToPixel(20_000, startTimeMs, visibleDurationMs, canvasWidth)).toBe(500);
    // End of window -> 1000 px
    expect(timeToPixel(30_000, startTimeMs, visibleDurationMs, canvasWidth)).toBe(1000);
    // Halfway before window -> -250 px
    expect(timeToPixel(5_000, startTimeMs, visibleDurationMs, canvasWidth)).toBe(-250);
  });

  it('handles degenerate zero duration and zero width safely', () => {
    expect(timeToPixel(10_000, 0, 0, 1000)).toBe(0);
    expect(timeToPixel(10_000, 0, 20_000, 0)).toBe(0);
    expect(pixelToTime(500, 10_000, 20_000, 0)).toBe(10_000);
  });

  it('round-trips time -> pixel -> time accurately', () => {
    const startTimeMs = 45_230;
    const visibleDurationMs = 15_000;
    const canvasWidth = 1280;

    const testTimes = [45_230, 48_000, 52_750, 60_230];
    for (const time of testTimes) {
      const px = timeToPixel(time, startTimeMs, visibleDurationMs, canvasWidth);
      const recoveredTime = pixelToTime(px, startTimeMs, visibleDurationMs, canvasWidth);
      expect(recoveredTime).toBeCloseTo(time, 4);
    }
  });
});

describe('waveformMath: viewport clamping and visible window calculation', () => {
  const totalDurationMs = 180_000; // 3 minutes

  it('clamps viewport offset within bounds', () => {
    const visibleDurationMs = 30_000; // 30 seconds visible

    // Negative offset clamps to 0
    expect(clampViewport(-5_000, visibleDurationMs, totalDurationMs)).toBe(0);

    // Valid offset remains unchanged
    expect(clampViewport(60_000, visibleDurationMs, totalDurationMs)).toBe(60_000);

    // Offset too close to or beyond end clamps to total - visible
    expect(clampViewport(170_000, visibleDurationMs, totalDurationMs)).toBe(150_000);
    expect(clampViewport(200_000, visibleDurationMs, totalDurationMs)).toBe(150_000);
  });

  it('clamps to 0 when visible duration exceeds or equals total duration', () => {
    expect(clampViewport(50_000, 200_000, totalDurationMs)).toBe(0);
    expect(clampViewport(0, 180_000, totalDurationMs)).toBe(0);
  });

  it('computes visible window across zoom levels', () => {
    // 1x Zoom: full track visible
    const w1 = getVisibleWindow(totalDurationMs, 1.0, 0);
    expect(w1.startTimeMs).toBe(0);
    expect(w1.visibleDurationMs).toBe(180_000);
    expect(w1.endTimeMs).toBe(180_000);

    // 2x Zoom: half track visible (90s)
    const w2 = getVisibleWindow(totalDurationMs, 2.0, 30_000);
    expect(w2.startTimeMs).toBe(30_000);
    expect(w2.visibleDurationMs).toBe(90_000);
    expect(w2.endTimeMs).toBe(120_000);

    // 4x Zoom with overshoot: clamped at end
    const w4 = getVisibleWindow(totalDurationMs, 4.0, 160_000);
    expect(w4.visibleDurationMs).toBe(45_000);
    expect(w4.startTimeMs).toBe(135_000);
    expect(w4.endTimeMs).toBe(180_000);
  });
});

describe('waveformMath: visible window waveform slicing', () => {
  const pointsPerSec = 150;
  const durationSec = 10;
  const durationMs = durationSec * 1000;
  const totalPoints = pointsPerSec * durationSec; // 1500 points

  const mockWaveform: Waveform3Band = {
    points_per_sec: pointsPerSec,
    low: { peak: new Array(totalPoints).fill(100), rms: new Array(totalPoints).fill(50) },
    mid: { peak: new Array(totalPoints).fill(80), rms: new Array(totalPoints).fill(40) },
    high: { peak: new Array(totalPoints).fill(60), rms: new Array(totalPoints).fill(30) },
  };

  it('slices full window at 1x zoom with boundary buffer', () => {
    const slice = sliceWaveformWindow(mockWaveform, 0, durationMs, durationMs);
    expect(slice.startIndex).toBe(0);
    expect(slice.endIndex).toBe(totalPoints);
    expect(slice.pointCount).toBe(totalPoints);
  });

  it('slices sub-window accurately at fixed points_per_sec', () => {
    // 2.0s to 5.0s -> index ~300 to ~750 (with 1 buffer point)
    const slice = sliceWaveformWindow(mockWaveform, 2000, 5000, durationMs);
    expect(slice.startIndex).toBe(299); // 300 - 1 buffer point
    expect(slice.endIndex).toBe(751); // 750 + 1 buffer point
    expect(slice.pointCount).toBe(452);
  });

  it('handles condensed/proportional mock waveform array lengths', () => {
    const condensedWaveform: Waveform3Band = {
      points_per_sec: 10,
      low: { peak: new Array(100).fill(50), rms: new Array(100).fill(25) },
      mid: { peak: new Array(100).fill(50), rms: new Array(100).fill(25) },
      high: { peak: new Array(100).fill(50), rms: new Array(100).fill(25) },
    };
    const longDurationMs = 200_000; // 200s, 100 points -> 2s per point

    // Slicing 50s to 100s (25% to 50%) -> indices ~25 to ~50
    const slice = sliceWaveformWindow(condensedWaveform, 50_000, 100_000, longDurationMs);
    expect(slice.startIndex).toBe(24);
    expect(slice.endIndex).toBe(51);
    expect(slice.pointCount).toBe(27);
  });

  it('handles empty waveform safely', () => {
    const emptyWaveform: Waveform3Band = {
      points_per_sec: 150,
      low: { peak: [], rms: [] },
      mid: { peak: [], rms: [] },
      high: { peak: [], rms: [] },
    };
    const slice = sliceWaveformWindow(emptyWaveform, 0, 10_000, 10_000);
    expect(slice.startIndex).toBe(0);
    expect(slice.endIndex).toBe(0);
    expect(slice.pointCount).toBe(0);
  });
});

describe('waveformMath: beat, segment, and cue filtering', () => {
  it('filters visible beats and attaches downbeat flag and pixel coordinates', () => {
    const beatsMs = [0, 500, 1000, 1500, 2000, 2500, 3000];
    const downbeatFlags = [true, false, false, false, true, false, false];

    // Window: 800ms to 2200ms
    const visible = filterVisibleBeats(beatsMs, downbeatFlags, 800, 2200, 1000, 100);

    // Expected beats in [700, 2300]: 1000, 1500, 2000
    expect(visible.map((b) => b.beatMs)).toEqual([1000, 1500, 2000]);
    expect(visible[0].isDownbeat).toBe(false);
    expect(visible[1].isDownbeat).toBe(false);
    expect(visible[2].isDownbeat).toBe(true);

    // Pixel X for 1000ms in [800..2200] (duration 1400): (200 / 1400) * 1000 = ~142.85
    expect(visible[0].pixelX).toBeCloseTo(142.857, 1);
  });

  it('filters visible structural segments correctly', () => {
    const segments: Segment[] = [
      { label: 'intro', start_ms: 0, end_ms: 30_000, energy: 3 },
      { label: 'verse', start_ms: 30_000, end_ms: 70_000, energy: 5 },
      { label: 'drop', start_ms: 70_000, end_ms: 120_000, energy: 9 },
      { label: 'outro', start_ms: 120_000, end_ms: 160_000, energy: 2 },
    ];

    // Window: 25_000 to 75_000
    // Overlaps intro (ends 30k), verse (30k-70k), drop (starts 70k)
    const visible = filterVisibleSegments(segments, 25_000, 75_000);
    expect(visible.map((s) => s.label)).toEqual(['intro', 'verse', 'drop']);

    // Window: 130_000 to 150_000 -> only outro
    const outroOnly = filterVisibleSegments(segments, 130_000, 150_000);
    expect(outroOnly.map((s) => s.label)).toEqual(['outro']);
  });

  it('filters visible cue points and loop spans', () => {
    const cues: CuePoint[] = [
      { index: 0, time_ms: 500, label: 'Downbeat', color_hex: '#FF5500', kind: 'HotCue', loop_end_ms: null },
      { index: 1, time_ms: 15_000, label: 'Intro End', color_hex: '#00FF00', kind: 'HotCue', loop_end_ms: null },
      { index: 2, time_ms: 40_000, label: 'Loop', color_hex: '#00FFFF', kind: 'Loop', loop_end_ms: 60_000 },
      { index: 3, time_ms: 120_000, label: 'Outro', color_hex: '#FFFFFF', kind: 'HotCue', loop_end_ms: null },
    ];

    // Window around 15_000
    const cuesAround15k = filterVisibleCues(cues, 14_000, 16_000);
    expect(cuesAround15k.map((c) => c.index)).toEqual([1]);

    // Window intersecting loop region [40k..60k] even if cue starts earlier
    const cuesInLoop = filterVisibleCues(cues, 50_000, 55_000);
    expect(cuesInLoop.map((c) => c.index)).toEqual([2]);
  });
});

describe('waveformMath: DJ time format helper', () => {
  it('formats various millisecond inputs to mm:ss.ms', () => {
    expect(formatTimeMs(0)).toBe('0:00.0');
    expect(formatTimeMs(500)).toBe('0:00.5');
    expect(formatTimeMs(65_400)).toBe('1:05.4');
    expect(formatTimeMs(128_950)).toBe('2:08.9');
    expect(formatTimeMs(-10)).toBe('0:00.0');
    expect(formatTimeMs(NaN)).toBe('0:00.0');
  });
});
