import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useAppStore } from '../../store/useAppStore';
import { Sidebar } from '../../components/Sidebar';
import { TransitionCostBadge } from '../setlist/TransitionCostBadge';
import { PlaybackBar } from '../track/PlaybackBar';
import { FourPointCueDeck } from '../track/cues/FourPointCueDeck';
import { FourPointCueChips } from '../track/cues/FourPointCueChips';
import type { Track } from '../../bindings/Track';

function makeMockTrack(id = 'test-track-1'): Track {
  return {
    id,
    path: `/music/${id}.mp3`,
    hash: `hash-${id}`,
    tags: {
      title: 'Deep Motion',
      artist: 'Hardware Producer',
      album: 'Analog Sessions',
    },
    duration_ms: 360000,
    analysis: {
      loudness: {
        integrated_lufs: -10.5,
        loudness_range: 6.0,
        true_peak: -0.2,
      },
      rhythm: {
        grid: {
          first_downbeat_ms: 100,
          bpm: 126.0,
          beats_ms: [100, 576, 1052, 1528],
          downbeat_flags: [true, false, false, false],
          steady: true,
        },
        bpm_alternates: [63.0, 252.0],
      },
      key: {
        pitch_class: 0,
        mode: 'Minor',
        camelot: { number: 8, letter: 'A' },
        tuning_cents: 0,
      },
      dynamics: {
        frame_rate: 86.13,
        rms_curve: [0.5],
        low_ratio_curve: [0.4],
        centroid_curve: [1200],
      },
      energy_score: 7,
      energy_curve: { per_bar: [7] },
      segments: [
        { label: 'intro', start_ms: 0, end_ms: 30000, energy: 4 },
        { label: 'breakdown', start_ms: 60000, end_ms: 90000, energy: 5 },
        { label: 'drop', start_ms: 90000, end_ms: 180000, energy: 8 },
        { label: 'outro', start_ms: 270000, end_ms: 360000, energy: 4 },
      ],
      cue_points: [
        { index: 0, time_ms: 100, label: 'A: INTRO', color_hex: '#10B981', kind: 'HotCue', loop_end_ms: null },
        { index: 1, time_ms: 60000, label: 'B: BREAKDOWN', color_hex: '#F59E0B', kind: 'HotCue', loop_end_ms: null },
        { index: 2, time_ms: 90000, label: 'C: DROP', color_hex: '#EF4444', kind: 'HotCue', loop_end_ms: null },
        { index: 3, time_ms: 270000, label: 'D: MIX OUT', color_hex: '#06B6D4', kind: 'HotCue', loop_end_ms: null },
      ],
      waveform: {
        points_per_sec: 10,
        low: { peak: [100], rms: [50] },
        mid: { peak: [100], rms: [50] },
        high: { peak: [100], rms: [50] },
      },
    },
    analyzed_at: '2026-01-01',
    analysis_version: 'v1',
  };
}

