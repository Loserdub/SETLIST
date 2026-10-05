import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FinalDeliveryModal } from './FinalDeliveryModal';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { Track } from '../../bindings/Track';
import type { ExportResult } from '../../bindings/ExportResult';

function makeMockTrack(id: string, bpm: number, camelot: string, durationMs = 180000): Track {
  return {
    id,
    path: `C:/music/${id}.wav`,
    hash: `hash_${id}`,
    duration_ms: durationMs,
    analysis: {
      rhythm: {
        grid: {
          bpm,
          confidence: 0.95,
          first_downbeat_ms: 0,
          downbeat_period_ms: 2000,
          downbeat_count: 90,
          beat_count: 360,
        },
        beats: [0, 500, 1000, 1500, 2000],
        downbeats: [0, 2000],
        syncopation: 0.2,
      },
      key: {
        root: 'C',
        mode: 'minor',
        camelot: {
          number: parseInt(camelot.slice(0, -1), 10),
          letter: camelot.slice(-1) as 'A' | 'B',
        },
        confidence: 0.9,
      },
      loudness: {
        integrated_lufs: -8,
        loudness_range_lu: 4,
      },
      dynamics: {
        spectral_centroid: 2000,
        spectral_rolloff: 4000,
        energy_mean: 0.7,
        energy_std: 0.1,
      },
      energy_score: 7,
      energy_curve: {
        bar_energies: [7, 7, 8, 8],
      },
      segments: [],
      cue_points: [
        { index: 0, time_ms: 1000, label: 'Intro', color_hex: '#38bdf8', kind: 'HotCue', loop_end_ms: null },
        { index: 2, time_ms: 30000, label: 'Breakdown', color_hex: '#10b981', kind: 'HotCue', loop_end_ms: null },
        { index: 3, time_ms: 60000, label: 'Drop', color_hex: '#f59e0b', kind: 'HotCue', loop_end_ms: null },
        { index: 6, time_ms: 150000, label: 'Mix Out', color_hex: '#a855f7', kind: 'HotCue', loop_end_ms: null },
      ],
      waveform: {
        low: [],
        mid: [],
        high: [],
      },
    },
    analyzed_at: '2026-10-05T00:00:00Z',
    analysis_version: '1.0.0',
    tags: {
      title: `Track ${id}`,
      artist: 'Resident Producer',
      album: 'Test EP',
      genre: 'Techno',
      year: 2026,
    },
  } as unknown as Track;
}

function makeSetlist(tracks: Track[]): SetlistEntry[] {
  return tracks.map((t, idx) => ({
    position: idx + 1,
    track_id: t.id,
    track: t,
    transition: null,
    target_energy: 7,
  }));
}

