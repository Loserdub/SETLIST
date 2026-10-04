import React from 'react';
import type { Track } from '../../../bindings/Track';
import type { TrackWithOverrides, TrackOverrideFlags } from '../../../api/overrides';

export interface EditedBadgeProps {
  title?: string;
  field?: keyof TrackOverrideFlags;
  className?: string;
}

/**
 * Reusable visual badge displayed alongside overridden analysis metadata.
 */
export const EditedBadge: React.FC<EditedBadgeProps> = ({
  title = 'User analysis override active',
  field,
  className = '',
}) => {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-xs font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/40 rounded-[2px] select-none ${className}`}
      title={title}
      data-testid={field ? `edited-badge-${field}` : 'edited-badge'}
      aria-label={title}
    >
      EDITED
    </span>
  );
};

/**
 * Checks whether a specific analysis field has an active user override.
 */
export function isFieldOverridden(
  track: Track | null | undefined,
  field: keyof TrackOverrideFlags
): boolean {
  if (!track) return false;
  const flags = (track as TrackWithOverrides).overrides;
  return Boolean(flags && flags[field]);
}

/**
 * Checks whether any analysis field has an active user override.
 */
export function hasAnyOverride(track: Track | null | undefined): boolean {
  if (!track) return false;
  const flags = (track as TrackWithOverrides).overrides;
  return Boolean(flags && (flags.bpm || flags.first_downbeat_ms || flags.key_camelot || flags.cues));
}
