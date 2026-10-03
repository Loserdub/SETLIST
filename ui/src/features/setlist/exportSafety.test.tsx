import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SetlistView } from './SetlistView';
import { useAppStore } from '../../store/useAppStore';
import { mockBackend, type Backend } from '../../api';
import type { ExportResult } from '../../bindings/ExportResult';

describe('Export Safety & Structured Result Regression Tests', () => {
  beforeEach(async () => {
    const tracks = await mockBackend.listTracks();
    const track1 = tracks[0];
    const track2 = tracks[1];

    useAppStore.setState({
      setlist: [
        {
          position: 1,
          track_id: track1.id,
          track: track1,
          transition: null,
          target_energy: 7,
        },
        {
          position: 2,
          track_id: track2.id,
          track: track2,
          transition: null,
          target_energy: 8,
        },
      ],
      tracks,
      energyProfile: 'LinearRamp',
      pins: { lockFirst: false, lockLast: false },
      toasts: [],
    });
  });

  it('returns structured ExportResult and shows path, format, and track count', async () => {
    const mockExportResult: ExportResult = {
      path: 'C:/exports/my_set.xml',
      format: 'RekordboxXml',
      track_count: 2,
    };

    const backend: Partial<Backend> = {
      listTracks: vi.fn().mockResolvedValue([]),
      exportSet: vi.fn().mockResolvedValue(mockExportResult),
    };

    render(<SetlistView customBackend={backend as Backend} />);

    // Click quick export
    const exportBtn = screen.getByRole('button', { name: /^export$/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(backend.exportSet).toHaveBeenCalledWith(
        expect.any(Array),
        'RekordboxXml',
        undefined,
        false
      );
      expect(screen.getByText(/✓ Exported 2 tracks to RekordboxXml/)).toBeDefined();
    });
  });

  it('allows opening export modal, specifying custom destination, and cancelling without export', async () => {
    const backend: Partial<Backend> = {
      listTracks: vi.fn().mockResolvedValue([]),
      exportSet: vi.fn().mockResolvedValue({
        path: 'C:/custom/path.m3u8',
        format: 'M3u8',
        track_count: 2,
      }),
    };

    render(<SetlistView customBackend={backend as Backend} />);

    // Open export options modal
    const optionsBtn = screen.getByLabelText('Export options');
    fireEvent.click(optionsBtn);

    expect(screen.getByText('Export Setlist')).toBeDefined();
    expect(screen.getByLabelText('Custom Destination Path (optional)')).toBeDefined();

    // Click Cancel
    const cancelBtn = screen.getByRole('button', { name: /^cancel$/i });
    fireEvent.click(cancelBtn);

    // Modal should be closed and exportSet should NOT have been called
    expect(screen.queryByText('Export Setlist')).toBeNull();
    expect(backend.exportSet).not.toHaveBeenCalled();
  });

  it('exports with custom destination path and explicit overwrite when enabled in modal', async () => {
    const mockExportResult: ExportResult = {
      path: 'D:/Sets/festival2026.m3u8',
      format: 'M3u8',
      track_count: 2,
    };

    const backend: Partial<Backend> = {
      listTracks: vi.fn().mockResolvedValue([]),
      exportSet: vi.fn().mockResolvedValue(mockExportResult),
    };

    render(<SetlistView customBackend={backend as Backend} />);

    // Open export modal
    fireEvent.click(screen.getByLabelText('Export options'));

    // Change format to M3U8
    const formatSelect = screen.getByLabelText('Format');
    fireEvent.change(formatSelect, { target: { value: 'M3u8' } });

    // Enter custom destination path
    const pathInput = screen.getByLabelText('Custom Destination Path (optional)');
    fireEvent.change(pathInput, { target: { value: 'D:/Sets/festival2026.m3u8' } });

    // Check overwrite checkbox
    const overwriteCheckbox = screen.getByLabelText('Overwrite destination file if it already exists');
    fireEvent.click(overwriteCheckbox);

    // Click Export inside modal
    const exportModalBtn = screen.getByRole('button', { name: /confirm export/i });
    fireEvent.click(exportModalBtn);

    await waitFor(() => {
      expect(backend.exportSet).toHaveBeenCalledWith(
        expect.any(Array),
        'M3u8',
        'D:/Sets/festival2026.m3u8',
        true
      );
      expect(screen.getByText(/✓ Exported 2 tracks to M3u8 \(D:\/Sets\/festival2026\.m3u8\)/)).toBeDefined();
    });
  });

  it('displays error in UI when destination file already exists and overwrite is false', async () => {
    const backend: Partial<Backend> = {
      listTracks: vi.fn().mockResolvedValue([]),
      exportSet: vi.fn().mockRejectedValue(new Error('Destination file already exists: C:/setlist.xml')),
    };

    render(<SetlistView customBackend={backend as Backend} />);

    // Open export options
    fireEvent.click(screen.getByLabelText('Export options'));

    // Click Confirm export without overwrite
    fireEvent.click(screen.getByRole('button', { name: /confirm export/i }));

    await waitFor(() => {
      expect(screen.getByText(/⚠️ Destination file already exists: C:\/setlist\.xml/)).toBeDefined();
    });
  });
});
