import { describe, it, expect } from 'vitest';
import {
  calculateBarSeek,
  interpolatePosition,
  handleTrackKeyDown,
} from './playbackMath';
import { timeToPixel, pixelToTime } from '../../components/waveform/waveformMath';
import type { BeatGrid } from '../../bindings/BeatGrid';

describe('Time to Pixel Coordinate Math', () => {
  it('maps timestamps to horizontal pixel coordinates accurately', () => {
    const startTimeMs = 10_000;
    const visibleDurationMs = 20_000;
    const canvasWidth = 1000;

    expect(timeToPixel(10_000, startTimeMs, visibleDurationMs, canvasWidth)).toBe(0);
    expect(timeToPixel(20_000, startTimeMs, visibleDurationMs, canvasWidth)).toBe(500);
    expect(timeToPixel(30_000, startTimeMs, visibleDurationMs, canvasWidth)).toBe(1000);
    expect(timeToPixel(15_000, startTimeMs, visibleDurationMs, canvasWidth)).toBe(250);
  });

  it('handles negative or out-of-bounds playhead coordinates safely', () => {
    const startTimeMs = 10_000;
    const visibleDurationMs = 20_000;
    const canvasWidth = 1000;

    expect(timeToPixel(5_000, startTimeMs, visibleDurationMs, canvasWidth)).toBe(-250);
    expect(timeToPixel(35_000, startTimeMs, visibleDurationMs, canvasWidth)).toBe(1250);
  });

  it('handles zero duration or zero canvas width without throwing', () => {
    expect(timeToPixel(5000, 0, 0, 800)).toBe(0);
    expect(timeToPixel(5000, 0, 10_000, 0)).toBe(0);
    expect(pixelToTime(400, 0, 10_000, 0)).toBe(0);
  });

  it('preserves precision in bidirectional time <-> pixel roundtrip', () => {
    const startTimeMs = 25_000;
    const visibleDurationMs = 12_500;
    const canvasWidth = 1280;

    const testTimes = [25_000, 27_350, 31_250, 35_800, 37_500];
    for (const time of testTimes) {
      const px = timeToPixel(time, startTimeMs, visibleDurationMs, canvasWidth);
      const recovered = pixelToTime(px, startTimeMs, visibleDurationMs, canvasWidth);
      expect(recovered).toBeCloseTo(time, 4);
    }
  });
});

describe('Position Interpolation Math', () => {
  const durationMs = 180_000; // 3 minutes

  it('interpolates advancing position while playing at 60 fps cadence', () => {
    const lastPos = 5_000;
    const lastEventTime = 1000;

    // 16.6 ms later (1 frame at 60 fps)
    const pos1 = interpolatePosition(lastPos, lastEventTime, 1016.6, 'playing', durationMs);
    expect(pos1).toBeCloseTo(5016.6, 1);

    // 33.3 ms later (2 frames)
    const pos2 = interpolatePosition(lastPos, lastEventTime, 1033.3, 'playing', durationMs);
    expect(pos2).toBeCloseTo(5033.3, 1);
  });

  it('clamps interpolated position at total track duration', () => {
    const lastPos = 179_900;
    const lastEventTime = 1000;
    // 500 ms elapsed -> exceeds 180_000 ms
    const pos = interpolatePosition(lastPos, lastEventTime, 1500, 'playing', durationMs);
    expect(pos).toBe(180_000);
  });

  it('freezes position when paused or stopped even if clock advances', () => {
    const lastPos = 42_000;
    const lastEventTime = 1000;

    expect(interpolatePosition(lastPos, lastEventTime, 5000, 'paused', durationMs)).toBe(42_000);
    expect(interpolatePosition(lastPos, lastEventTime, 5000, 'stopped', durationMs)).toBe(42_000);
  });

  it('scales interpolation rate according to playback speed multiplier', () => {
    const lastPos = 5_000;
    const lastEventTime = 1000;

    // At 2.0x speed, 50 ms elapsed moves 100 ms
    const pos2x = interpolatePosition(lastPos, lastEventTime, 1050, 'playing', durationMs, 2.0);
    expect(pos2x).toBeCloseTo(5100, 1);

    // At 0.5x speed, 50 ms elapsed moves 25 ms
    const posHalf = interpolatePosition(lastPos, lastEventTime, 1050, 'playing', durationMs, 0.5);
    expect(posHalf).toBeCloseTo(5025, 1);

    // Clamps extreme speeds safely to [0.1, 4.0]
    const posExtreme = interpolatePosition(lastPos, lastEventTime, 1050, 'playing', durationMs, 10.0);
    expect(posExtreme).toBeCloseTo(5200, 1); // 50 * 4.0 = 200
  });

  it('handles negative or zero duration safely', () => {
    expect(interpolatePosition(5000, 1000, 1050, 'playing', 0)).toBe(0);
  });
});

