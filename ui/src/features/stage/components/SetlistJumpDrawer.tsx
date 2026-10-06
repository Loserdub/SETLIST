import React from 'react';
import type { SetlistEntry } from '../../../bindings/SetlistEntry';
import { EditedBadge, isFieldOverridden } from '../../track/overrides';

export interface SetlistJumpDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  setlist: SetlistEntry[];
  stageCurrentIndex: number;
  onJumpToIndex: (index: number) => void;
}

export function SetlistJumpItem({
  entry,
  index,
  isCurrent,
  onJump,
}: {
  entry: SetlistEntry;
  index: number;
  isCurrent: boolean;
  onJump: () => void;
}) {
  const title = entry.track?.tags?.title ?? entry.track_id;
  const artist = entry.track?.tags?.artist ?? '';
  const bpm = entry.track?.analysis?.rhythm?.grid?.bpm;
  const key = entry.track?.analysis?.key;
  const keyStr = key ? `${key.camelot.number}${key.camelot.letter}` : '';

  return (
    <button
      type="button"
      onClick={onJump}
      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors border rounded-none cursor-pointer focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:outline-none ${
        isCurrent
          ? 'bg-surface-raised border-l-2 border-l-content-primary border-border-base text-white'
          : 'bg-surface-panel border-border-subtle text-content-muted hover:text-content-primary hover:bg-surface-panel'
      }`}
      data-testid={`stage-jump-${index}`}
    >
      <span
        className={`text-xs font-mono w-6 text-center tabular-nums ${
          isCurrent ? 'text-white font-bold' : 'text-content-muted'
        }`}
      >
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{title}</p>
        {artist && <p className="text-xs text-content-muted truncate">{artist}</p>}
      </div>
      <div className="flex items-center gap-2 text-xs text-content-muted font-mono shrink-0">
        {bpm != null && (
          <span className="inline-flex items-center gap-1">
            <span>{Math.round(bpm)} BPM</span>
            {isFieldOverridden(entry.track, 'bpm') && (
              <EditedBadge field="bpm" title="BPM analysis overridden" />
            )}
          </span>
        )}
        {keyStr && (
          <span className="inline-flex items-center gap-1">
            <span>{keyStr}</span>
            {isFieldOverridden(entry.track, 'key_camelot') && (
              <EditedBadge field="key_camelot" title="Key analysis overridden" />
            )}
          </span>
        )}
      </div>
      {isCurrent && (
        <span className="text-content-primary text-xs font-mono uppercase tracking-wider font-semibold">
          ▶ NOW
        </span>
      )}
    </button>
  );
}

export const SetlistJumpDrawer: React.FC<SetlistJumpDrawerProps> = ({
  isOpen,
  onClose,
  setlist,
  stageCurrentIndex,
  onJumpToIndex,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="absolute inset-0 z-40 bg-black/90 flex flex-col font-mono"
      data-testid="stage-setlist-overlay"
    >
      <div className="flex items-center justify-between px-6 py-3 border-b border-border-subtle bg-surface-panel">
        <h3 className="text-xs font-bold uppercase tracking-wider text-content-primary">Set Order</h3>
        <button
          type="button"
          onClick={onClose}
          className="px-2.5 py-1 border border-border-base bg-surface-raised text-content-muted hover:text-white transition-colors text-xs cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:outline-none"
          data-testid="stage-setlist-close"
        >
          [ CLOSE ]
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1">
        {setlist.map((entry, idx) => (
          <SetlistJumpItem
            key={entry.track_id}
            entry={entry}
            index={idx}
            isCurrent={idx === stageCurrentIndex}
            onJump={() => onJumpToIndex(idx)}
          />
        ))}
      </div>
    </div>
  );
};
