import React, { useState } from 'react';
import type { Track } from '../../bindings/Track';
import { getTrackDisplayTitle, getTrackDisplayArtist } from '../../utils/trackDisplay';

export interface TrackHeaderProps {
  selectedTrack: Track;
  inSetlist: boolean;
  customTitle?: string | null;
  customArtist?: string | null;
  onAddToSetlist: () => void;
  onBackToLibrary: () => void;
  onSaveMetadata: (title: string, artist: string) => void;
  onResetMetadata: () => void;
  bg: string;
  fg: string;
  keyStr: string;
}

export const TrackHeader: React.FC<TrackHeaderProps> = ({
  selectedTrack,
  inSetlist,
  customTitle,
  customArtist,
  onAddToSetlist,
  onBackToLibrary,
  onSaveMetadata,
  onResetMetadata,
  bg,
  fg,
  keyStr,
}) => {
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');

  const displayTitle = getTrackDisplayTitle(selectedTrack, customTitle);
  const displayArtist = getTrackDisplayArtist(selectedTrack, customArtist);

  const startEditing = () => {
    setEditTitle(customTitle ?? displayTitle);
    setEditArtist(customArtist ?? (selectedTrack.tags.artist ?? ''));
    setIsEditingMetadata(true);
  };

  const saveEditing = () => {
    onSaveMetadata(editTitle, editArtist);
    setIsEditingMetadata(false);
  };

  const resetToOriginal = () => {
    onResetMetadata();
    setIsEditingMetadata(false);
  };

  const cancelEditing = () => {
    setIsEditingMetadata(false);
  };

  return (
    <div className="p-4 bg-surface-panel border border-border-subtle flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-none">
      {isEditingMetadata ? (
        <div className="space-y-2.5 w-full max-w-xl bg-surface-raised p-3 border border-border-base">
          <div className="text-xs font-mono uppercase tracking-wider text-content-muted flex items-center justify-between">
            <span>Edit In-App Track Metadata (Local Only)</span>
            <span className="text-content-muted text-xs">Original audio file on disk will not be changed</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-xs font-mono text-content-muted block mb-0.5">Track Title:</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Enter track title..."
                className="w-full px-2.5 py-1 bg-surface-deep border border-border-base text-xs font-mono text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
                data-testid="edit-title-input"
                autoFocus
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-mono text-content-muted block mb-0.5">Artist Name:</label>
              <input
                type="text"
                value={editArtist}
                onChange={(e) => setEditArtist(e.target.value)}
                placeholder="Enter artist name..."
                className="w-full px-2.5 py-1 bg-surface-deep border border-border-base text-xs font-mono text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
                data-testid="edit-artist-input"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={saveEditing}
              className="px-3 py-1 bg-accent-blue text-black font-semibold text-xs font-mono uppercase tracking-wider hover:bg-accent-blue transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
              data-testid="save-metadata-btn"
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              className="px-3 py-1 bg-surface-elevated hover:bg-surface-hover text-content-muted hover:text-white border border-border-strong text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
            >
              Cancel
            </button>
            {(customTitle || customArtist) && (
              <button
                type="button"
                onClick={resetToOriginal}
                className="px-3 py-1 bg-surface-elevated hover:bg-surface-hover text-status-danger border border-border-base text-xs font-mono uppercase tracking-wider transition-colors ml-auto cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
                title="Revert back to original tags / filename detection"
              >
                Reset to Default
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              className="px-2 py-0.5 rounded-[2px] font-mono text-xs font-bold border border-black/30"
              style={{ backgroundColor: bg, color: fg }}
              data-testid="track-key-badge"
            >
              {keyStr}
            </span>
            <h2 className="text-lg font-bold tracking-tight text-white truncate max-w-lg">
              {displayTitle}
            </h2>
            {customTitle && (
              <span
                className="text-xs font-mono px-2 py-0.5 bg-accent-blue-dim text-accent-blue border border-accent-blue-dim"
                title="Custom in-app title override"
              >
                Custom Title
              </span>
            )}
            <button
              type="button"
              onClick={startEditing}
              className="px-2.5 py-1 bg-surface-raised hover:bg-surface-elevated text-content-muted hover:text-white border border-border-base text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
              title="Edit in-app title and artist"
              data-testid="edit-track-metadata-btn"
            >
              Edit Info
            </button>
          </div>
          <p className="text-xs text-content-muted flex items-center gap-1.5 flex-wrap">
            <span>{displayArtist}</span>
            {customArtist && (
              <span className="text-xs font-mono px-1.5 py-0.5 bg-accent-blue-dim text-accent-blue border border-accent-blue-dim">
                Custom Artist
              </span>
            )}
            <span>•</span>
            <span>{selectedTrack.tags.album ?? 'Single / Unassigned'}</span>
          </p>
          <p className="text-xs font-mono text-content-muted truncate max-w-xl">
            {selectedTrack.path}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          disabled={inSetlist}
          onClick={onAddToSetlist}
          className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer border rounded-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none ${
            inSetlist
              ? 'bg-surface-raised text-content-muted border-border-base cursor-default'
              : 'bg-surface-elevated hover:bg-surface-hover text-white border-border-base'
          }`}
        >
          {inSetlist ? '✓ In Active Setlist' : '+ Add to Setlist'}
        </button>
        <button
          type="button"
          onClick={onBackToLibrary}
          className="px-3 py-1.5 bg-surface-panel hover:bg-surface-elevated text-content-muted hover:text-white text-xs font-mono uppercase tracking-wider border border-border-base transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
        >
          Back to Library
        </button>
      </div>
    </div>
  );
};
