import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  createEmptyScanSummary,
  parseScanMessage,
  recordScanMessage,
  formatFailedFilesText,
  copyFailedFilesList,
  type ScanSummary,
} from './scanSummary';
import { ScanSummaryPanel } from './ScanSummaryPanel';

describe('scan summary logic (scanSummary.ts)', () => {
  it('parses scanner progress messages accurately', () => {
    const res1 = parseScanMessage('Completed track_01.mp3');
    expect(res1.type).toBe('analyzed');
    expect(res1.fileName).toBe('track_01.mp3');

    const res2 = parseScanMessage('Skipped (already analyzed) song_b.flac');
    expect(res2.type).toBe('skipped');
    expect(res2.fileName).toBe('song_b.flac');

    const res3 = parseScanMessage('Failed corrupted.wav: file could not be decoded');
    expect(res3.type).toBe('failed');
    expect(res3.fileName).toBe('corrupted.wav');
    expect(res3.error).toBe('file could not be decoded');

    const res4 = parseScanMessage('Analyzing something else...');
    expect(res4.type).toBe('other');
  });

  it('accumulates analyzed, skipped, and failed items with plain reasons', () => {
    let summary = createEmptyScanSummary();
    summary = recordScanMessage(summary, 'Completed 01.mp3');
    summary = recordScanMessage(summary, 'Completed 02.mp3');
    summary = recordScanMessage(summary, 'Skipped (already analyzed) 03.mp3');
    summary = recordScanMessage(summary, 'Failed broken.wav: file could not be decoded');
    summary = recordScanMessage(summary, 'Failed test.xyz: unsupported audio format');

    expect(summary.analyzed).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(2);
    expect(summary.failedFiles.length).toBe(2);

    expect(summary.failedFiles[0].fileName).toBe('broken.wav');
    expect(summary.failedFiles[0].reason).toContain('File could not be decoded');

    expect(summary.failedFiles[1].fileName).toBe('test.xyz');
    expect(summary.failedFiles[1].reason).toContain('Unsupported audio format');
  });

  it('formats failed files text for clipboard copy', () => {
    const failedFiles = [
      {
        fileName: 'bad.mp3',
        path: 'C:/Music/bad.mp3',
        reason: 'File could not be decoded.',
        rawError: 'decode error',
      },
    ];

    const formatted = formatFailedFilesText(failedFiles);
    expect(formatted).toContain('=== SETLIST Failed Files Report (1) ===');
    expect(formatted).toContain('1. bad.mp3');
    expect(formatted).toContain('Reason: File could not be decoded.');
    expect(formatted).toContain('Technical detail: decode error');
  });

  it('copies failed files list to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const failedFiles = [
      {
        fileName: 'unsupported.ogg',
        path: 'D:/Music/unsupported.ogg',
        reason: 'Unsupported audio format.',
      },
    ];

    const ok = await copyFailedFilesList(failedFiles);
    expect(ok).toBe(true);
    expect(writeTextMock).toHaveBeenCalled();
    expect(writeTextMock.mock.calls[0][0]).toContain('unsupported.ogg');
  });
});

describe('ScanSummaryPanel UI Component', () => {
  it('renders analyzed, skipped, and failed metrics', () => {
    const mockSummary: ScanSummary = {
      analyzed: 14,
      skipped: 26,
      failed: 2,
      totalFound: 42,
      failedFiles: [
        {
          fileName: 'damaged.wav',
          path: 'C:/Music/damaged.wav',
          reason: 'File could not be decoded. Check that the file is not corrupt.',
          rawError: 'corrupt header',
        },
        {
          fileName: 'audio.wma',
          path: 'C:/Music/audio.wma',
          reason: 'Unsupported audio format. Use MP3, WAV, FLAC, AIFF, or AAC.',
        },
      ],
    };

    render(<ScanSummaryPanel summary={mockSummary} />);

    expect(screen.getByTestId('scan-summary-panel')).toBeDefined();
    expect(screen.getByTestId('count-analyzed').textContent).toBe('14');
    expect(screen.getByTestId('count-skipped').textContent).toBe('26');
    expect(screen.getByTestId('count-failed').textContent).toBe('2');

    expect(screen.getByText('damaged.wav')).toBeDefined();
    expect(screen.getByText(/File could not be decoded/)).toBeDefined();
    expect(screen.getByText('audio.wma')).toBeDefined();
    expect(screen.getByText(/Unsupported audio format/)).toBeDefined();

    expect(screen.getByTestId('copy-failed-list-btn')).toBeDefined();
  });

  it('triggers copy list button on click', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const mockSummary: ScanSummary = {
      analyzed: 5,
      skipped: 0,
      failed: 1,
      totalFound: 6,
      failedFiles: [
        {
          fileName: 'error.mp3',
          path: 'C:/Music/error.mp3',
          reason: 'File could not be decoded.',
        },
      ],
    };

    render(<ScanSummaryPanel summary={mockSummary} />);
    const copyBtn = screen.getByTestId('copy-failed-list-btn');
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalled();
  });

  it('renders clean success state when zero files failed', () => {
    const mockSummary: ScanSummary = {
      analyzed: 40,
      skipped: 0,
      failed: 0,
      totalFound: 40,
      failedFiles: [],
    };

    render(<ScanSummaryPanel summary={mockSummary} />);
    expect(screen.getByTestId('count-failed').textContent).toBe('0');
    expect(screen.getByText(/All scanned files were processed successfully/)).toBeDefined();
    expect(screen.queryByTestId('copy-failed-list-btn')).toBeNull();
  });
});
