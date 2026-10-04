import { describe, it, expect } from 'vitest';
import { getStartSteps, isTrackNeedingReview } from './startSteps';
import type { Track } from '../../bindings/Track';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { ProgressEvent } from '../../api';

function makeMockTrack(
  id: string,
  overrides?: {
    bpm?: number;
    camelotNum?: number;
    camelotLetter?: 'A' | 'B';
    hasAnalysis?: boolean;
    hasKey?: boolean;
    hasRhythm?: boolean;
  }
): Track {
  const hasAnalysis = overrides?.hasAnalysis !== false;
  const hasKey = overrides?.hasKey !== false;
  const hasRhythm = overrides?.hasRhythm !== false;
  const bpm = overrides?.bpm ?? 128;
  const camelotNum = overrides?.camelotNum ?? 8;
  const camelotLetter = overrides?.camelotLetter ?? 'A';

  return {
    id,
    path: `/music/track_${id}.mp3`,
    hash: `hash_${id}`,
    duration_ms: 180000,
    tags: { title: `Track ${id}`, artist: `Artist ${id}`, album: `Album ${id}` },
    analyzed_at: hasAnalysis ? '2026-10-01T12:00:00Z' : null,
    analysis_version: hasAnalysis ? '1.0.0' : null,
    analysis: hasAnalysis
      ? {
          loudness: { integrated_lufs: -14, loudness_range: 5, true_peak: -0.5 },
          rhythm: hasRhythm
            ? {
                grid: {
                  first_downbeat_ms: 0,
                  bpm,
                  beats_ms: [0, 500, 1000],
                  downbeat_flags: [true, false, false],
                  steady: true,
                },
                bpm_alternates: [bpm * 2, bpm / 2],
              }
            : (null as unknown as Track['analysis'] extends null ? never : NonNullable<Track['analysis']>['rhythm']),
          key: hasKey
            ? {
                pitch_class: 0,
                mode: camelotLetter === 'A' ? 'Minor' : 'Major',
                camelot: { number: camelotNum, letter: camelotLetter },
                tuning_cents: 0,
              }
            : (null as unknown as Track['analysis'] extends null ? never : NonNullable<Track['analysis']>['key']),
          dynamics: {
            frame_rate: 86.13,
            rms_curve: [0.5],
            low_ratio_curve: [0.5],
            centroid_curve: [1000],
          },
          energy_score: 7,
          energy_curve: { per_bar: [7] },
          segments: [],
          cue_points: [],
          waveform: {
            points_per_sec: 150,
            low: { peak: [100], rms: [50] },
            mid: { peak: [80], rms: [40] },
            high: { peak: [60], rms: [30] },
          },
        }
      : null,
  };
}

function makeMockSetlistEntry(position: number, track: Track): SetlistEntry {
  return {
    position,
    track_id: track.id,
    track,
    transition: null,
    target_energy: 7,
  };
}

describe('isTrackNeedingReview pure function', () => {
  it('returns false for a completely analyzed track with valid BPM and Camelot key', () => {
    const track = makeMockTrack('1', { bpm: 124, camelotNum: 6, camelotLetter: 'A' });
    expect(isTrackNeedingReview(track)).toBe(false);
  });

  it('returns true when analysis is null (analysis failed / incomplete)', () => {
    const track = makeMockTrack('2', { hasAnalysis: false });
    expect(isTrackNeedingReview(track)).toBe(true);
  });

  it('returns true when BPM is missing, 0, negative, or NaN', () => {
    expect(isTrackNeedingReview(makeMockTrack('3', { bpm: 0 }))).toBe(true);
    expect(isTrackNeedingReview(makeMockTrack('4', { bpm: -120 }))).toBe(true);
    expect(isTrackNeedingReview(makeMockTrack('5', { bpm: Number.NaN }))).toBe(true);
    expect(isTrackNeedingReview(makeMockTrack('6', { hasRhythm: false }))).toBe(true);
  });

  it('returns true when Camelot key is missing or invalid', () => {
    expect(isTrackNeedingReview(makeMockTrack('7', { hasKey: false }))).toBe(true);
    expect(isTrackNeedingReview(makeMockTrack('8', { camelotNum: 0 }))).toBe(true);
    expect(isTrackNeedingReview(makeMockTrack('9', { camelotNum: 13 }))).toBe(true);
  });
});