describe('Workgroup 10: Motion & Physical Interaction Language', () => {
  beforeEach(() => {
    useAppStore.setState({
      currentRoute: 'library',
      setlist: [],
      tracks: [],
      useMockBackend: true,
      auditionState: 'stopped',
      auditionPositionMs: 0,
      auditionTrackId: null,
    });
  });

  describe('Hardware Mechanical Design Tokens & Index CSS Rules', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const cssPath = path.resolve(currentDir, '../../index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    it('defines mechanical easing, rapid tactile durations, and control surface primitives', () => {
      // Mechanical curve tokens
      expect(cssContent).toContain('--ease-mechanical: cubic-bezier(0.2, 0, 0, 1)');
      expect(cssContent).toContain('--ease-snap: cubic-bezier(0, 0, 0.2, 1)');

      // Fast tactile duration tokens (60ms, 90ms, 140ms)
      expect(cssContent).toContain('--dur-instant: 60ms');
      expect(cssContent).toContain('--dur-tactile: 90ms');
      expect(cssContent).toContain('--dur-snap: 140ms');

      // Hardware control surface classes
      expect(cssContent).toContain('.hw-btn');
      expect(cssContent).toContain('.hw-pad');
      expect(cssContent).toContain('.hw-row');
      expect(cssContent).toContain('.hw-track-card');
      expect(cssContent).toContain('.hw-coupler');
      expect(cssContent).toContain('.hw-led');

      // Accessibility: prefers-reduced-motion kills animation and transform
      expect(cssContent).toContain('@media (prefers-reduced-motion: reduce)');
      expect(cssContent).toContain('transition-duration: 0.01ms');
    });

    it('enforces that typography meets the 12px minimum standard', () => {
      // Te-silkscreen and te-unit must not be smaller than 12px
      expect(cssContent).toContain('font-size: 12px');
    });
  });

  describe('Control Surface Components Tactile Feedback', () => {
    it('Sidebar renders mechanical buttons and illuminated LED latch on active route', () => {
      useAppStore.setState({ currentRoute: 'library' });
      render(<Sidebar />);

      const libraryBtn = screen.getByRole('button', { name: /library/i });
      expect(libraryBtn.className).toContain('hw-btn');
      expect(libraryBtn.className).toContain('active:translate-y-[1px]');

      // Active button contains illuminated cyan LED indicator
      const activeLed = libraryBtn.querySelector('.hw-led');
      expect(activeLed).toBeDefined();
      expect(activeLed?.className).toContain('hw-led-cyan');
    });

    it('TransitionCostBadge renders hardware coupler interlock and tactile advice button', () => {
      const trackA = makeMockTrack('track-a');
      const trackB = makeMockTrack('track-b');

      const { container } = render(
        <TransitionCostBadge
          fromTrack={trackA}
          toTrack={trackB}
          transition={null}
          fromTitle="Track A"
          toTitle="Track B"
          onOpenAdvice={vi.fn()}
          onFindBridge={vi.fn()}
        />
      );

      const coupler = container.querySelector('.hw-coupler');
      expect(coupler).toBeDefined();

      const adviceBtn = screen.getByRole('button', {
        name: /transition advice between Track A and Track B/i,
      });
      expect(adviceBtn.className).toContain('hw-btn');
      expect(adviceBtn.className).toContain('active:translate-y-[1px]');
    });

    it('PlaybackBar renders mechanical transport buttons and illuminated status indicator without soft pulse', () => {
      render(
        <PlaybackBar
          state="playing"
          positionMs={120000}
          durationMs={360000}
          clickEnabled={true}
          speed={1.0}
          onPlay={vi.fn()}
          onPause={vi.fn()}
          onSeek={vi.fn()}
          onToggleClick={vi.fn()}
          onSetSpeed={vi.fn()}
        />
      );

      const playPauseBtn = screen.getByTestId('playback-play-pause-btn');
      expect(playPauseBtn.className).toContain('hw-btn');
      expect(playPauseBtn.className).toContain('active:translate-y-[1px]');

      const jumpStartBtn = screen.getByTestId('playback-jump-start-btn');
      expect(jumpStartBtn.className).toContain('hw-btn');
      expect(jumpStartBtn.className).toContain('active:translate-y-[1px]');

      const clickToggle = screen.getByTestId('playback-click-toggle');
      expect(clickToggle.className).toContain('hw-btn');
      // Verify no soft CSS animate-pulse is used for DJ hardware precision
      expect(clickToggle.innerHTML).not.toContain('animate-pulse');
    });

    it('FourPointCueDeck renders hardware performance pads with instant tactile response', () => {
      const track = makeMockTrack('track-cue');
      render(
        <FourPointCueDeck
          track={track}
          playheadPositionMs={100}
          onJumpToCue={vi.fn()}
        />
      );

      // Verify pad trigger button uses .hw-pad
      const padA = screen.getByTestId('pad-trigger-A');
      expect(padA.className).toContain('hw-pad');

      // Verify action buttons use .hw-btn and micro-depression
      const auditionBtn = screen.getByTestId('btn-audition-A');
      expect(auditionBtn.className).toContain('hw-btn');
      expect(auditionBtn.className).toContain('active:translate-y-[1px]');

      const nudgePrev = screen.getByTestId('btn-nudge-prev-A');
      expect(nudgePrev.className).toContain('hw-btn');
      expect(nudgePrev.className).toContain('active:translate-y-[1px]');
    });

    it('FourPointCueChips renders tactile interactive chips with accessible >=12px font', () => {
      const track = makeMockTrack('track-chips');
      render(
        <FourPointCueChips
          track={track}
          onCueClick={vi.fn()}
          size="sm"
          showTimes={true}
        />
      );

      const chipA = screen.getByTestId('cue-chip-A');
      expect(chipA.className).toContain('hw-btn');
      expect(chipA.className).toContain('active:translate-y-[1px]');
      // Ensure font size is >=12px (text-xs)
      expect(chipA.className).toContain('text-xs');
      expect(chipA.className).not.toContain('text-[9px]');
      expect(chipA.className).not.toContain('text-[10px]');
    });
  });
});