describe('Bar Seek Math (calculateBarSeek)', () => {
  // Synthetic 120 BPM 4/4 grid: 1 beat = 500 ms, 1 bar = 2000 ms
  const grid: BeatGrid = {
    first_downbeat_ms: 1000,
    bpm: 120.0,
    beats_ms: [
      1000, 1500, 2000, 2500, // Bar 1 (downbeat at 1000)
      3000, 3500, 4000, 4500, // Bar 2 (downbeat at 3000)
      5000, 5500, 6000, 6500, // Bar 3 (downbeat at 5000)
      7000, 7500, 8000, 8500, // Bar 4 (downbeat at 7000)
    ],
    downbeat_flags: [
      true, false, false, false,
      true, false, false, false,
      true, false, false, false,
      true, false, false, false,
    ],
    steady: true,
  };

  const totalDurationMs = 10_000;

  it('seeks forward to the next downbeat when between beats', () => {
    // Current at 1200 ms (inside Bar 1) -> Next downbeat is Bar 2 at 3000 ms
    const target = calculateBarSeek(1200, 'forward', grid, totalDurationMs);
    expect(target).toBe(3000);
  });

  it('seeks backward to the previous downbeat when between beats', () => {
    // Current at 3800 ms (inside Bar 2) -> Previous downbeat is Bar 2 start at 3000 ms
    const target = calculateBarSeek(3800, 'backward', grid, totalDurationMs);
    expect(target).toBe(3000);
  });

  it('steps to the next bar when already exactly on a downbeat', () => {
    // Current at 3000 ms -> next downbeat is 5000 ms
    const target = calculateBarSeek(3000, 'forward', grid, totalDurationMs);
    expect(target).toBe(5000);
  });

  it('steps to the previous bar when already exactly on a downbeat', () => {
    // Current at 5000 ms -> previous downbeat is 3000 ms
    const target = calculateBarSeek(5000, 'backward', grid, totalDurationMs);
    expect(target).toBe(3000);
  });

  it('handles position before the first downbeat', () => {
    // Current at 200 ms -> next downbeat is 1000 ms
    expect(calculateBarSeek(200, 'forward', grid, totalDurationMs)).toBe(1000);
    // Current at 200 ms -> backward clamps to 0
    expect(calculateBarSeek(200, 'backward', grid, totalDurationMs)).toBe(0);
  });

  it('handles position past the last downbeat with BPM fallback', () => {
    // Current at 7500 ms -> last downbeat is 7000 ms.
    // Forward past last downbeat steps by 1 bar (2000 ms): 7500 + 2000 = 9500 ms
    expect(calculateBarSeek(7500, 'forward', grid, totalDurationMs)).toBe(9500);
  });

  it('clamps at track duration boundaries', () => {
    expect(calculateBarSeek(9000, 'forward', grid, totalDurationMs)).toBe(10_000);
    expect(calculateBarSeek(500, 'backward', grid, totalDurationMs)).toBe(0);
  });

  it('falls back to 4-beat calculation when downbeat flags are empty or missing', () => {
    const gridNoDownbeats: BeatGrid = {
      first_downbeat_ms: 0,
      bpm: 120.0,
      beats_ms: [0, 500, 1000, 1500, 2000],
      downbeat_flags: [false, false, false, false, false],
      steady: true,
    };

    // 1 bar at 120 BPM = 2000 ms
    expect(calculateBarSeek(1500, 'forward', gridNoDownbeats, 10_000)).toBe(3500);
    expect(calculateBarSeek(1500, 'backward', gridNoDownbeats, 10_000)).toBe(0);
  });

  it('falls back to 120 BPM default when grid is null or undefined', () => {
    // 1 bar at 120 BPM = 2000 ms
    expect(calculateBarSeek(3000, 'forward', null, 10_000)).toBe(5000);
    expect(calculateBarSeek(3000, 'backward', undefined, 10_000)).toBe(1000);
  });
});

