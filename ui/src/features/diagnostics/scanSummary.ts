import { mapBackendError } from '../../utils/errors';

export interface FailedScanFile {
  path: string;
  fileName: string;
  reason: string;
  rawError?: string;
}

export interface ScanSummary {
  analyzed: number;
  skipped: number;
  failed: number;
  totalFound: number;
  failedFiles: FailedScanFile[];
  completedAt?: string;
}

export function createEmptyScanSummary(): ScanSummary {
  return {
    analyzed: 0,
    skipped: 0,
    failed: 0,
    totalFound: 0,
    failedFiles: [],
  };
}

/**
 * Parses scanner progress messages emitted during library scans.
 * Matches:
 *  - "Completed <filename>"
 *  - "Skipped (already analyzed) <filename>"
 *  - "Failed <filename>: <error>"
 */
export function parseScanMessage(message: string): {
  type: 'analyzed' | 'skipped' | 'failed' | 'other';
  fileName?: string;
  error?: string;
} {
  const trimmed = message.trim();

  if (trimmed.startsWith('Completed ')) {
    const fileName = trimmed.slice('Completed '.length).trim();
    return { type: 'analyzed', fileName };
  }

  if (trimmed.startsWith('Skipped (already analyzed) ')) {
    const fileName = trimmed.slice('Skipped (already analyzed) '.length).trim();
    return { type: 'skipped', fileName };
  }

  if (trimmed.startsWith('Failed ')) {
    const rest = trimmed.slice('Failed '.length).trim();
    const colonIdx = rest.indexOf(':');
    if (colonIdx !== -1) {
      const fileName = rest.slice(0, colonIdx).trim();
      const error = rest.slice(colonIdx + 1).trim();
      return { type: 'failed', fileName, error };
    }
    return { type: 'failed', fileName: rest, error: 'Unknown analysis failure' };
  }

  return { type: 'other' };
}

/**
 * Pure state reducer for recording scan events into a ScanSummary.
 */
export function recordScanMessage(summary: ScanSummary, message: string): ScanSummary {
  const parsed = parseScanMessage(message);
  if (parsed.type === 'analyzed') {
    return {
      ...summary,
      analyzed: summary.analyzed + 1,
      totalFound: Math.max(summary.totalFound, summary.analyzed + 1 + summary.skipped + summary.failed),
    };
  }

  if (parsed.type === 'skipped') {
    return {
      ...summary,
      skipped: summary.skipped + 1,
      totalFound: Math.max(summary.totalFound, summary.analyzed + summary.skipped + 1 + summary.failed),
    };
  }

  if (parsed.type === 'failed') {
    const fileName = parsed.fileName || 'Unknown file';
    const friendly = mapBackendError(parsed.error || 'Analysis failure');
    const plainReason = `${friendly.message} ${friendly.nextStep}`.trim();

    const newFailed: FailedScanFile = {
      fileName,
      path: fileName,
      reason: plainReason,
      rawError: parsed.error,
    };

    return {
      ...summary,
      failed: summary.failed + 1,
      failedFiles: [...summary.failedFiles, newFailed],
      totalFound: Math.max(summary.totalFound, summary.analyzed + summary.skipped + summary.failed + 1),
    };
  }

  return summary;
}

/**
 * Formats a list of failed files into human-readable text for copying.
 */
export function formatFailedFilesText(failedFiles: FailedScanFile[]): string {
  if (failedFiles.length === 0) {
    return 'No failed files.';
  }

  const lines = [
    `=== SETLIST Failed Files Report (${failedFiles.length}) ===`,
    `Generated: ${new Date().toISOString()}`,
    '',
  ];

  failedFiles.forEach((file, idx) => {
    lines.push(`${idx + 1}. ${file.fileName}`);
    lines.push(`   Reason: ${file.reason}`);
    if (file.rawError && file.rawError !== file.reason) {
      lines.push(`   Technical detail: ${file.rawError}`);
    }
    lines.push('');
  });

  return lines.join('\n').trim();
}

/**
 * Copies the failed files list to clipboard.
 */
export async function copyFailedFilesList(failedFiles: FailedScanFile[]): Promise<boolean> {
  const text = formatFailedFilesText(failedFiles);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    console.error('Failed to copy failed files list:', e);
  }
  return false;
}

// Global active scan summary tracker
let latestSummary: ScanSummary | null = null;
const listeners = new Set<(summary: ScanSummary | null) => void>();

export function getLatestScanSummary(): ScanSummary | null {
  return latestSummary;
}

export function setLatestScanSummary(summary: ScanSummary | null): void {
  latestSummary = summary;
  for (const listener of listeners) {
    listener(latestSummary);
  }
}

export function subscribeScanSummary(listener: (summary: ScanSummary | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
