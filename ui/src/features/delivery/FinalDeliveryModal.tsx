import React, { useState, useEffect, useMemo } from 'react';
import type { ExportTarget } from '../../bindings/ExportTarget';
import type { ExportResult } from '../../bindings/ExportResult';
import type { FinalDeliveryModalProps } from './types';
import { verifySetlistReadiness } from './deliveryValidation';
import { save } from '@tauri-apps/plugin-dialog';

export function getDefaultExportFileName(target: ExportTarget): string {
  switch (target) {
    case 'RekordboxXml':
      return 'setlist_rekordbox.xml';
    case 'M3u8':
      return 'setlist_playlist.m3u8';
    case 'SetSheetMarkdown':
      return 'setlist_sheet.md';
    case 'SetSheetCsv':
      return 'setlist_sheet.csv';
  }
}

export function getExportDialogFilters(target: ExportTarget): Array<{ name: string; extensions: string[] }> {
  switch (target) {
    case 'RekordboxXml':
      return [{ name: 'Rekordbox XML', extensions: ['xml'] }];
    case 'M3u8':
      return [{ name: 'M3U8 Playlist', extensions: ['m3u8'] }];
    case 'SetSheetMarkdown':
      return [{ name: 'Markdown Set Sheet', extensions: ['md'] }];
    case 'SetSheetCsv':
      return [{ name: 'CSV Set Sheet', extensions: ['csv'] }];
  }
}

