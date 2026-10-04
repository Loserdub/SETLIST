/**
 * Backend error mapping and user-friendly error messages.
 * Maps low-level backend and IPC errors into plain words with actionable next steps.
 */

export type BackendErrorKind =
  | 'decode_failed'
  | 'unsupported_format'
  | 'empty_folder'
  | 'folder_not_found'
  | 'not_enough_tracks'
  | 'export_failed'
  | 'file_already_exists'
  | 'playback_failed'
  | 'database_error'
  | 'unknown';

export interface FriendlyError {
  kind: BackendErrorKind;
  message: string;
  nextStep: string;
  rawError?: string;
  canCopyDetails: boolean;
}

/**
 * Extracts a normalized error string from unknown error inputs.
 */
export function extractErrorMessage(error: unknown): string {
  if (error === null || error === undefined) {
    return 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === 'string') {
      return obj.message;
    }
    if (typeof obj.details === 'string') {
      return obj.details;
    }
    if (typeof obj.error === 'string') {
      return obj.error;
    }
    // Handle serialized AppError: { category: "Database", details: { message: "..." } }
    if (typeof obj.category === 'string') {
      if (obj.details && typeof obj.details === 'object') {
        const detailsObj = obj.details as Record<string, unknown>;
        if (typeof detailsObj.message === 'string') {
          return `${obj.category}: ${detailsObj.message}`;
        }
      }
      return `${obj.category} error`;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

/**
 * Maps a backend or system error into a friendly message plus an actionable next step.
 */
export function mapBackendError(error: unknown): FriendlyError {
  const raw = extractErrorMessage(error);
  const lower = raw.toLowerCase();

  // 1. File could not be decoded
  if (
    lower.includes('could not be decoded') ||
    lower.includes('failed to decode') ||
    lower.includes('unable to decode') ||
    lower.includes('decoding failed') ||
    lower.includes('corrupt audio') ||
    lower.includes('corrupted') ||
    lower.includes('decoder error')
  ) {
    return {
      kind: 'decode_failed',
      message: 'File could not be decoded.',
      nextStep: 'Check that the audio file is not corrupt or try re-exporting it.',
      rawError: raw,
      canCopyDetails: true,
    };
  }

  // 2. Unsupported format
  if (
    lower.includes('unsupported format') ||
    lower.includes('unsupported audio format') ||
    lower.includes('unsupported file') ||
    lower.includes('format not supported') ||
    lower.includes('unsupported extension') ||
    lower.includes('no decoder available')
  ) {
    return {
      kind: 'unsupported_format',
      message: 'Unsupported audio format.',
      nextStep: 'Use standard MP3, WAV, FLAC, AIFF, or AAC files.',
      rawError: raw,
      canCopyDetails: true,
    };
  }

  // 3. Empty folder
  if (
    lower.includes('empty folder') ||
    lower.includes('no audio files found') ||
    lower.includes('folder contains no audio') ||
    lower.includes('contains no supported audio files') ||
    lower.includes('no supported tracks')
  ) {
    return {
      kind: 'empty_folder',
      message: 'Folder contains no audio files.',
      nextStep: 'Choose a folder containing audio files (MP3, WAV, FLAC, AIFF, or AAC).',
      rawError: raw,
      canCopyDetails: false,
    };
  }

  // 4. Folder not found
  if (
    lower.includes('folder not found') ||
    lower.includes('directory does not exist') ||
    lower.includes('path does not exist') ||
    lower.includes('no such directory') ||
    lower.includes('directory not found') ||
    lower.includes('is not a folder')
  ) {
    return {
      kind: 'folder_not_found',
      message: 'Folder not found.',
      nextStep: 'Check that the directory exists and you have permission to access it.',
      rawError: raw,
      canCopyDetails: false,
    };
  }

  // 5. Not enough tracks to order (need at least 2)
  if (
    lower.includes('not enough tracks') ||
    lower.includes('at least 2 tracks') ||
    lower.includes('need at least 2') ||
    lower.includes('requires at least 2') ||
    lower.includes('minimum of 2 tracks')
  ) {
    return {
      kind: 'not_enough_tracks',
      message: 'Not enough tracks to order.',
      nextStep: 'Add at least 2 tracks to the setlist before generating an order.',
      rawError: raw,
      canCopyDetails: false,
    };
  }

  // 6a. File already exists (specific export case)
  if (
    lower.includes('already exists') ||
    lower.includes('destination file already exists')
  ) {
    return {
      kind: 'file_already_exists',
      message: 'Destination file already exists.',
      nextStep: 'Choose a different output filename or enable the overwrite option.',
      rawError: raw,
      canCopyDetails: true,
    };
  }

  // 6b. Export failed
  if (
    lower.includes('export failed') ||
    lower.includes('failed to export') ||
    lower.includes('export error') ||
    lower.includes('could not export')
  ) {
    return {
      kind: 'export_failed',
      message: 'Export failed.',
      nextStep: 'Check that the destination folder is writable and has sufficient free disk space.',
      rawError: raw,
      canCopyDetails: true,
    };
  }

  // 7. Playback failed
  if (
    lower.includes('playback failed') ||
    lower.includes('failed to initialize playback') ||
    lower.includes('audio output device') ||
    lower.includes('device error') ||
    lower.includes('failed to load audio for playback') ||
    lower.includes('player error')
  ) {
    return {
      kind: 'playback_failed',
      message: 'Playback failed.',
      nextStep: 'Check that your audio output device is connected and available.',
      rawError: raw,
      canCopyDetails: true,
    };
  }

  // 8. Database error
  if (
    lower.includes('database error') ||
    lower.includes('database mutex error') ||
    lower.includes('sqlite') ||
    lower.includes('rusqlite') ||
    lower.includes('failed to open db') ||
    lower.includes('database is locked') ||
    lower.includes('database disk image is malformed')
  ) {
    return {
      kind: 'database_error',
      message: 'Database error.',
      nextStep: 'Restart the application or check permissions for your app data folder.',
      rawError: raw,
      canCopyDetails: true,
    };
  }

  // 9. Unknown / Unmapped error
  return {
    kind: 'unknown',
    message: 'An unexpected error occurred.',
    nextStep: 'Copy details to report this issue or check the application logs in Settings.',
    rawError: raw,
    canCopyDetails: true,
  };
}

/**
 * Formats a friendly error into a toast-compatible structure.
 */
export function formatFriendlyToast(error: unknown): {
  type: 'error';
  message: string;
  details: string;
  friendly: FriendlyError;
} {
  const friendly = mapBackendError(error);
  const detailsParts: string[] = [];

  if (friendly.nextStep) {
    detailsParts.push(friendly.nextStep);
  }

  if (friendly.kind === 'unknown' && friendly.rawError) {
    detailsParts.push(`Details: ${friendly.rawError}`);
  }

  return {
    type: 'error',
    message: friendly.message,
    details: detailsParts.join(' '),
    friendly,
  };
}

/**
 * Copies technical error details to the system clipboard.
 */
export async function copyErrorDetails(error: unknown | FriendlyError): Promise<boolean> {
  const friendly =
    typeof error === 'object' && error !== null && 'kind' in error && 'message' in error
      ? (error as FriendlyError)
      : mapBackendError(error);

  const timestamp = new Date().toISOString();
  const text = [
    '=== SETLIST Error Details ===',
    `Timestamp: ${timestamp}`,
    `Kind: ${friendly.kind}`,
    `Message: ${friendly.message}`,
    `Next Step: ${friendly.nextStep}`,
    friendly.rawError ? `Raw Error: ${friendly.rawError}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    console.error('Failed to copy error details to clipboard:', e);
  }
  return false;
}