describe('FinalDeliveryModal — Premium Finalization & Delivery Experience', () => {
  it('renders hardware cockpit telemetry and READY FOR PERFORMANCE header', () => {
    const t1 = makeMockTrack('t1', 126, '8A', 180000);
    const t2 = makeMockTrack('t2', 128, '8A', 200000);
    const t3 = makeMockTrack('t3', 130, '9A', 220000);
    const setlist = makeSetlist([t1, t2, t3]);

    render(
      <FinalDeliveryModal
        isOpen={true}
        onClose={vi.fn()}
        setlist={setlist}
        setlistName="MAIN STAGE CLOSING SET"
        isExporting={false}
        onExport={vi.fn()}
      />
    );

    // Header badge & set title
    expect(screen.getByTestId('delivery-ready-badge').textContent).toContain('READY FOR PERFORMANCE');
    expect(screen.getByTestId('delivery-set-title').textContent).toContain('MAIN STAGE CLOSING SET');

    // Telemetry strip
    const hud = screen.getByTestId('delivery-telemetry-hud');
    expect(hud.textContent).toContain('00:10:00'); // 180 + 200 + 220 = 600s = 10m
    expect(hud.textContent).toContain('3 TRACKS');
    expect(hud.textContent).toContain('126–130 BPM');
    expect(hud.textContent).toContain('2 TRANSITIONS');
    expect(hud.textContent).toContain('4 CUES / TRACK');

    // Hardware export pads
    expect(screen.getByTestId('export-rekordbox-btn').textContent).toContain('[EXPORT REKORDBOX]');
    expect(screen.getByTestId('export-playlist-btn').textContent).toContain('[EXPORT PLAYLIST]');
    expect(screen.getByTestId('export-stage-sheet-btn').textContent).toContain('[EXPORT STAGE SHEET]');
  });

  it('triggers hardware one-touch exports with appropriate formats and options', async () => {
    const t1 = makeMockTrack('t1', 126, '8A');
    const t2 = makeMockTrack('t2', 128, '8A');
    const setlist = makeSetlist([t1, t2]);
    const mockOnExport = vi.fn().mockResolvedValue({
      path: 'C:/exports/setlist.xml',
      format: 'RekordboxXml',
      track_count: 2,
    });

    render(
      <FinalDeliveryModal
        isOpen={true}
        onClose={vi.fn()}
        setlist={setlist}
        setlistName="FESTIVAL SET"
        isExporting={false}
        onExport={mockOnExport}
      />
    );

    // Click [EXPORT REKORDBOX]
    fireEvent.click(screen.getByTestId('export-rekordbox-btn'));
    await waitFor(() => {
      expect(mockOnExport).toHaveBeenCalledWith('RekordboxXml', undefined, false);
    });

    // Click [EXPORT PLAYLIST]
    fireEvent.click(screen.getByTestId('export-playlist-btn'));
    await waitFor(() => {
      expect(mockOnExport).toHaveBeenCalledWith('M3u8', undefined, false);
    });

    // Click [EXPORT STAGE SHEET]
    fireEvent.click(screen.getByTestId('export-stage-sheet-btn'));
    await waitFor(() => {
      expect(mockOnExport).toHaveBeenCalledWith('SetSheetMarkdown', undefined, false);
    });
  });

  it('supports custom destination path and overwrite toggle in hardware export flow', async () => {
    const t1 = makeMockTrack('t1', 126, '8A');
    const t2 = makeMockTrack('t2', 128, '8A');
    const setlist = makeSetlist([t1, t2]);
    const mockOnExport = vi.fn().mockResolvedValue({
      path: 'D:/Sets/CustomOutput.xml',
      format: 'RekordboxXml',
      track_count: 2,
    });

    render(
      <FinalDeliveryModal
        isOpen={true}
        onClose={vi.fn()}
        setlist={setlist}
        setlistName="HEADLINER"
        isExporting={false}
        onExport={mockOnExport}
      />
    );

    // Type custom path
    const pathInput = screen.getByLabelText('Custom Destination Path (optional)');
    fireEvent.change(pathInput, { target: { value: 'D:/Sets/CustomOutput.xml' } });

    // Enable overwrite
    const overwriteCheckbox = screen.getByLabelText('Overwrite destination file if it already exists');
    fireEvent.click(overwriteCheckbox);

    // Click [EXPORT REKORDBOX]
    fireEvent.click(screen.getByTestId('export-rekordbox-btn'));
    await waitFor(() => {
      expect(mockOnExport).toHaveBeenCalledWith('RekordboxXml', 'D:/Sets/CustomOutput.xml', true);
    });
  });

  it('displays authentic verification checklist and updates export check upon completion', async () => {
    const t1 = makeMockTrack('t1', 126, '8A');
    const t2 = makeMockTrack('t2', 128, '8A');
    const setlist = makeSetlist([t1, t2]);

    const { rerender } = render(
      <FinalDeliveryModal
        isOpen={true}
        onClose={vi.fn()}
        setlist={setlist}
        setlistName="RADIO SHOW"
        isExporting={false}
        onExport={vi.fn()}
        lastExportResult={null}
      />
    );

    // Pre-export verification check states
    expect(screen.getByTestId('check-tracks_available').textContent).toContain('PASS');
    expect(screen.getByTestId('check-metadata_complete').textContent).toContain('PASS');
    expect(screen.getByTestId('check-cue_points_present').textContent).toContain('PASS');
    expect(screen.getByTestId('check-sequence_valid').textContent).toContain('PASS');
    expect(screen.getByTestId('check-export_generated').textContent).toContain('PENDING');

    // Simulate export completion
    const exportResult: ExportResult = {
      path: 'C:/exports/radio.xml',
      format: 'RekordboxXml',
      track_count: 2,
    };

    rerender(
      <FinalDeliveryModal
        isOpen={true}
        onClose={vi.fn()}
        setlist={setlist}
        setlistName="RADIO SHOW"
        isExporting={false}
        onExport={vi.fn()}
        lastExportResult={exportResult}
      />
    );

    expect(screen.getByTestId('check-export_generated').textContent).toContain('PASS');
    expect(screen.getByTestId('delivery-success-message').textContent).toContain(
      'Exported 2 tracks to RekordboxXml (C:/exports/radio.xml)'
    );
  });

  it('honors rule: do not claim verification that the software does not perform', () => {
    const t1 = makeMockTrack('t1', 126, '8A');
    // Track 2 missing title and cues
    const t2 = makeMockTrack('t2', 128, '8A');
    t2.tags = {
      title: '',
      artist: '',
      album: null,
    };
    if (t2.analysis) {
      t2.analysis.cue_points = [];
      // Also empty grid downbeat to avoid synthetic cue fallback
      t2.analysis.rhythm.grid.first_downbeat_ms = -1;
    }

    const setlist = makeSetlist([t1, t2]);

    render(
      <FinalDeliveryModal
        isOpen={true}
        onClose={vi.fn()}
        setlist={setlist}
        setlistName="UNFINISHED SET"
        isExporting={false}
        onExport={vi.fn()}
      />
    );

    // Metadata check should WARN, not falsely claim PASS
    const metaCheck = screen.getByTestId('check-metadata_complete');
    expect(metaCheck.textContent).toContain('WARN');
    expect(metaCheck.textContent).toContain('missing BPM or key');

    // Cue check should WARN, not falsely claim PASS
    const cueCheck = screen.getByTestId('check-cue_points_present');
    expect(cueCheck.textContent).toContain('WARN');
    expect(cueCheck.textContent).toContain('unanalyzed cues');
  });

  it('launches stage mode handoff when [ENTER STAGE MODE →] is clicked', () => {
    const t1 = makeMockTrack('t1', 126, '8A');
    const t2 = makeMockTrack('t2', 128, '8A');
    const setlist = makeSetlist([t1, t2]);
    const mockOnClose = vi.fn();
    const mockLaunchStage = vi.fn();

    render(
      <FinalDeliveryModal
        isOpen={true}
        onClose={mockOnClose}
        setlist={setlist}
        setlistName="LIVE GIG"
        isExporting={false}
        onExport={vi.fn()}
        onLaunchStageMode={mockLaunchStage}
      />
    );

    const stageBtn = screen.getByTestId('delivery-launch-stage-btn');
    fireEvent.click(stageBtn);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockLaunchStage).toHaveBeenCalledTimes(1);
  });
});
