import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { IngestionInstrumentDisplay } from './IngestionInstrumentDisplay';
import { ScanReportModal } from './ScanReportModal';
import { TrackInspectionDrawer } from './TrackInspectionDrawer';
import { EmptyLibraryView } from './EmptyLibraryView';
import { LibraryView } from './LibraryView';
import { useAppStore } from '../../store/useAppStore';
import { generateMockTracks } from './mock5000';
import type { ProgressEvent } from '../../api';
import type { ScanSummary } from '../diagnostics/scanSummary';

describe('Workgroup 3: Library & Ingestion Experience', () => {
  describe('IngestionInstrumentDisplay', () => {
    it('renders hardware-style instrument telemetry instead of generic spinner', () => {
      const progress: ProgressEvent = {
        stage: 'analyzing',
        current: 127,
        total: 184,
        message: 'Reading spectrogram FFT frames...',
        bpm: 126.4,
        key: 'A minor',
        camelot: '8A',
        energy: 7,
        lufs: -8.4,
      };

      const handleCancel = vi.fn();
      const handleOpenReport = vi.fn();

      render(
        <IngestionInstrumentDisplay
          progress={progress}
          onCancel={handleCancel}
          onOpenReport={handleOpenReport}
          skippedCount={12}
          failedCount={2}
        />
      );

      // Instrument beacon and stage
      expect(screen.getByText('[ INGESTION ENGINE ]')).toBeDefined();
      expect(screen.getByText('127 / 184')).toBeDefined();

      // Telemetry gauges
      expect(screen.getByText('126.4')).toBeDefined();
      expect(screen.getByText(/A MINOR/i)).toBeDefined();
      expect(screen.getByText('8A')).toBeDefined();
      expect(screen.getByText('7.0')).toBeDefined();
      expect(screen.getByText('-8.4 dB')).toBeDefined();

      // Duplicate and failure counters
      expect(screen.getByText(/DUPLICATES:/i)).toBeDefined();
      expect(screen.getByText('12')).toBeDefined();
      expect(screen.getByText(/FAILED:/i)).toBeDefined();
      expect(screen.getByText('2')).toBeDefined();

      // Abort action
      const abortBtn = screen.getByRole('button', { name: /abort/i });
      fireEvent.click(abortBtn);
      expect(handleCancel).toHaveBeenCalledTimes(1);

      // Report action
      const reportBtn = screen.getByRole('button', { name: /view report/i });
      fireEvent.click(reportBtn);
      expect(handleOpenReport).toHaveBeenCalledTimes(1);
    });
  });

  describe('ScanReportModal', () => {
    const summary: ScanSummary = {
      analyzed: 45,
      skipped: 8,
      failed: 2,
      totalFound: 55,
      failedFiles: [
        {
          path: '/audio/corrupt_header.wav',
          fileName: 'corrupt_header.wav',
          reason: 'RIFF chunk size mismatch / corrupt container',
          rawError: 'Corrupt header',
        },
        {
          path: '/audio/unsupported_codec.xyz',
          fileName: 'unsupported_codec.xyz',
          reason: 'Unsupported codec',
          rawError: 'No decoder registered',
        },
      ],
      completedAt: '12:00:00',
    };

    it('renders failed files and duplicate skip diagnostics', () => {
      const handleClose = vi.fn();
      render(
        <ScanReportModal
          summary={summary}
          isOpen={true}
          onClose={handleClose}
        />
      );

      expect(screen.getByText('Ingestion & Diagnostics Report')).toBeDefined();
      expect(screen.getByText('corrupt_header.wav')).toBeDefined();
      expect(screen.getByText('unsupported_codec.xyz')).toBeDefined();

      // Switch to duplicates tab
      const dupTab = screen.getByRole('button', { name: /duplicates skipped/i });
      fireEvent.click(dupTab);
      expect(screen.getByText(/Intelligent Duplicate Prevention/i)).toBeDefined();
      expect(screen.getByText(/BLAKE3 content hash/i)).toBeDefined();

      // Close modal
      const closeBtn = screen.getByRole('button', { name: /close report/i });
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('TrackInspectionDrawer', () => {
    it('renders acoustics, harmonics, structure and hot cues for inspected track', () => {
      const mockTrack = generateMockTracks(1)[0];
      const handleClose = vi.fn();
      const handleOpenDetail = vi.fn();

      render(
        <TrackInspectionDrawer
          track={mockTrack}
          isOpen={true}
          onClose={handleClose}
          onOpenFullDetail={handleOpenDetail}
        />
      );

      expect(screen.getByTestId('track-inspection-drawer')).toBeDefined();
      expect(screen.getByText('● TRACK INSPECTOR')).toBeDefined();
      expect(screen.getByText('ACOUSTICS & HARMONICS')).toBeDefined();
      expect(screen.getByText('STRUCTURAL SEGMENTS (0)')).toBeDefined();

      // Audition button in inspector
      expect(screen.getByTestId('inspector-audition-btn')).toBeDefined();

      // Close on close button
      const closeBtn = screen.getByRole('button', { name: /close inspector/i });
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('EmptyLibraryView', () => {
    it('renders boutique empty state with 4-step pipeline and ingestion actions', () => {
      const handleChooseFolder = vi.fn();
      const handleScanFolder = vi.fn();
      const handleLoadDemo = vi.fn();
      const handleLoadBenchmark = vi.fn();

      render(
        <EmptyLibraryView
          onChooseFolder={handleChooseFolder}
          onScanFolder={handleScanFolder}
          onLoadDemo={handleLoadDemo}
          onLoadBenchmark={handleLoadBenchmark}
          isLoading={false}
        />
      );

      expect(screen.getByText('STANDBY · READY FOR INGESTION')).toBeDefined();
      expect(screen.getByText('1. DROP AUDIO')).toBeDefined();
      expect(screen.getByText('2. ANALYZE DSP')).toBeDefined();
      expect(screen.getByText('3. UNDERSTAND')).toBeDefined();
      expect(screen.getByText('4. CATALOG')).toBeDefined();

      const chooseFolderBtn = screen.getByTestId('empty-choose-folder-btn');
      fireEvent.click(chooseFolderBtn);
      expect(handleChooseFolder).toHaveBeenCalledTimes(1);
    });
  });

  describe('LibraryView Inspection Drawer Integration', () => {
    it('toggles inspection drawer via INSPECT button in table row', () => {
      useAppStore.setState({
        currentRoute: 'library',
        tracks: generateMockTracks(5),
        selectedTrackId: null,
        selectedTrack: null,
        setlist: [],
        isLoadingTracks: false,
        hasLoadedTracks: true,
        tracksError: null,
        progress: null,
      });

      render(<LibraryView />);

      const inspectBtn = screen.getByTestId('inspect-btn-mock-track-1');
      expect(inspectBtn).toBeDefined();

      // Drawer should not be open yet
      expect(screen.queryByTestId('track-inspection-drawer')).toBeNull();

      // Click INSPECT button
      act(() => {
        fireEvent.click(inspectBtn);
      });

      // Drawer should now be visible
      expect(screen.getByTestId('track-inspection-drawer')).toBeDefined();
      expect(screen.getAllByText(/Horizon Echoes #1/i).length).toBeGreaterThanOrEqual(2);

      // Click INSPECT button again to close
      act(() => {
        fireEvent.click(screen.getByTestId('inspect-btn-mock-track-1'));
      });
      expect(screen.queryByTestId('track-inspection-drawer')).toBeNull();
    });
  });
});