describe('getStartSteps pure function', () => {
  describe('Step 1: Add your music', () => {
    it('returns "not_started" when tracks array is empty and no scan is running', () => {
      const steps = getStartSteps({
        tracks: [],
        isLoadingTracks: false,
        progress: null,
        setlist: [],
      });
      const step1 = steps[0];
      expect(step1.id).toBe('add_music');
      expect(step1.status).toBe('not_started');
      expect(step1.statusLabel).toBe('Not started');
      expect(step1.sentence).toContain('0 tracks analyzed');
    });

    it('returns "in_progress" when isLoadingTracks is true without progress event', () => {
      const steps = getStartSteps({
        tracks: [makeMockTrack('1')],
        isLoadingTracks: true,
        progress: null,
        setlist: [],
      });
      const step1 = steps[0];
      expect(step1.status).toBe('in_progress');
      expect(step1.statusLabel).toBe('In progress');
      expect(step1.sentence).toContain('Scanning folder and analyzing tracks');
    });

    it('returns "in_progress" with formatted progress percentage and track count when progress is active', () => {
      const progress: ProgressEvent = {
        stage: 'analyzing',
        current: 25,
        total: 100,
        message: 'Calculating beat grid',
      };
      const steps = getStartSteps({
        tracks: [makeMockTrack('1'), makeMockTrack('2')],
        isLoadingTracks: true,
        progress,
        setlist: [],
      });
      const step1 = steps[0];
      expect(step1.status).toBe('in_progress');
      expect(step1.statusLabel).toBe('In progress');
      expect(step1.sentence).toBe('Scanning tracks: 25 of 100 (25%) — 2 analyzed.');
    });

    it('returns "done" when tracks exist and no scan is running', () => {
      const steps = getStartSteps({
        tracks: [makeMockTrack('1'), makeMockTrack('2'), makeMockTrack('3')],
        isLoadingTracks: false,
        progress: null,
        setlist: [],
      });
      const step1 = steps[0];
      expect(step1.status).toBe('done');
      expect(step1.statusLabel).toBe('Done');
      expect(step1.sentence).toBe('3 tracks analyzed and ready in your library.');
    });
  });

  describe('Step 2: Check the results', () => {
    it('returns "not_started" when no tracks exist', () => {
      const steps = getStartSteps({
        tracks: [],
        setlist: [],
      });
      const step2 = steps[1];
      expect(step2.id).toBe('check_results');
      expect(step2.status).toBe('not_started');
      expect(step2.statusLabel).toBe('Not started');
      expect(step2.sentence).toContain('No tracks analyzed yet');
    });

    it('returns "in_progress" with issue count when tracks require attention', () => {
      const goodTrack = makeMockTrack('1');
      const badTrack1 = makeMockTrack('2', { hasAnalysis: false });
      const badTrack2 = makeMockTrack('3', { bpm: 0 });

      const steps = getStartSteps({
        tracks: [goodTrack, badTrack1, badTrack2],
        setlist: [],
      });
      const step2 = steps[1];
      expect(step2.status).toBe('in_progress');
      expect(step2.statusLabel).toBe('In progress');
      expect(step2.issuesCount).toBe(2);
      expect(step2.sentence).toBe('2 tracks need a look (analysis failed, missing BPM or key).');
    });

    it('formats singular "1 track needs a look" when exactly one track has issues', () => {
      const badTrack = makeMockTrack('1', { hasKey: false });
      const steps = getStartSteps({
        tracks: [badTrack],
        setlist: [],
      });
      const step2 = steps[1];
      expect(step2.status).toBe('in_progress');
      expect(step2.sentence).toBe('1 track needs a look (analysis failed, missing BPM or key).');
    });

    it('returns "done" with "All tracks look good." when all tracks pass analysis', () => {
      const goodTrack1 = makeMockTrack('1');
      const goodTrack2 = makeMockTrack('2');
      const steps = getStartSteps({
        tracks: [goodTrack1, goodTrack2],
        setlist: [],
      });
      const step2 = steps[1];
      expect(step2.status).toBe('done');
      expect(step2.statusLabel).toBe('Done');
      expect(step2.issuesCount).toBe(0);
      expect(step2.sentence).toBe('All tracks look good.');
    });
  });

  describe('Step 3: Build your set', () => {
    it('returns "not_started" when setlist is empty and not suggesting order', () => {
      const steps = getStartSteps({
        tracks: [makeMockTrack('1')],
        setlist: [],
      });
      const step3 = steps[2];
      expect(step3.id).toBe('build_set');
      expect(step3.status).toBe('not_started');
      expect(step3.statusLabel).toBe('Not started');
      expect(step3.sentence).toBe('Your set currently has 0 tracks.');
    });

    it('returns "in_progress" when setlist has exactly 1 track', () => {
      const t1 = makeMockTrack('1');
      const steps = getStartSteps({
        tracks: [t1],
        setlist: [makeMockSetlistEntry(0, t1)],
      });
      const step3 = steps[2];
      expect(step3.status).toBe('in_progress');
      expect(step3.statusLabel).toBe('In progress');
      expect(step3.sentence).toBe('Your set has 1 track.');
    });

    it('returns "in_progress" when order optimization is running', () => {
      const t1 = makeMockTrack('1');
      const t2 = makeMockTrack('2');
      const steps = getStartSteps({
        tracks: [t1, t2],
        setlist: [makeMockSetlistEntry(0, t1), makeMockSetlistEntry(1, t2)],
        isSuggestingOrder: true,
      });
      const step3 = steps[2];
      expect(step3.status).toBe('in_progress');
      expect(step3.statusLabel).toBe('In progress');
      expect(step3.sentence).toContain('Optimizing set order');
    });

    it('returns "done" when setlist has 2 or more tracks', () => {
      const t1 = makeMockTrack('1');
      const t2 = makeMockTrack('2');
      const t3 = makeMockTrack('3');
      const steps = getStartSteps({
        tracks: [t1, t2, t3],
        setlist: [
          makeMockSetlistEntry(0, t1),
          makeMockSetlistEntry(1, t2),
          makeMockSetlistEntry(2, t3),
        ],
      });
      const step3 = steps[2];
      expect(step3.status).toBe('done');
      expect(step3.statusLabel).toBe('Done');
      expect(step3.sentence).toBe('Your set has 3 tracks.');
    });
  });

  describe('Step 4: Play and export', () => {
    it('returns "not_started" when setlist has fewer than 2 tracks', () => {
      const t1 = makeMockTrack('1');
      const steps = getStartSteps({
        tracks: [t1],
        setlist: [makeMockSetlistEntry(0, t1)],
      });
      const step4 = steps[3];
      expect(step4.id).toBe('play_export');
      expect(step4.status).toBe('not_started');
      expect(step4.statusLabel).toBe('Not started');
      expect(step4.canPlayOrExport).toBe(false);
      expect(step4.sentence).toContain('Add at least 2 tracks to your set');
    });

    it('returns "in_progress" when Stage Mode is active', () => {
      const t1 = makeMockTrack('1');
      const t2 = makeMockTrack('2');
      const steps = getStartSteps({
        tracks: [t1, t2],
        setlist: [makeMockSetlistEntry(0, t1), makeMockSetlistEntry(1, t2)],
        isStageMode: true,
      });
      const step4 = steps[3];
      expect(step4.status).toBe('in_progress');
      expect(step4.statusLabel).toBe('In progress');
      expect(step4.sentence).toBe('Live performance is active in Stage Mode.');
    });

    it('returns "in_progress" when export is actively running', () => {
      const t1 = makeMockTrack('1');
      const t2 = makeMockTrack('2');
      const steps = getStartSteps({
        tracks: [t1, t2],
        setlist: [makeMockSetlistEntry(0, t1), makeMockSetlistEntry(1, t2)],
        exportStatus: 'Writing Rekordbox XML...',
      });
      const step4 = steps[3];
      expect(step4.status).toBe('in_progress');
      expect(step4.statusLabel).toBe('In progress');
      expect(step4.sentence).toBe('Exporting setlist: Writing Rekordbox XML...');
    });

    it('returns "done" when setlist has at least 2 tracks and is ready', () => {
      const t1 = makeMockTrack('1');
      const t2 = makeMockTrack('2');
      const steps = getStartSteps({
        tracks: [t1, t2],
        setlist: [makeMockSetlistEntry(0, t1), makeMockSetlistEntry(1, t2)],
      });
      const step4 = steps[3];
      expect(step4.status).toBe('done');
      expect(step4.statusLabel).toBe('Done');
      expect(step4.canPlayOrExport).toBe(true);
      expect(step4.sentence).toBe('Your set has 2 tracks and is ready to play or export.');
    });
  });

  describe('Comprehensive status combinations across all steps', () => {
    const tGood1 = makeMockTrack('1');
    const tGood2 = makeMockTrack('2');
    const tBad = makeMockTrack('3', { hasAnalysis: false });

    it('Combination 1: Fresh clean launch -> [not_started, not_started, not_started, not_started]', () => {
      const steps = getStartSteps({
        tracks: [],
        isLoadingTracks: false,
        progress: null,
        setlist: [],
      });
      expect(steps.map((s) => s.status)).toEqual([
        'not_started',
        'not_started',
        'not_started',
        'not_started',
      ]);
    });

    it('Combination 2: Initial scan in progress -> [in_progress, not_started, not_started, not_started]', () => {
      const steps = getStartSteps({
        tracks: [],
        isLoadingTracks: true,
        progress: { stage: 'scanning', current: 10, total: 50, message: 'scanning' },
        setlist: [],
      });
      expect(steps.map((s) => s.status)).toEqual([
        'in_progress',
        'not_started',
        'not_started',
        'not_started',
      ]);
    });

    it('Combination 3: Scan complete with issues -> [done, in_progress, not_started, not_started]', () => {
      const steps = getStartSteps({
        tracks: [tGood1, tBad],
        isLoadingTracks: false,
        setlist: [],
      });
      expect(steps.map((s) => s.status)).toEqual([
        'done',
        'in_progress',
        'not_started',
        'not_started',
      ]);
    });

    it('Combination 4: All tracks good, empty setlist -> [done, done, not_started, not_started]', () => {
      const steps = getStartSteps({
        tracks: [tGood1, tGood2],
        isLoadingTracks: false,
        setlist: [],
      });
      expect(steps.map((s) => s.status)).toEqual([
        'done',
        'done',
        'not_started',
        'not_started',
      ]);
    });

    it('Combination 5: 1 track added to setlist -> [done, done, in_progress, not_started]', () => {
      const steps = getStartSteps({
        tracks: [tGood1, tGood2],
        setlist: [makeMockSetlistEntry(0, tGood1)],
      });
      expect(steps.map((s) => s.status)).toEqual([
        'done',
        'done',
        'in_progress',
        'not_started',
      ]);
    });

    it('Combination 6: 2 tracks added to setlist, set ready -> [done, done, done, done]', () => {
      const steps = getStartSteps({
        tracks: [tGood1, tGood2],
        setlist: [makeMockSetlistEntry(0, tGood1), makeMockSetlistEntry(1, tGood2)],
      });
      expect(steps.map((s) => s.status)).toEqual([
        'done',
        'done',
        'done',
        'done',
      ]);
    });

    it('Combination 7: Performing live in Stage Mode -> [done, done, done, in_progress]', () => {
      const steps = getStartSteps({
        tracks: [tGood1, tGood2],
        setlist: [makeMockSetlistEntry(0, tGood1), makeMockSetlistEntry(1, tGood2)],
        isStageMode: true,
      });
      expect(steps.map((s) => s.status)).toEqual([
        'done',
        'done',
        'done',
        'in_progress',
      ]);
    });

    it('Combination 8: Optimization solver running on complete set -> [done, done, in_progress, done]', () => {
      const steps = getStartSteps({
        tracks: [tGood1, tGood2],
        setlist: [makeMockSetlistEntry(0, tGood1), makeMockSetlistEntry(1, tGood2)],
        isSuggestingOrder: true,
      });
      expect(steps.map((s) => s.status)).toEqual([
        'done',
        'done',
        'in_progress',
        'done',
      ]);
    });

    it('Combination 9: Rescanning library with an existing ready setlist -> [in_progress, done, done, done]', () => {
      const steps = getStartSteps({
        tracks: [tGood1, tGood2],
        isLoadingTracks: true,
        setlist: [makeMockSetlistEntry(0, tGood1), makeMockSetlistEntry(1, tGood2)],
      });
      expect(steps.map((s) => s.status)).toEqual([
        'in_progress',
        'done',
        'done',
        'done',
      ]);
    });

    it('Combination 10: Rescanning library with track issues and an existing ready setlist -> [in_progress, in_progress, done, done]', () => {
      const steps = getStartSteps({
        tracks: [tGood1, tBad],
        isLoadingTracks: true,
        setlist: [makeMockSetlistEntry(0, tGood1), makeMockSetlistEntry(1, tBad)],
      });
      expect(steps.map((s) => s.status)).toEqual([
        'in_progress',
        'in_progress',
        'done',
        'done',
      ]);
    });
  });
});
