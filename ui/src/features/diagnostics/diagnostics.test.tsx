import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  formatDiagnosticsReport,
  sanitizeDiagnosticPath,
  isPathInsideAppData,
  copyDiagnosticsReport,
  type DiagnosticsInfo,
} from './diagnosticsClient';
import { DiagnosticsHelpPanel } from './DiagnosticsHelpPanel';

describe('Diagnostics & Secrets Redaction (diagnosticsClient.ts)', () => {
  const sampleInfo: DiagnosticsInfo = {
    app_version: '0.1.0',
    log_file_path: 'C:/Users/DJUser/AppData/Roaming/com.setlist.desktop/setlist.log',
    database_path: 'C:/Users/DJUser/AppData/Roaming/com.setlist.desktop/library.db',
    track_count: 85,
    app_data_dir: 'C:/Users/DJUser/AppData/Roaming/com.setlist.desktop',
    os: 'windows',
    arch: 'x86_64',
  };

  it('diagnostics text contains no secrets, audio data, waveforms, or cue points', () => {
    const report = formatDiagnosticsReport(sampleInfo, false);

    // Verified presence of safe system metrics
    expect(report).toContain('App Version: 0.1.0');
    expect(report).toContain('Track Count: 85');
    expect(report).toContain('Operating System: windows (x86_64)');
    expect(report).toContain('Log File Path:');
    expect(report).toContain('Database Path:');

    // Strictly forbidden: audio data, DSP arrays, waveform points, beat grids, cues
    expect(report.toLowerCase()).not.toContain('waveform');
    expect(report.toLowerCase()).not.toContain('low_peak');
    expect(report.toLowerCase()).not.toContain('mid_peak');
    expect(report.toLowerCase()).not.toContain('high_peak');
    expect(report.toLowerCase()).not.toContain('pcm');
    expect(report.toLowerCase()).not.toContain('samples');
    expect(report.toLowerCase()).not.toContain('cue_point');
    expect(report.toLowerCase()).not.toContain('beat_grid');
    expect(report.toLowerCase()).not.toContain('downbeat');
    expect(report.toLowerCase()).not.toContain('artist');
    expect(report.toLowerCase()).not.toContain('title');
  });

  it('redacts paths outside app data folder when includePaths is false', () => {
    const externalPath = 'E:/PrivateAudioLibrary/SecretUnreleasedTrack.mp3';
    const appData = 'C:/Users/DJUser/AppData/Roaming/com.setlist.desktop';

    // Outside app data -> redacted
    const sanitizedExternal = sanitizeDiagnosticPath(externalPath, appData, false);
    expect(sanitizedExternal).toBe('[path outside app data redacted]');

    // Inside app data -> allowed
    const internalLog = 'C:/Users/DJUser/AppData/Roaming/com.setlist.desktop/setlist.log';
    expect(isPathInsideAppData(internalLog, appData)).toBe(true);
    expect(isPathInsideAppData(externalPath, appData)).toBe(false);
    const sanitizedInternal = sanitizeDiagnosticPath(internalLog, appData, false);
    expect(sanitizedInternal).toBe(internalLog);

    // With includePaths = true -> allowed
    const allowed = sanitizeDiagnosticPath(externalPath, appData, true);
    expect(allowed).toBe(externalPath);
  });

  it('handles external database path when outside app data folder', () => {
    const externalInfo: DiagnosticsInfo = {
      ...sampleInfo,
      database_path: 'D:/ExternalDrive/custom_library.db',
    };

    // When includePaths is false, external database path is redacted
    const reportRedacted = formatDiagnosticsReport(externalInfo, false);
    expect(reportRedacted).toContain('Database Path: [path outside app data redacted]');
    expect(reportRedacted).toContain('Include External Paths: No');

    // When includePaths is true, external database path is preserved
    const reportFull = formatDiagnosticsReport(externalInfo, true);
    expect(reportFull).toContain('Database Path: D:/ExternalDrive/custom_library.db');
    expect(reportFull).toContain('Include External Paths: Yes');
  });

  it('copies diagnostics text to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const success = await copyDiagnosticsReport(sampleInfo, false);
    expect(success).toBe(true);
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    expect(writeTextMock.mock.calls[0][0]).toContain('=== SETLIST Diagnostics Report ===');
  });
});

describe('DiagnosticsHelpPanel UI Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders application diagnostics metadata and action buttons', async () => {
    render(<DiagnosticsHelpPanel />);

    // Wait for async fetchDiagnostics
    expect(await screen.findByTestId('diagnostics-help-panel')).toBeDefined();
    expect(await screen.findByTestId('diag-version')).toBeDefined();
    expect(await screen.findByTestId('diag-track-count')).toBeDefined();
    expect(await screen.findByTestId('diag-log-path')).toBeDefined();
    expect(await screen.findByTestId('diag-db-path')).toBeDefined();

    expect(screen.getByTestId('copy-diagnostics-btn')).toBeDefined();
    expect(screen.getByTestId('open-log-folder-btn')).toBeDefined();
    expect(screen.getByTestId('include-paths-checkbox')).toBeDefined();
  });

  it('toggles includePaths checkbox and triggers Copy Diagnostics', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<DiagnosticsHelpPanel />);

    const checkbox = (await screen.findByTestId('include-paths-checkbox')) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    await act(async () => {
      fireEvent.click(checkbox);
    });
    expect(checkbox.checked).toBe(true);

    const copyBtn = screen.getByTestId('copy-diagnostics-btn');
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalled();
    const copiedText = writeTextMock.mock.calls[0][0];
    expect(copiedText).toContain('Include External Paths: Yes');
  });
});