describe('Keyboard Event Handler Pure Function', () => {
  const context = {
    currentPositionMs: 10_000,
    durationMs: 60_000,
    grid: {
      first_downbeat_ms: 0,
      bpm: 120.0,
      beats_ms: [0, 500, 1000],
      downbeat_flags: [true, false, false],
      steady: true,
    },
  };

  it('toggles play/pause on Space key', () => {
    const action = handleTrackKeyDown({ key: ' ', code: 'Space' }, context);
    expect(action).toEqual({ type: 'toggle_play_pause' });

    const action2 = handleTrackKeyDown({ key: 'Spacebar' }, context);
    expect(action2).toEqual({ type: 'toggle_play_pause' });
  });

  it('seeks -5s on ArrowLeft without shift', () => {
    const action = handleTrackKeyDown({ key: 'ArrowLeft', shiftKey: false }, context);
    expect(action).toEqual({ type: 'seek', targetMs: 5000 });
  });

  it('seeks +5s on ArrowRight without shift', () => {
    const action = handleTrackKeyDown({ key: 'ArrowRight', shiftKey: false }, context);
    expect(action).toEqual({ type: 'seek', targetMs: 15_000 });
  });

  it('clamps seek at 0 and duration boundaries', () => {
    const nearStartCtx = { ...context, currentPositionMs: 2000 };
    expect(handleTrackKeyDown({ key: 'ArrowLeft' }, nearStartCtx)).toEqual({
      type: 'seek',
      targetMs: 0,
    });

    const nearEndCtx = { ...context, currentPositionMs: 58_000 };
    expect(handleTrackKeyDown({ key: 'ArrowRight' }, nearEndCtx)).toEqual({
      type: 'seek',
      targetMs: 60_000,
    });
  });

  it('seeks 1 bar on Shift + ArrowLeft and Shift + ArrowRight', () => {
    const backAction = handleTrackKeyDown({ key: 'ArrowLeft', shiftKey: true }, context);
    expect(backAction?.type).toBe('seek');
    expect((backAction as { targetMs: number }).targetMs).toBeLessThan(10_000);

    const fwdAction = handleTrackKeyDown({ key: 'ArrowRight', shiftKey: true }, context);
    expect(fwdAction?.type).toBe('seek');
    expect((fwdAction as { targetMs: number }).targetMs).toBeGreaterThan(10_000);
  });

  it('ignores other keys like ArrowUp, Enter, KeyA', () => {
    expect(handleTrackKeyDown({ key: 'ArrowUp' }, context)).toBeNull();
    expect(handleTrackKeyDown({ key: 'Enter' }, context)).toBeNull();
    expect(handleTrackKeyDown({ key: 'a' }, context)).toBeNull();
  });

  it('ignores keystrokes when focused inside form inputs', () => {
    expect(
      handleTrackKeyDown({ key: ' ', code: 'Space', targetTagName: 'INPUT' }, context)
    ).toBeNull();
    expect(
      handleTrackKeyDown({ key: 'ArrowLeft', targetTagName: 'TEXTAREA' }, context)
    ).toBeNull();
    expect(
      handleTrackKeyDown({ key: 'ArrowRight', targetTagName: 'SELECT' }, context)
    ).toBeNull();
    expect(
      handleTrackKeyDown({ key: ' ', code: 'Space', isContentEditable: true }, context)
    ).toBeNull();
  });

  it('ignores keystrokes with Ctrl, Alt, or Meta modifiers', () => {
    expect(handleTrackKeyDown({ key: 'ArrowLeft', ctrlKey: true }, context)).toBeNull();
    expect(handleTrackKeyDown({ key: 'ArrowRight', altKey: true }, context)).toBeNull();
    expect(handleTrackKeyDown({ key: ' ', code: 'Space', metaKey: true }, context)).toBeNull();
  });

  it('triggers step_speed up on ] and Shift + >', () => {
    expect(handleTrackKeyDown({ key: ']' }, context)).toEqual({
      type: 'step_speed',
      direction: 'up',
    });
    expect(handleTrackKeyDown({ key: '>', shiftKey: true }, context)).toEqual({
      type: 'step_speed',
      direction: 'up',
    });
  });

  it('triggers step_speed down on [ and Shift + <', () => {
    expect(handleTrackKeyDown({ key: '[' }, context)).toEqual({
      type: 'step_speed',
      direction: 'down',
    });
    expect(handleTrackKeyDown({ key: '<', shiftKey: true }, context)).toEqual({
      type: 'step_speed',
      direction: 'down',
    });
  });

  it('triggers jump_cue for keys 1 to 8 without shift', () => {
    expect(handleTrackKeyDown({ key: '1' }, context)).toEqual({
      type: 'jump_cue',
      cueIndex: 0,
    });
    expect(handleTrackKeyDown({ key: '4' }, context)).toEqual({
      type: 'jump_cue',
      cueIndex: 3,
    });
    expect(handleTrackKeyDown({ key: '8' }, context)).toEqual({
      type: 'jump_cue',
      cueIndex: 7,
    });
    // Shift+number or 9/0 should not trigger jump_cue
    expect(handleTrackKeyDown({ key: '1', shiftKey: true }, context)).toBeNull();
    expect(handleTrackKeyDown({ key: '9' }, context)).toBeNull();
    expect(handleTrackKeyDown({ key: '0' }, context)).toBeNull();
  });
});
