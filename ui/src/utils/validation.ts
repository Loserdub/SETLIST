import type { ValidationError } from '../bindings/ValidationError';
import type { Song } from '../bindings/Song';
import type { Setlist } from '../bindings/Setlist';
import type { Mode } from '../bindings/Mode';

/**
 * Validates duration in seconds.
 * Must be non-negative, finite, and not NaN.
 */
export function validateDurationSeconds(duration: number): ValidationError | null {
  if (isNaN(duration) || !isFinite(duration)) {
    return {
      field: 'duration_seconds',
      message: 'duration must be a finite number',
      invalid_value: String(duration),
    };
  }
  if (duration < 0) {
    return {
      field: 'duration_seconds',
      message: 'duration cannot be negative',
      invalid_value: duration.toFixed(2),
    };
  }
  return null;
}

/**
 * Validates BPM is within sensible musical range (20.0 to 300.0).
 */
export function validateBpm(bpm: number): ValidationError | null {
  if (isNaN(bpm) || !isFinite(bpm)) {
    return {
      field: 'bpm',
      message: 'BPM must be a finite number',
      invalid_value: String(bpm),
    };
  }
  if (bpm < 20.0 || bpm > 300.0) {
    return {
      field: 'bpm',
      message: 'BPM must be within sensible musical range [20.0, 300.0]',
      invalid_value: bpm.toFixed(1),
    };
  }
  return null;
}

/**
 * Validates discrete energy rating (1 to 10).
 */
export function validateEnergyRating(energy: number): ValidationError | null {
  if (!Number.isInteger(energy) || energy < 1 || energy > 10) {
    return {
      field: 'energy_rating',
      message: 'energy rating must be an integer between 1 and 10',
      invalid_value: String(energy),
    };
  }
  return null;
}

/**
 * Validates capo fret position (0 to 24).
 */
export function validateCapo(capo: number): ValidationError | null {
  if (!Number.isInteger(capo) || capo < 0 || capo > 24) {
    return {
      field: 'capo',
      message: 'capo position must be between 0 (no capo) and 24',
      invalid_value: String(capo),
    };
  }
  return null;
}

/**
 * Validates musical key notation:
 * Standard keys (e.g. "Am", "C#m", "Eb", "F#") or Camelot ("8A", "11B").
 */
export function validateKeyNotation(key: string): ValidationError | null {
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    return {
      field: 'musical_key',
      message: 'key notation cannot be empty',
      invalid_value: key,
    };
  }

  // Camelot pattern: 1-12 with A or B
  const camelotMatch = /^([1-9]|1[0-2])[ABab]$/.test(trimmed);
  if (camelotMatch) {
    return null;
  }

  // Standard pitch notation pattern: Root (A-G), optional accidental (# or b), optional mode (m, min, maj)
  const standardKeyPattern = /^[A-Ga-g][#b♭♯]?(m|min|maj|minor|major)?$/i;
  if (standardKeyPattern.test(trimmed)) {
    return null;
  }

  return {
    field: 'musical_key',
    message: 'invalid musical key notation (expected standard notation like "Am", "C#m", or Camelot like "8A")',
    invalid_value: key,
  };
}

/**
 * Validates musical mode ("Major" or "Minor").
 */
export function validateMode(mode: string): ValidationError | null {
  const validModes: Mode[] = ['Major', 'Minor'];
  if (!validModes.includes(mode as Mode)) {
    return {
      field: 'mode',
      message: 'mode must be either "Major" or "Minor"',
      invalid_value: mode,
    };
  }
  return null;
}

/**
 * Validates instrument tuning identifier.
 */
export function validateTuning(tuning: string): ValidationError | null {
  const trimmed = tuning.trim();
  if (trimmed.length === 0) {
    return {
      field: 'tuning',
      message: 'tuning identifier cannot be empty',
      invalid_value: tuning,
    };
  }
  if (trimmed.length > 50) {
    return {
      field: 'tuning',
      message: 'tuning identifier cannot exceed 50 characters',
      invalid_value: tuning,
    };
  }
  // Printable ASCII only
  if (!/^[\x20-\x7E]+$/.test(trimmed)) {
    return {
      field: 'tuning',
      message: 'tuning identifier contains invalid or non-printable characters',
      invalid_value: tuning,
    };
  }
  return null;
}

/**
 * Validates a Song entity comprehensively according to domain rules.
 */
export function validateSong(song: Song): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!song.title || song.title.trim().length === 0) {
    errors.push({
      field: 'title',
      message: 'song title cannot be empty',
      invalid_value: song.title,
    });
  } else if (song.title.length > 255) {
    errors.push({
      field: 'title',
      message: 'song title exceeds 255 characters',
      invalid_value: song.title,
    });
  }

  if (!song.artist || song.artist.trim().length === 0) {
    errors.push({
      field: 'artist',
      message: 'artist cannot be empty',
      invalid_value: song.artist,
    });
  } else if (song.artist.length > 255) {
    errors.push({
      field: 'artist',
      message: 'artist exceeds 255 characters',
      invalid_value: song.artist,
    });
  }

  const durationErr = validateDurationSeconds(song.duration_seconds);
  if (durationErr) errors.push(durationErr);

  if (song.bpm !== null && song.bpm !== undefined) {
    const bpmErr = validateBpm(song.bpm);
    if (bpmErr) errors.push(bpmErr);
  }

  if (song.energy_rating !== null && song.energy_rating !== undefined) {
    const energyErr = validateEnergyRating(song.energy_rating);
    if (energyErr) errors.push(energyErr);
  }

  if (song.capo !== null && song.capo !== undefined) {
    const capoErr = validateCapo(song.capo);
    if (capoErr) errors.push(capoErr);
  }

  if (song.musical_key !== null && song.musical_key !== undefined) {
    const keyErr = validateKeyNotation(song.musical_key);
    if (keyErr) errors.push(keyErr);
  }

  if (song.mode !== null && song.mode !== undefined) {
    const modeErr = validateMode(song.mode);
    if (modeErr) errors.push(modeErr);
  }

  if (song.tuning !== null && song.tuning !== undefined) {
    const tuningErr = validateTuning(song.tuning);
    if (tuningErr) errors.push(tuningErr);
  }

  return errors;
}

/**
 * Validates a Setlist entity structure and item sequence.
 */
export function validateSetlist(setlist: Setlist): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!setlist.id || setlist.id.trim().length === 0) {
    errors.push({
      field: 'id',
      message: 'setlist id cannot be empty',
      invalid_value: setlist.id,
    });
  }

  if (!setlist.name || setlist.name.trim().length === 0) {
    errors.push({
      field: 'name',
      message: 'setlist name cannot be empty',
      invalid_value: setlist.name,
    });
  }

  // Check positions are 1-based and strictly sequential without duplicates
  const seenPositions = new Set<number>();
  for (let i = 0; i < setlist.items.length; i++) {
    const item = setlist.items[i];
    const expectedPos = i + 1;
    if (seenPositions.has(item.position)) {
      errors.push({
        field: 'items.position',
        message: `duplicate item position ${item.position} in setlist`,
        invalid_value: String(item.position),
      });
    }
    seenPositions.add(item.position);

    if (item.position !== expectedPos) {
      errors.push({
        field: 'items.position',
        message: `item at index ${i} has position ${item.position}, expected ${expectedPos}`,
        invalid_value: String(item.position),
      });
    }
  }

  return errors;
}
