import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { StartScreen } from './StartScreen';
import { useAppStore } from '../../store/useAppStore';
import type { Track } from '../../bindings/Track';
import type { SetlistEntry } from '../../bindings/SetlistEntry';

// Mock @tauri-apps/plugin-dialog
const mockOpen = vi.fn();
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => mockOpen(...args),
}));

function makeMockTrack(
  id: string,
  overrides?: {
    bpm?: number;
    camelotNum?: number;
    camelotLetter?: 'A' | 'B';
    hasAnalysis?: boolean;
  }
): Track {
  const hasAnalysis = overrides?.hasAnalysis !== false;
  const bpm = overrides?.bpm ?? 126;
  const camelotNum = overrides?.camelotNum ?? 8;
  const camelotLetter = overrides?.camelotLetter ?? 'A';

  return {
    id,
    path: `/music/track_${id}.mp3`,
    hash: `hash_${id}`,
    duration_ms: 210000,
    tags: { title: `Track Title ${id}`, artist: `Artist ${id}`, album: `Album ${id}` },
    analyzed_at: hasAnalysis ? '2026-10-01T10:00:00Z' : null,
    analysis_version: hasAnalysis ? '1.0.0' : null,
    analysis: hasAnalysis
      ? {
          loudness: { integrated_lufs: -14, loudness_range: 4, true_peak: -0.2 },
          rhythm: {
            grid: {
              first_downbeat_ms: 0,
              bpm,
              beats_ms: [0, 500],
              downbeat_flags: [true, false],
              steady: true,
            },
            bpm_alternates: [bpm * 2, bpm / 2],
          },
          key: {
            pitch_class: 0,
            mode: camelotLetter === 'A' ? 'Minor' : 'Major',
            camelot: { number: camelotNum, letter: camelotLetter },
            tuning_cents: 0,
          },
          dynamics: {
            frame_rate: 86.13,
            rms_curve: [0.5],
            low_ratio_curve: [0.5],
            centroid_curve: [1000],
          },
          energy_score: 8,
          energy_curve: { per_bar: [8] },
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
    target_energy: 8,
  };
}

describe('StartScreen Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      currentRoute: 'library',
      tracks: [],
      isLoadingTracks: false,
      hasLoadedTracks: true,
      tracksError: null,
      progress: null,
      setlist: [],
      isSuggestingOrder: false,
      isStageMode: false,
      exportStatus: null,
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 1. One render test per status: Not started, In progress, Done
  // ─────────────────────────────────────────────────────────────

  it('renders StartScreen with "Not started" status for initial launch', () => {
    render(<StartScreen />);

    expect(screen.getByTestId('start-screen')).toBeDefined();
    expect(screen.getByText('GETTING STARTED')).toBeDefined();

    // Check all step statuses are 'Not started'
    const statusBadges = screen.getAllByText('Not started');
    expect(statusBadges.length).toBe(4);

    expect(screen.getByTestId('start-step-1-status').textContent).toBe('Not started');
    expect(screen.getByTestId('start-step-2-status').textContent).toBe('Not started');
    expect(screen.getByTestId('start-step-3-status').textContent).toBe('Not started');
    expect(screen.getByTestId('start-step-4-status').textContent).toBe('Not started');

    // Step 1 plain sentence shows 0 analyzed
    expect(screen.getByTestId('start-step-1-sentence').textContent).toContain('0 tracks analyzed');

    // Step 4 buttons disabled
    const playBtn = screen.getByTestId('start-play-stage-btn') as HTMLButtonElement;
    const exportBtn = screen.getByTestId('start-export-btn') as HTMLButtonElement;
    expect(playBtn.disabled).toBe(true);
    expect(exportBtn.disabled).toBe(true);
  });

  it('renders StartScreen with "In progress" status when operations are running', () => {
    useAppStore.setState({
      isLoadingTracks: true,
      progress: {
        stage: 'scanning',
        current: 12,
        total: 40,
        message: 'Reading metadata',
      },
      tracks: [makeMockTrack('1')],
    });

    render(<StartScreen />);

    expect(screen.getByTestId('start-step-1-status').textContent).toBe('In progress');
    expect(screen.getByTestId('start-step-1-sentence').textContent).toBe(
      'Scanning tracks: 12 of 40 (30%) — 1 analyzed.'
    );
    expect(screen.getByText('12 / 40 (30%)')).toBeDefined();

    const scanBtn = screen.getByTestId('start-scan-btn') as HTMLButtonElement;
    expect(scanBtn.disabled).toBe(true);
    expect(scanBtn.textContent).toBe('Scanning...');
  });

  it('renders StartScreen with "Done" status when library and set are ready', () => {
    const t1 = makeMockTrack('1');
    const t2 = makeMockTrack('2');
    const t3 = makeMockTrack('3');

    useAppStore.setState({
      tracks: [t1, t2, t3],
      isLoadingTracks: false,
      progress: null,
      setlist: [makeMockSetlistEntry(0, t1), makeMockSetlistEntry(1, t2)],
      isStageMode: false,
      exportStatus: null,
    });

    render(<StartScreen />);

    expect(screen.getByTestId('start-step-1-status').textContent).toBe('Done');
    expect(screen.getByTestId('start-step-2-status').textContent).toBe('Done');
    expect(screen.getByTestId('start-step-3-status').textContent).toBe('Done');
    expect(screen.getByTestId('start-step-4-status').textContent).toBe('Done');

    // Step 2 says "All tracks look good."
    expect(screen.getByTestId('start-step-2-sentence').textContent).toBe('All tracks look good.');

    // Step 4 buttons enabled
    const playBtn = screen.getByTestId('start-play-stage-btn') as HTMLButtonElement;
    const exportBtn = screen.getByTestId('start-export-btn') as HTMLButtonElement;
    expect(playBtn.disabled).toBe(false);
    expect(exportBtn.disabled).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Step 1: Scanning actions & dialogs
  // ─────────────────────────────────────────────────────────────

  it('triggers native folder picker and scanFolder on button click', async () => {
    const scanFolderMock = vi.fn().mockResolvedValue(undefined);
    mockOpen.mockResolvedValueOnce('D:/DJ_Music/Crates');

    useAppStore.setState({
      scanFolder: scanFolderMock,
    });

    render(<StartScreen />);

    const scanBtn = screen.getByTestId('start-scan-btn');
    await act(async () => {
      fireEvent.click(scanBtn);
    });

    expect(mockOpen).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: 'Choose Music Folder',
    });
    expect(scanFolderMock).toHaveBeenCalledWith('D:/DJ_Music/Crates');
  });

  it('uses custom onChooseFolder callback prop when provided', async () => {
    const onChooseFolderMock = vi.fn();
    render(<StartScreen onChooseFolder={onChooseFolderMock} />);

    const scanBtn = screen.getByTestId('start-scan-btn');
    await act(async () => {
      fireEvent.click(scanBtn);
    });

    expect(onChooseFolderMock).toHaveBeenCalledTimes(1);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Step 2: Check results & filtered library view prop
  // ─────────────────────────────────────────────────────────────

  it('renders filtered library button when issues exist and onOpenFilteredLibrary prop is provided', () => {
    const goodTrack = makeMockTrack('1');
    const badTrack = makeMockTrack('2', { hasAnalysis: false });
    const onOpenFilteredMock = vi.fn();

    useAppStore.setState({
      tracks: [goodTrack, badTrack],
    });

    render(<StartScreen onOpenFilteredLibrary={onOpenFilteredMock} />);

    expect(screen.getByTestId('start-step-2-sentence').textContent).toBe(
      '1 track needs a look (analysis failed, missing BPM or key).'
    );

    const reviewBtn = screen.getByTestId('start-review-btn');
    expect(reviewBtn).toBeDefined();

    act(() => {
      fireEvent.click(reviewBtn);
    });
    expect(onOpenFilteredMock).toHaveBeenCalledTimes(1);
  });

  it('hides filtered library button when onOpenFilteredLibrary prop is missing', () => {
    const badTrack = makeMockTrack('2', { hasAnalysis: false });
    useAppStore.setState({
      tracks: [badTrack],
    });

    render(<StartScreen />); // No onOpenFilteredLibrary prop

    expect(screen.queryByTestId('start-review-btn')).toBeNull();
  });

  it('hides filtered library button when 0 issues exist even if prop is provided', () => {
    const goodTrack = makeMockTrack('1');
    const onOpenFilteredMock = vi.fn();

    useAppStore.setState({
      tracks: [goodTrack],
    });

    render(<StartScreen onOpenFilteredLibrary={onOpenFilteredMock} />);

    expect(screen.getByTestId('start-step-2-sentence').textContent).toBe('All tracks look good.');
    expect(screen.queryByTestId('start-review-btn')).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Step 3: Build your set & Quick set prop
  // ─────────────────────────────────────────────────────────────

  it('navigates to setlist route when clicking "Open My Set"', () => {
    const setRouteMock = vi.fn();
    useAppStore.setState({
      setRoute: setRouteMock,
    });

    render(<StartScreen />);

    const openSetBtn = screen.getByTestId('start-open-set-btn');
    act(() => {
      fireEvent.click(openSetBtn);
    });

    expect(setRouteMock).toHaveBeenCalledWith('setlist');
  });

  it('renders "Quick set" button when onQuickSet prop is passed and triggers callback', () => {
    const onQuickSetMock = vi.fn();
    render(<StartScreen onQuickSet={onQuickSetMock} />);

    const quickSetBtn = screen.getByTestId('start-quick-set-btn');
    expect(quickSetBtn).toBeDefined();

    act(() => {
      fireEvent.click(quickSetBtn);
    });

    expect(onQuickSetMock).toHaveBeenCalledTimes(1);
  });

  it('hides "Quick set" button when onQuickSet prop is not provided', () => {
    render(<StartScreen />);
    expect(screen.queryByTestId('start-quick-set-btn')).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Step 4: Play set (Stage Mode) and Export
  // ─────────────────────────────────────────────────────────────

  it('triggers enterStageMode when clicking "Play set (Stage Mode)" with at least 2 tracks', () => {
    const enterStageModeMock = vi.fn();
    const t1 = makeMockTrack('1');
    const t2 = makeMockTrack('2');

    useAppStore.setState({
      tracks: [t1, t2],
      setlist: [makeMockSetlistEntry(0, t1), makeMockSetlistEntry(1, t2)],
      enterStageMode: enterStageModeMock,
    });

    render(<StartScreen />);

    const playBtn = screen.getByTestId('start-play-stage-btn') as HTMLButtonElement;
    expect(playBtn.disabled).toBe(false);

    act(() => {
      fireEvent.click(playBtn);
    });

    expect(enterStageModeMock).toHaveBeenCalledTimes(1);
  });

  it('triggers onExport prop when clicking Export, or falls back to setRoute("setlist")', () => {
    const setRouteMock = vi.fn();
    const onExportMock = vi.fn();
    const t1 = makeMockTrack('1');
    const t2 = makeMockTrack('2');

    useAppStore.setState({
      tracks: [t1, t2],
      setlist: [makeMockSetlistEntry(0, t1), makeMockSetlistEntry(1, t2)],
      setRoute: setRouteMock,
    });

    // Test with onExport callback
    const { unmount } = render(<StartScreen onExport={onExportMock} />);
    const exportBtn = screen.getByTestId('start-export-btn');
    act(() => {
      fireEvent.click(exportBtn);
    });
    expect(onExportMock).toHaveBeenCalledTimes(1);
    expect(setRouteMock).not.toHaveBeenCalled();

    unmount();

    // Test without onExport callback (fallback to setRoute('setlist'))
    render(<StartScreen />);
    const fallbackExportBtn = screen.getByTestId('start-export-btn');
    act(() => {
      fireEvent.click(fallbackExportBtn);
    });
    expect(setRouteMock).toHaveBeenCalledWith('setlist');
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Focus rings & accessibility
  // ─────────────────────────────────────────────────────────────

  it('includes visible keyboard focus rings on interactive action buttons', () => {
    render(<StartScreen onQuickSet={() => {}} />);

    const scanBtn = screen.getByTestId('start-scan-btn');
    const openSetBtn = screen.getByTestId('start-open-set-btn');
    const quickSetBtn = screen.getByTestId('start-quick-set-btn');

    expect(scanBtn.className).toContain('focus-visible:ring-2');
    expect(scanBtn.className).toContain('focus-visible:ring-[#38bdf8]');
    expect(openSetBtn.className).toContain('focus-visible:ring-2');
    expect(openSetBtn.className).toContain('focus-visible:ring-[#38bdf8]');
    expect(quickSetBtn.className).toContain('focus-visible:ring-2');
    expect(quickSetBtn.className).toContain('focus-visible:ring-[#38bdf8]');
  });
});