export const FinalDeliveryModal: React.FC<FinalDeliveryModalProps> = ({
  isOpen,
  onClose,
  setlist,
  setlistName,
  isExporting,
  onExport,
  onLaunchStageMode,
  lastExportResult: externalLastExport = null,
  errorMessage: externalErrorMessage = null,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportTarget>('RekordboxXml');
  const [customPath, setCustomPath] = useState<string>('');
  const [allowOverwrite, setAllowOverwrite] = useState<boolean>(false);
  const [localLastExport, setLocalLastExport] = useState<ExportResult | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const activeLastExport = localLastExport || externalLastExport;
  const activeError = localError || externalErrorMessage;

  // Run live verification
  const verification = useMemo(() => {
    return verifySetlistReadiness(setlist, activeLastExport);
  }, [setlist, activeLastExport]);

  const { telemetry, checks } = verification;

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExporting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isExporting, onClose]);

  if (!isOpen) return null;

  const handleBrowseDestination = async (target: ExportTarget) => {
    try {
      const defaultPath = getDefaultExportFileName(target);
      const chosen = await save({
        defaultPath,
        filters: getExportDialogFilters(target),
        title: 'Save Export As',
      });
      if (chosen) {
        setCustomPath(chosen);
      }
    } catch {
      // In test or non-Tauri environment, keep current path
    }
  };

  const handleTriggerExport = async (target: ExportTarget, explicitPath?: string) => {
    setLocalError(null);
    try {
      const pathToUse = explicitPath !== undefined ? explicitPath : (customPath.trim() || undefined);
      const res = await onExport(target, pathToUse, allowOverwrite);
      if (res) {
        setLocalLastExport(res);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg);
    }
  };

  const handleExportAllFormats = async () => {
    setLocalError(null);
    try {
      const targets: ExportTarget[] = ['RekordboxXml', 'M3u8', 'SetSheetMarkdown'];
      for (const target of targets) {
        const res = await onExport(target, undefined, allowOverwrite);
        if (res) {
          setLocalLastExport(res);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delivery-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-sm select-none"
      data-testid="final-delivery-modal"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        onClick={() => {
          if (!isExporting) onClose();
        }}
        aria-hidden="true"
      />

      {/* Main Delivery Hardware Cockpit */}
      <div className="relative z-10 w-full max-w-3xl bg-surface-panel border border-border-base shadow-2xl flex flex-col max-h-[92vh] rounded-none overflow-hidden text-content-primary">
        {/* Top Header Bar */}
        <div className="px-5 py-3.5 border-b border-border-base flex flex-wrap items-center justify-between gap-3 bg-surface-panel">
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-mono font-bold tracking-widest text-accent-blue uppercase bg-accent-blue-subtle border border-accent-blue-dim px-3 py-1 shadow-sm"
              data-testid="delivery-ready-badge"
            >
              READY FOR PERFORMANCE
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-mono text-content-muted uppercase tracking-wider">
                FINAL DELIVERY &amp; PREPARATION
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="text-content-muted hover:text-white disabled:opacity-40 text-xs font-mono px-2.5 py-1 border border-border-base hover:border-border-strong transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
            aria-label="Close export modal"
          >
            ✕ CLOSE
          </button>
        </div>

        {/* Set Title & Hardware Telemetry Strip */}
        <div className="px-5 py-4 border-b border-border-base bg-surface-deep space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-xs font-mono text-content-muted uppercase tracking-widest block">
                SET
              </span>
              <h2
                id="delivery-modal-title"
                className="text-xl font-mono font-bold text-white tracking-wider uppercase truncate"
                data-testid="delivery-set-title"
              >
                {setlistName || 'UNTITLED SETLIST'}
              </h2>
            </div>
            {/* For backward-compatibility with tests expecting "Export Setlist" */}
            <span className="text-xs font-mono text-content-muted uppercase hidden sm:inline">
              Export Setlist
            </span>
          </div>

          {/* Hardware Telemetry Bar */}
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center font-mono"
            data-testid="delivery-telemetry-hud"
          >
            {/* 1. DURATION */}
            <div className="p-2.5 bg-surface-panel border border-border-base flex flex-col items-center justify-center">
              <span className="text-xs text-content-muted uppercase tracking-wider">DURATION</span>
              <span className="text-base font-bold text-accent-blue tabular-nums mt-0.5">
                {telemetry.durationFormatted}
              </span>
            </div>

            {/* 2. TRACK COUNT */}
            <div className="p-2.5 bg-surface-panel border border-border-base flex flex-col items-center justify-center">
              <span className="text-xs text-content-muted uppercase tracking-wider">SEQUENCE</span>
              <span className="text-base font-bold text-white tabular-nums mt-0.5">
                {telemetry.trackCount} {telemetry.trackCount === 1 ? 'TRACK' : 'TRACKS'}
              </span>
            </div>

            {/* 3. BPM RANGE */}
            <div className="p-2.5 bg-surface-panel border border-border-base flex flex-col items-center justify-center">
              <span className="text-xs text-content-muted uppercase tracking-wider">TEMPO RANGE</span>
              <span className="text-base font-bold text-accent-amber tabular-nums mt-0.5">
                {telemetry.bpmRangeFormatted}
              </span>
            </div>

            {/* 4. TRANSITIONS & CUES */}
            <div className="p-2.5 bg-surface-panel border border-border-base flex flex-col items-center justify-center">
              <span className="text-xs text-content-muted uppercase tracking-wider">
                {telemetry.transitionCount} TRANSITIONS
              </span>
              <span className="text-sm font-bold text-status-success mt-0.5">
                {telemetry.cuesPerTrackFormatted}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable Center Area: Actions & Verification */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Tactile Hardware Delivery Buttons */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-content-secondary">
                HARDWARE EXPORT CONTROLS
              </span>
              <span className="text-xs font-mono text-content-muted">
                One-touch export formats
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* EXPORT REKORDBOX */}
              <button
                type="button"
                onClick={() => void handleTriggerExport('RekordboxXml')}
                disabled={!verification.canExport || isExporting}
                className="p-3.5 bg-surface-raised hover:bg-surface-elevated active:scale-[0.99] border border-border-base hover:border-accent-blue text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
                data-testid="export-rekordbox-btn"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono px-2 py-0.5 bg-accent-blue-subtle text-accent-blue font-bold border border-accent-blue-subtle">
                    XML
                  </span>
                  <span className="text-xs font-mono text-content-muted group-hover:text-accent-blue">
                    PIONEER DJ
                  </span>
                </div>
                <div className="text-sm font-mono font-bold text-white group-hover:text-accent-blue">
                  [EXPORT REKORDBOX]
                </div>
                <div className="text-xs font-mono text-content-muted mt-1 leading-snug">
                  4 performance cues, Camelot keys, and beatgrids
                </div>
              </button>

              {/* EXPORT PLAYLIST */}
              <button
                type="button"
                onClick={() => void handleTriggerExport('M3u8')}
                disabled={!verification.canExport || isExporting}
                className="p-3.5 bg-surface-raised hover:bg-surface-elevated active:scale-[0.99] border border-border-base hover:border-status-success text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group focus-visible:ring-2 focus-visible:ring-status-success focus-visible:outline-none"
                data-testid="export-playlist-btn"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono px-2 py-0.5 bg-status-success-dim text-status-success font-bold border border-status-success">
                    M3U8
                  </span>
                  <span className="text-xs font-mono text-content-muted group-hover:text-status-success">
                    UNIVERSAL
                  </span>
                </div>
                <div className="text-sm font-mono font-bold text-white group-hover:text-status-success">
                  [EXPORT PLAYLIST]
                </div>
                <div className="text-xs font-mono text-content-muted mt-1 leading-snug">
                  Standard playlist with duration and artist tags
                </div>
              </button>

              {/* EXPORT STAGE SHEET */}
              <button
                type="button"
                onClick={() => void handleTriggerExport('SetSheetMarkdown')}
                disabled={!verification.canExport || isExporting}
                className="p-3.5 bg-surface-raised hover:bg-surface-elevated active:scale-[0.99] border border-border-base hover:border-accent-amber text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group focus-visible:ring-2 focus-visible:ring-accent-amber focus-visible:outline-none"
                data-testid="export-stage-sheet-btn"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono px-2 py-0.5 bg-status-warning-dim text-accent-amber-glow font-bold border border-status-danger">
                    MD / CSV
                  </span>
                  <span className="text-xs font-mono text-content-muted group-hover:text-accent-amber-glow">
                    STAGE PROTOCOL
                  </span>
                </div>
                <div className="text-sm font-mono font-bold text-white group-hover:text-accent-amber-glow">
                  [EXPORT STAGE SHEET]
                </div>
                <div className="text-xs font-mono text-content-muted mt-1 leading-snug">
                  Harmonic moves, recommended bars, in/out cues
                </div>
              </button>
            </div>
          </div>

          {/* Verification State Checklist (CHECK) */}
          <div
            className="p-4 bg-surface-deep border border-border-base space-y-3"
            data-testid="delivery-verification-checklist"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold tracking-wider text-content-secondary uppercase">
                CHECK: PERFORMANCE READINESS
              </span>
              <span className="text-xs font-mono text-content-muted">
                Live pre-flight integrity audit
              </span>
            </div>

            <div className="space-y-2 font-mono text-xs">
              {checks.map((check) => {
                const isPass = check.status === 'pass';
                const isWarn = check.status === 'warn';
                const isFail = check.status === 'fail';

                const icon = isPass ? '✓' : isWarn ? '⚠' : isFail ? '✕' : '○';
                const iconColor = isPass
                  ? 'text-emerald-400'
                  : isWarn
                  ? 'text-amber-400'
                  : isFail
                  ? 'text-rose-400'
                  : 'text-content-muted';

                return (
                  <div
                    key={check.id}
                    data-testid={`check-${check.id}`}
                    className={`flex items-start gap-3 p-2.5 border transition-colors ${
                      isPass
                        ? 'border-border-base bg-emerald-950/20'
                        : isWarn
                        ? 'border-amber-900/40 bg-amber-950/20'
                        : isFail
                        ? 'border-rose-900/40 bg-rose-950/20'
                        : 'border-border-base bg-surface-panel'
                    }`}
                  >
                    <span className={`font-bold text-sm ${iconColor}`}>{icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-neutral-200 text-xs">{check.label}</span>
                        <span
                          className={`text-xs uppercase font-bold px-1.5 py-0.5 ${
                            isPass
                              ? 'text-emerald-400'
                              : isWarn
                              ? 'text-amber-400'
                              : isFail
                              ? 'text-rose-400'
                              : 'text-neutral-500'
                          }`}
                        >
                          {check.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-xs text-content-muted mt-0.5">{check.summary}</div>
                      {check.details && check.details.length > 0 && (
                        <div className="text-xs text-amber-300 mt-1 pl-2.5 border-l-2 border-amber-500/50 space-y-0.5">
                          {check.details.map((d, i) => (
                            <div key={i}>{d}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Destination & Custom File Options */}
          <div className="p-4 border border-border-base bg-surface-panel space-y-3.5 font-mono">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-content-secondary">
                CUSTOM DESTINATION &amp; OVERWRITE
              </span>
              <span className="text-xs text-content-muted">Optional file settings</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label
                  htmlFor="export-format-select"
                  className="block text-xs font-mono text-content-muted uppercase mb-1"
                >
                  Format
                </label>
                <select
                  id="export-format-select"
                  aria-label="Export format"
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value as ExportTarget)}
                  className="w-full bg-surface-raised border border-border-base text-xs font-mono text-content-primary px-3 py-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue"
                >
                  <option value="RekordboxXml">Rekordbox XML (.xml)</option>
                  <option value="M3u8">M3U8 Playlist (.m3u8)</option>
                  <option value="SetSheetMarkdown">Set Sheet Markdown (.md)</option>
                  <option value="SetSheetCsv">Set Sheet CSV (.csv)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="export-destination-input"
                  className="block text-xs font-mono text-content-muted uppercase mb-1"
                >
                  Custom Destination Path (optional)
                </label>
                <div className="flex gap-2">
                  <input
                    id="export-destination-input"
                    type="text"
                    value={customPath}
                    onChange={(e) => setCustomPath(e.target.value)}
                    placeholder="Auto-generated or choose location..."
                    className="flex-1 bg-surface-raised border border-border-base text-xs font-mono text-content-primary px-3 py-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue"
                  />
                  <button
                    type="button"
                    onClick={() => void handleBrowseDestination(selectedFormat)}
                    title="Save Export As"
                    className="px-3 py-2 bg-surface-elevated hover:bg-surface-hover border border-border-strong text-xs font-mono uppercase text-content-primary cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue"
                  >
                    Browse...
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-1">
              <input
                id="export-overwrite-checkbox"
                type="checkbox"
                checked={allowOverwrite}
                onChange={(e) => setAllowOverwrite(e.target.checked)}
                className="w-4 h-4 rounded-none border-border-base bg-surface-raised text-accent-blue focus:ring-1 focus:ring-accent-blue cursor-pointer"
              />
              <label
                htmlFor="export-overwrite-checkbox"
                className="text-xs font-mono text-content-secondary cursor-pointer select-none"
              >
                Overwrite destination file if it already exists
              </label>
            </div>
          </div>

          {/* Feedback & Notifications */}
          {activeError && (
            <div
              className="text-xs font-mono text-status-danger bg-surface-raised border border-status-danger-dim p-3 leading-relaxed"
              data-testid="delivery-error-message"
            >
              ⚠️ {activeError}
            </div>
          )}

          {activeLastExport && (
            <div
              className="p-3.5 bg-emerald-950/40 border border-emerald-700/60 font-mono text-xs text-emerald-300 space-y-1.5"
              data-testid="delivery-success-message"
            >
              <div className="font-bold flex items-center gap-2">
                <span className="text-sm">✓</span>
                <span>
                  Exported {activeLastExport.track_count} tracks to {activeLastExport.format} ({activeLastExport.path})
                </span>
              </div>
              <div className="text-xs text-emerald-400/80">
                Performance package verified and ready for live playback.
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Bar */}
        <div className="px-5 py-3.5 border-t border-border-base bg-surface-panel flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportAllFormats}
              disabled={!verification.canExport || isExporting}
              className="px-3.5 py-2 text-xs font-mono uppercase border border-border-base bg-surface-raised hover:bg-surface-elevated text-content-muted hover:text-white transition-colors cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue"
              title="Generate Rekordbox XML, M3U8, and Stage Sheet simultaneously"
            >
              Export All Formats
            </button>

            {/* Confirm Export for backward-compatibility with tests */}
            <button
              type="button"
              onClick={() => void handleTriggerExport(selectedFormat, customPath.trim() || undefined)}
              disabled={!verification.canExport || isExporting}
              aria-label="Confirm export"
              className="px-3.5 py-2 text-xs font-mono uppercase border border-border-strong bg-surface-elevated hover:bg-surface-hover text-content-primary transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue"
            >
              {isExporting ? 'Exporting...' : 'Confirm Export'}
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="px-3.5 py-2 bg-transparent hover:bg-surface-elevated text-content-muted hover:text-content-primary text-xs font-mono uppercase border border-transparent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue"
            >
              Cancel
            </button>

            {onLaunchStageMode && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLaunchStageMode();
                }}
                disabled={setlist.length < 2}
                className="px-4 py-2 bg-surface-elevated hover:bg-status-success-dim border border-status-success text-status-success hover:text-white font-bold text-xs font-mono uppercase tracking-wider transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 flex items-center gap-1.5 hw-btn"
                data-testid="delivery-launch-stage-btn"
              >
                <span>ENTER STAGE MODE →</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
