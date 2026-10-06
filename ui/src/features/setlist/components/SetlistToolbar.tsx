import React from 'react';
import type { ExportTarget } from '../../../bindings/ExportTarget';
import { IconUndo, IconRedo, IconSliders } from '../../../components/icons';

export interface SetlistToolbarProps {
  setlistName: string;
  setSetlistName: (name: string) => void;
  setlistCount: number;
  onOpenDeliveryModal: () => void;
  exportTarget: ExportTarget;
  setExportTarget: (target: ExportTarget) => void;
  isExporting: boolean;
  onExportSet: () => void;
  onOpenExportOptions: () => void;
  canUndoSetlist: boolean;
  canRedoSetlist: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClearSetlist: () => void;
}

export const SetlistToolbar: React.FC<SetlistToolbarProps> = ({
  setlistName,
  setSetlistName,
  setlistCount,
  onOpenDeliveryModal,
  exportTarget,
  setExportTarget,
  isExporting,
  onExportSet,
  onOpenExportOptions,
  canUndoSetlist,
  canRedoSetlist,
  onUndo,
  onRedo,
  onClearSetlist,
}) => {
  return (
    <header className="px-5 py-2.5 border-b border-border-subtle bg-surface-panel flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
      <div>
        <div className="flex items-center gap-2.5">
          <input
            type="text"
            value={setlistName}
            onChange={(e) => setSetlistName(e.target.value)}
            className="text-sm font-mono font-bold tracking-wider text-content-primary bg-transparent border-b border-transparent hover:border-border-strong focus:border-zinc-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 transition-colors uppercase"
            title="Click to rename setlist"
          />
          <span className="text-xs font-mono px-2 py-0.5 border border-border-base bg-surface-raised text-content-secondary">
            {setlistCount} {setlistCount === 1 ? 'track' : 'tracks'}
          </span>
        </div>
        <p className="text-xs font-mono text-content-muted mt-0.5">
          Sequential ordering co-pilot • Cost model harmonic alignment & energy curve solver
        </p>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* READY FOR PERFORMANCE Delivery Experience */}
        <button
          type="button"
          onClick={onOpenDeliveryModal}
          disabled={setlistCount === 0}
          data-testid="ready-for-performance-btn"
          className="px-3 py-1 bg-surface-raised hover:bg-accent-amber-subtle border border-status-danger text-amber-400 hover:text-white font-bold text-xs font-mono uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:opacity-40 disabled:cursor-not-allowed hw-btn"
          title="Open Ready for Performance delivery checklist and hardware export workflow"
        >
          <span className="hw-led hw-led-amber" />
          <span>[ READY FOR PERFORMANCE ]</span>
        </button>

        {/* Export Selector & Button */}
        <div className="flex items-center bg-surface-panel border border-border-base p-0.5">
          <select
            aria-label="Export format"
            value={exportTarget}
            onChange={(e) => setExportTarget(e.target.value as ExportTarget)}
            className="bg-transparent text-xs font-mono text-content-secondary px-2 py-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 cursor-pointer border-r border-border-base pr-2"
          >
            <option value="RekordboxXml" className="bg-surface-raised text-content-primary">
              Rekordbox XML
            </option>
            <option value="M3u8" className="bg-surface-raised text-content-primary">
              M3U8 Playlist
            </option>
            <option value="SetSheetMarkdown" className="bg-surface-raised text-content-primary">
              Set Sheet (MD)
            </option>
            <option value="SetSheetCsv" className="bg-surface-raised text-content-primary">
              Set Sheet (CSV)
            </option>
          </select>
          <button
            type="button"
            onClick={onExportSet}
            disabled={setlistCount === 0 || isExporting}
            className="px-2.5 py-0.5 bg-surface-elevated hover:bg-surface-hover disabled:opacity-40 text-content-primary text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer rounded-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue"
          >
            <span>{isExporting ? 'Exporting...' : 'Export'}</span>
          </button>
          <button
            type="button"
            onClick={onOpenExportOptions}
            disabled={setlistCount === 0 || isExporting}
            title="Configure export destination and options"
            aria-label="Export options"
            className="px-2 py-1 text-content-muted hover:text-content-primary disabled:opacity-40 text-xs font-mono transition-colors cursor-pointer border-l border-border-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue flex items-center justify-center"
          >
            <IconSliders size={12} />
          </button>
        </div>

        {/* Undo / Redo Toolbar */}
        <div className="flex items-center bg-surface-panel border border-border-base p-0.5">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndoSetlist}
            className="px-2 py-0.5 text-xs font-mono uppercase text-content-secondary hover:text-white disabled:opacity-30 disabled:hover:text-content-secondary transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue flex items-center gap-1"
            title="Undo last setlist action [Ctrl+Z]"
            data-testid="setlist-undo-btn"
          >
            <IconUndo size={11} className="shrink-0" />
            <span>Undo</span>
          </button>
          <span className="text-content-dim px-0.5">|</span>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedoSetlist}
            className="px-2 py-0.5 text-xs font-mono uppercase text-content-secondary hover:text-white disabled:opacity-30 disabled:hover:text-content-secondary transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue flex items-center gap-1"
            title="Redo setlist action [Ctrl+Y]"
            data-testid="setlist-redo-btn"
          >
            <IconRedo size={11} className="shrink-0" />
            <span>Redo</span>
          </button>
        </div>

        {setlistCount > 0 && (
          <button
            type="button"
            onClick={onClearSetlist}
            className="px-2 py-1 text-xs font-mono text-content-muted hover:text-rose-400 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500"
          >
            CLEAR
          </button>
        )}
      </div>
    </header>
  );
};
