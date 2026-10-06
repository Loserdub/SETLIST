import React from 'react';
import type { Track } from '../../../bindings/Track';
import {
  FOUR_POINT_CUE_CONFIG,
  CUE_SLOTS,
  resolveFourPointCues,
  formatCueTime,
  type PerformanceCueSlot,
} from './fourPointCues';

export interface FourPointCueChipsProps {
  track: Track | null | undefined;
  onCueClick?: (slot: PerformanceCueSlot, timeMs: number) => void;
  size?: 'xs' | 'sm' | 'md';
  showTimes?: boolean;
  activeSlot?: PerformanceCueSlot | null;
  className?: string;
}

/**
 * Compact, reusable Four-Point Cue indicator strip for Setlist cards,
 * Transition views, Library drawers, and Stage HUD.
 */
export const FourPointCueChips: React.FC<FourPointCueChipsProps> = ({
  track,
  onCueClick,
  size = 'sm',
  showTimes = true,
  activeSlot = null,
  className = '',
}) => {
  const cuesRecord = resolveFourPointCues(track);

  return (
    <div
      className={`inline-flex items-center gap-1 font-mono select-none ${className}`}
      data-testid="four-point-cue-chips"
      role="group"
      aria-label="Performance Cue Points"
    >
      {CUE_SLOTS.map((slot) => {
        const cfg = FOUR_POINT_CUE_CONFIG[slot];
        const cue = cuesRecord[slot];
        const isPresent = cue !== null;
        const isActive = activeSlot === slot;

        const isInteractive = Boolean(onCueClick && isPresent);

        // Size classes (strictly >= 12px)
        const padSizeClass =
          size === 'xs'
            ? 'px-1 py-0.5 text-xs'
            : size === 'md'
            ? 'px-2 py-0.5 text-xs'
            : 'px-1.5 py-0.5 text-xs';

        return (
          <button
            key={slot}
            type="button"
            disabled={!isInteractive}
            onClick={() => {
              if (cue && onCueClick) {
                onCueClick(slot, cue.timeMs);
              }
            }}
            className={`inline-flex items-center gap-1 border transition-all rounded-none ${padSizeClass} ${
              isPresent
                ? isActive
                  ? 'border-white bg-surface-hover text-white shadow-[0_0_8px_rgba(255,255,255,0.4)]'
                  : cue.isConfirmed
                  ? 'border-border-strong bg-surface-panel text-content-primary hover:border-border-strong'
                  : 'border-border-base bg-surface-panel text-content-secondary hover:border-border-strong'
                : 'border-border-subtle bg-surface-deep text-content-dim opacity-50 cursor-default'
            } ${isInteractive ? 'hw-btn cursor-pointer active:translate-y-[1px] focus-visible:ring-1 focus-visible:ring-cyan-400 focus-visible:outline-none' : 'cursor-default'}`}
            title={
              isPresent
                ? `${cfg.defaultLabel}: ${formatCueTime(cue.timeMs)} (${
                    cue.isConfirmed ? 'Confirmed' : 'Suggested'
                  })`
                : `${cfg.defaultLabel} [Empty]`
            }
            data-testid={`cue-chip-${slot}`}
          >
            {/* Slot letter with colored dot or background */}
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                backgroundColor: isPresent ? cfg.colorHex : '#444444',
                boxShadow: isPresent ? `0 0 4px ${cfg.colorHex}` : undefined,
              }}
            />

            {/* Letter */}
            <span
              className="font-bold shrink-0"
              style={{ color: isPresent ? cfg.colorHex : '#666666' }}
            >
              {slot}
            </span>

            {/* Optional Timestamp */}
            {showTimes && isPresent && (
              <span className="te-num tabular-nums opacity-90 text-xs font-mono">
                {formatCueTime(cue.timeMs)}
              </span>
            )}

            {/* Small status indicator: Solid dot for confirmed, hollow ring for suggested */}
            {isPresent && (
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  cue.isConfirmed ? 'bg-emerald-400' : 'border border-cyan-400/80 bg-transparent'
                }`}
                title={cue.isConfirmed ? 'User-confirmed cue' : 'Analysis-suggested cue'}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};
