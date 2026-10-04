import { describe, it, expect, vi } from 'vitest';
import {
  mapBackendError,
  formatFriendlyToast,
  copyErrorDetails,
  extractErrorMessage,
} from './errors';

describe('error mapping table (errors.ts)', () => {
  it('maps "file could not be decoded" to a short message plus next step', () => {
    const error1 = 'Audio decode error: file could not be decoded';
    const res1 = mapBackendError(error1);
    expect(res1.kind).toBe('decode_failed');
    expect(res1.message).toBe('File could not be decoded.');
    expect(res1.nextStep).toContain('not corrupt or try re-exporting');

    const error2 = new Error('Failed to decode mp3 frame header: corrupted audio stream');
    const res2 = mapBackendError(error2);
    expect(res2.kind).toBe('decode_failed');
    expect(res2.message).toBe('File could not be decoded.');
  });

  it('maps "unsupported format" to a short message plus next step', () => {
    const error = 'Unsupported format: .wma is not supported';
    const res = mapBackendError(error);
    expect(res.kind).toBe('unsupported_format');
    expect(res.message).toBe('Unsupported audio format.');
    expect(res.nextStep).toContain('MP3, WAV, FLAC, AIFF, or AAC');
  });

  it('maps "empty folder" to a short message plus next step', () => {
    const error = 'Empty folder: no audio files found in directory';
    const res = mapBackendError(error);
    expect(res.kind).toBe('empty_folder');
    expect(res.message).toBe('Folder contains no audio files.');
    expect(res.nextStep).toContain('Choose a folder containing audio files');
  });

  it('maps "folder not found" to a short message plus next step', () => {
    const error = 'Directory does not exist or is not a folder: D:/Music/DJ';
    const res = mapBackendError(error);
    expect(res.kind).toBe('folder_not_found');
    expect(res.message).toBe('Folder not found.');
    expect(res.nextStep).toContain('Check that the directory exists and you have permission');
  });

  it('maps "not enough tracks to order (need at least 2)" to a short message plus next step', () => {
    const error = 'At least 2 tracks are required to suggest an order (received 1)';
    const res = mapBackendError(error);
    expect(res.kind).toBe('not_enough_tracks');
    expect(res.message).toBe('Not enough tracks to order.');
    expect(res.nextStep).toContain('Add at least 2 tracks');
  });

  it('maps "export failed or file already exists" appropriately', () => {
    // Already exists
    const errorExists = 'Destination file already exists: C:/Sets/mix.xml';
    const resExists = mapBackendError(errorExists);
    expect(resExists.kind).toBe('file_already_exists');
    expect(resExists.message).toBe('Destination file already exists.');
    expect(resExists.nextStep).toContain('Choose a different output filename or enable the overwrite option');

    // Export failed
    const errorFail = 'Export failed: permission denied while writing Rekordbox XML';
    const resFail = mapBackendError(errorFail);
    expect(resFail.kind).toBe('export_failed');
    expect(resFail.message).toBe('Export failed.');
    expect(resFail.nextStep).toContain('Check that the destination folder is writable');
  });

  it('maps "playback failed" to a short message plus next step', () => {
    const error = 'Failed to initialize playback audio stream: audio output device busy';
    const res = mapBackendError(error);
    expect(res.kind).toBe('playback_failed');
    expect(res.message).toBe('Playback failed.');
    expect(res.nextStep).toContain('Check that your audio output device is connected');
  });

  it('maps "database error" to a short message plus next step', () => {
    const error = 'database error: database mutex error or locked sqlite db';
    const res = mapBackendError(error);
    expect(res.kind).toBe('database_error');
    expect(res.message).toBe('Database error.');
    expect(res.nextStep).toContain('Restart the application or check permissions');
  });

  it('maps unknown errors to a generic message with Copy details enabled', () => {
    const error = 'Unexpected SEGFAULT or mystery failure 0x884920';
    const res = mapBackendError(error);
    expect(res.kind).toBe('unknown');
    expect(res.message).toBe('An unexpected error occurred.');
    expect(res.nextStep).toContain('Copy details to report this issue');
    expect(res.canCopyDetails).toBe(true);
    expect(res.rawError).toBe(error);
  });

  it('formats friendly error toasts cleanly', () => {
    const toast = formatFriendlyToast('Directory does not exist');
    expect(toast.type).toBe('error');
    expect(toast.message).toBe('Folder not found.');
    expect(toast.details).toContain('Check that the directory exists');
  });

  it('extractErrorMessage handles objects, serialized AppErrors, and nulls', () => {
    expect(extractErrorMessage(null)).toBe('Unknown error');
    expect(extractErrorMessage(undefined)).toBe('Unknown error');
    expect(extractErrorMessage('Direct string')).toBe('Direct string');
    expect(extractErrorMessage(new Error('Boom'))).toBe('Boom');
    expect(extractErrorMessage({ message: 'Custom message' })).toBe('Custom message');
    expect(extractErrorMessage({ details: 'Detail info' })).toBe('Detail info');
    expect(
      extractErrorMessage({
        category: 'Database',
        details: { message: 'table locked' },
      })
    ).toBe('Database: table locked');
  });

  it('copies error details to clipboard when available', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const success = await copyErrorDetails('Unknown hardware fault');
    expect(success).toBe(true);
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const copiedText = writeTextMock.mock.calls[0][0];
    expect(copiedText).toContain('=== SETLIST Error Details ===');
    expect(copiedText).toContain('Unknown hardware fault');
    expect(copiedText).toContain('Kind: unknown');
  });
});
