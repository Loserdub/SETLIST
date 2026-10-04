import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '../../api';

export interface DiagnosticsInfo {
  app_version: string;
  log_file_path: string;
  database_path: string;
  track_count: number;
  app_data_dir: string;
  os: string;
  arch: string;
}

const DEFAULT_MOCK_DIAGNOSTICS: DiagnosticsInfo = {
  app_version: '0.1.0',
  log_file_path: 'C:/Users/User/AppData/Roaming/com.setlist.desktop/setlist.log',
  database_path: 'C:/Users/User/AppData/Roaming/com.setlist.desktop/library.db',
  track_count: 40,
  app_data_dir: 'C:/Users/User/AppData/Roaming/com.setlist.desktop',
  os: 'windows',
  arch: 'x86_64',
};

/**
 * Checks if a target path is inside the app data directory.
 */
export function isPathInsideAppData(targetPath: string, appDataDir: string): boolean {
  const normTarget = targetPath.replace(/\\/g, '/').toLowerCase();
  const normAppData = appDataDir.replace(/\\/g, '/').toLowerCase();
  return normTarget.startsWith(normAppData);
}

/**
 * Sanitizes a path string, redacting paths outside app data if includePaths is false.
 */
export function sanitizeDiagnosticPath(path: string, appDataDir: string, includePaths: boolean): string {
  if (includePaths) {
    return path;
  }
  if (isPathInsideAppData(path, appDataDir)) {
    return path;
  }
  return '[path outside app data redacted]';
}

/**
 * Formats diagnostic information into safe text for reporting or copying.
 * Guarantees no audio samples, waveforms, or cue points are included.
 */
export function formatDiagnosticsReport(info: DiagnosticsInfo, includePaths: boolean): string {
  const logPath = sanitizeDiagnosticPath(info.log_file_path, info.app_data_dir, includePaths);
  const dbPath = sanitizeDiagnosticPath(info.database_path, info.app_data_dir, includePaths);
  const appData = sanitizeDiagnosticPath(info.app_data_dir, info.app_data_dir, true);

  return [
    '=== SETLIST Diagnostics Report ===',
    `Timestamp: ${new Date().toISOString()}`,
    `App Version: ${info.app_version}`,
    `Operating System: ${info.os} (${info.arch})`,
    `App Data Folder: ${appData}`,
    `Log File Path: ${logPath}`,
    `Database Path: ${dbPath}`,
    `Track Count: ${info.track_count}`,
    `Include External Paths: ${includePaths ? 'Yes' : 'No'}`,
    '==================================',
  ].join('\n');
}

/**
 * Fetches diagnostic information from Tauri IPC or mock environment.
 */
export async function fetchDiagnostics(): Promise<DiagnosticsInfo> {
  if (!isTauriEnvironment()) {
    return DEFAULT_MOCK_DIAGNOSTICS;
  }

  try {
    return await invoke<DiagnosticsInfo>('get_diagnostics');
  } catch (err) {
    console.error('Failed to fetch diagnostics via Tauri invoke:', err);
    return DEFAULT_MOCK_DIAGNOSTICS;
  }
}

/**
 * Opens the application log folder via Tauri IPC or native explorer.
 */
export async function openLogFolder(): Promise<void> {
  if (!isTauriEnvironment()) {
    console.info('[Mock] openLogFolder called');
    return;
  }

  try {
    await invoke('open_log_folder');
  } catch (err) {
    console.error('Failed to open log folder:', err);
    throw err;
  }
}

/**
 * Copies the diagnostics report to the system clipboard.
 */
export async function copyDiagnosticsReport(info: DiagnosticsInfo, includePaths: boolean): Promise<boolean> {
  const text = formatDiagnosticsReport(info, includePaths);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    console.error('Failed to copy diagnostics report to clipboard:', e);
  }
  return false;
}
