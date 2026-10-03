import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { LibraryView } from './library/LibraryView';
import {
  SetlistView,
  getDefaultExportFileName,
  getExportDialogFilters,
} from './setlist/SetlistView';
import { useAppStore } from '../store/useAppStore';
import { mockBackend, type Backend } from '../api';
import type { ExportResult } from '../bindings/ExportResult';

// Mock @tauri-apps/plugin-dialog
const mockOpen = vi.fn();
const mockSave = vi.fn();

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => mockOpen(...args),
  save: (...args: unknown[]) => mockSave(...args),
}));

describe('Native Dialogs and Path Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      currentRoute: 'library',
      tracks: [],
      selectedTrackId: null,
      selectedTrack: null,
      setlist: [],
      isLoadingTracks: false,
      tracksError: null,
      progress: null,
      toasts: [],
      pins: { lockFirst: false, lockLast: false },
    });
  });

  describe('Default export file names and filters', () => {
    it('generates correct default file names per format', () => {
      expect(getDefaultExportFileName('RekordboxXml')).toBe('setlist_rekordbox.xml');
      expect(getDefaultExportFileName('M3u8')).toBe('setlist_playlist.m3u8');
      expect(getDefaultExportFileName('SetSheetCsv')).toBe('setlist_sheet.csv');
      expect(getDefaultExportFileName('SetSheetMarkdown')).toBe('setlist_sheet.md');
    });

    it('generates correct file filters per format', () => {
      expect(getExportDialogFilters('RekordboxXml')).toEqual([
        { name: 'Rekordbox XML', extensions: ['xml'] },
      ]);
      expect(getExportDialogFilters('M3u8')).toEqual([
        { name: 'M3U8 Playlist', extensions: ['m3u8'] },
      ]);
      expect(getExportDialogFilters('SetSheetCsv')).toEqual([
        { name: 'CSV Set Sheet', extensions: ['csv'] },
      ]);
      expect(getExportDialogFilters('SetSheetMarkdown')).toEqual([
        { name: 'Markdown Set Sheet', extensions: ['md'] },
      ]);
    });
  });

  describe('LibraryView Choose Folder Dialog', () => {
    it('opens native folder picker and updates path input on selection', async () => {
      mockOpen.mockResolvedValueOnce('D:/DJ_Music/Crates');

      render(<LibraryView />);

      const chooseBtn = screen.getByRole('button', { name: /choose folder/i });
      const input = screen.getByPlaceholderText(/choose folder or paste path\.\.\./i) as HTMLInputElement;

      expect(input.value).toBe('');

      await act(async () => {
        fireEvent.click(chooseBtn);
      });

      expect(mockOpen).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: 'Choose Music Folder',
      });
      expect(input.value).toBe('D:/DJ_Music/Crates');
    });

    it('does not change path input when user cancels the folder picker', async () => {
      mockOpen.mockResolvedValueOnce(null);

      render(<LibraryView />);

      const chooseBtn = screen.getByRole('button', { name: /choose folder/i });
      const input = screen.getByPlaceholderText(/choose folder or paste path\.\.\./i) as HTMLInputElement;

      // Manually set initial input
      fireEvent.change(input, { target: { value: 'E:/Initial/Path' } });
      expect(input.value).toBe('E:/Initial/Path');

      await act(async () => {
        fireEvent.click(chooseBtn);
      });

      expect(mockOpen).toHaveBeenCalled();
      expect(input.value).toBe('E:/Initial/Path');
    });
  });

  describe('SetlistView Export Save Dialog', () => {
    beforeEach(async () => {
      const tracks = await mockBackend.listTracks();
      useAppStore.setState({
        setlist: [
          {
            position: 1,
            track_id: tracks[0].id,
            track: tracks[0],
            transition: null,
            target_energy: 6,
          },
          {
            position: 2,
            track_id: tracks[1].id,
            track: tracks[1],
            transition: null,
            target_energy: 8,
          },
        ],
        tracks,
      });
    });

    it('uses native save dialog with format-based default filename and passes outputPath', async () => {
      mockSave.mockResolvedValueOnce('C:/Exports/festival_2026.xml');

      const mockExportResult: ExportResult = {
        path: 'C:/Exports/festival_2026.xml',
        format: 'RekordboxXml',
        track_count: 2,
      };

      const backend: Partial<Backend> = {
        listTracks: vi.fn().mockResolvedValue([]),
        exportSet: vi.fn().mockResolvedValue(mockExportResult),
      };

      render(<SetlistView customBackend={backend as Backend} />);

      const exportBtn = screen.getByRole('button', { name: /^export$/i });
      await act(async () => {
        fireEvent.click(exportBtn);
      });

      expect(mockSave).toHaveBeenCalledWith({
        defaultPath: 'setlist_rekordbox.xml',
        filters: [{ name: 'Rekordbox XML', extensions: ['xml'] }],
        title: 'Export Setlist',
      });

      await waitFor(() => {
        expect(backend.exportSet).toHaveBeenCalledWith(
          expect.any(Array),
          'RekordboxXml',
          'C:/Exports/festival_2026.xml',
          false
        );
      });
    });

    it('aborts export cleanly when user cancels the save dialog', async () => {
      mockSave.mockResolvedValueOnce(null);

      const backend: Partial<Backend> = {
        listTracks: vi.fn().mockResolvedValue([]),
        exportSet: vi.fn(),
      };

      render(<SetlistView customBackend={backend as Backend} />);

      const exportBtn = screen.getByRole('button', { name: /^export$/i });
      await act(async () => {
        fireEvent.click(exportBtn);
      });

      expect(mockSave).toHaveBeenCalled();
      expect(backend.exportSet).not.toHaveBeenCalled();
    });

    it('supports Browse button in export modal to choose save path', async () => {
      mockSave.mockResolvedValueOnce('D:/Backups/set.m3u8');

      const mockExportResult: ExportResult = {
        path: 'D:/Backups/set.m3u8',
        format: 'M3u8',
        track_count: 2,
      };

      const backend: Partial<Backend> = {
        listTracks: vi.fn().mockResolvedValue([]),
        exportSet: vi.fn().mockResolvedValue(mockExportResult),
      };

      render(<SetlistView customBackend={backend as Backend} />);

      // Open export options
      fireEvent.click(screen.getByLabelText('Export options'));

      // Select M3U8 format
      fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'M3u8' } });

      // Click Browse... button
      const browseBtn = screen.getByRole('button', { name: /browse\.\.\./i });
      await act(async () => {
        fireEvent.click(browseBtn);
      });

      expect(mockSave).toHaveBeenCalledWith({
        defaultPath: 'setlist_playlist.m3u8',
        filters: [{ name: 'M3U8 Playlist', extensions: ['m3u8'] }],
        title: 'Save Export As',
      });

      const pathInput = screen.getByLabelText('Custom Destination Path (optional)') as HTMLInputElement;
      expect(pathInput.value).toBe('D:/Backups/set.m3u8');

      // Click Confirm Export
      fireEvent.click(screen.getByRole('button', { name: /confirm export/i }));

      await waitFor(() => {
        expect(backend.exportSet).toHaveBeenCalledWith(
          expect.any(Array),
          'M3u8',
          'D:/Backups/set.m3u8',
          false
        );
      });
    });
  });
});
