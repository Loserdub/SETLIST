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
      <div className="relative z-10 w-full max-w-3xl bg-[#0a0a0c] border border-[#2e2e38] shadow-2xl flex flex-col max-h-[92vh] rounded-none overflow-hidden text-[#ededed]">
        {/* Top Header Bar */}
        <div className="px-5 py-3.5 border-b border-[#22222a] flex flex-wrap items-center justify-between gap-3 bg-[#0e0e12]">
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-mono font-bold tracking-widest text-[#38bdf8] uppercase bg-[#0c2438] border border-[#1e5480] px-3 py-1 shadow-sm"
              data-testid="delivery-ready-badge"
            >
              READY FOR PERFORMANCE
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-mono text-[#a1a1aa] uppercase tracking-wider">
                FINAL DELIVERY &amp; PREPARATION
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="text-[#a1a1aa] hover:text-white disabled:opacity-40 text-xs font-mono px-2.5 py-1 border border-[#272730] hover:border-[#3f3f4e] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
            aria-label="Close export modal"
          >
            ✕ CLOSE
          </button>
        </div>

        {/* Set Title & Hardware Telemetry Strip */}
        <div className="px-5 py-4 border-b border-[#22222a] bg-[#070709] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-xs font-mono text-[#a1a1aa] uppercase tracking-widest block">
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
            <span className="text-xs font-mono text-[#71717a] uppercase hidden sm:inline">
              Export Setlist
            </span>
          </div>

          {/* Hardware Telemetry Bar */}
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center font-mono"
            data-testid="delivery-telemetry-hud"
          >
            {/* 1. DURATION */}
            <div className="p-2.5 bg-[#0f0f14] border border-[#262633] flex flex-col items-center justify-center">
              <span className="text-xs text-[#a1a1aa] uppercase tracking-wider">DURATION</span>
              <span className="text-base font-bold text-[#38bdf8] tabular-nums mt-0.5">
                {telemetry.durationFormatted}
              </span>
            </div>

            {/* 2. TRACK COUNT */}
            <div className="p-2.5 bg-[#0f0f14] border border-[#262633] flex flex-col items-center justify-center">
              <span className="text-xs text-[#a1a1aa] uppercase tracking-wider">SEQUENCE</span>
              <span className="text-base font-bold text-white tabular-nums mt-0.5">
                {telemetry.trackCount} {telemetry.trackCount === 1 ? 'TRACK' : 'TRACKS'}
              </span>
            </div>

            {/* 3. BPM RANGE */}
            <div className="p-2.5 bg-[#0f0f14] border border-[#262633] flex flex-col items-center justify-center">
              <span className="text-xs text-[#a1a1aa] uppercase tracking-wider">TEMPO RANGE</span>
              <span className="text-base font-bold text-[#f59e0b] tabular-nums mt-0.5">
                {telemetry.bpmRangeFormatted}
              </span>
            </div>

            {/* 4. TRANSITIONS & CUES */}
            <div className="p-2.5 bg-[#0f0f14] border border-[#262633] flex flex-col items-center justify-center">
              <span className="text-xs text-[#a1a1aa] uppercase tracking-wider">
                {telemetry.transitionCount} TRANSITIONS
              </span>
              <span className="text-sm font-bold text-[#10b981] mt-0.5">
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
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#d4d4d8]">
                HARDWARE EXPORT CONTROLS
              </span>
              <span className="text-xs font-mono text-[#a1a1aa]">
                One-touch export formats
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* EXPORT REKORDBOX */}
              <button
                type="button"
                onClick={() => void handleTriggerExport('RekordboxXml')}
                disabled={!verification.canExport || isExporting}
                className="p-3.5 bg-[#111116] hover:bg-[#181822] active:scale-[0.99] border border-[#2a2a38] hover:border-[#06b6d4] text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group focus-visible:ring-2 focus-visible:ring-[#06b6d4] focus-visible:outline-none"
                data-testid="export-rekordbox-btn"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono px-2 py-0.5 bg-[#082f49] text-[#38bdf8] font-bold border border-[#0c4a6e]">
                    XML
                  </span>
                  <span className="text-xs font-mono text-[#a1a1aa] group-hover:text-[#38bdf8]">
                    PIONEER DJ
                  </span>
                </div>
                <div className="text-sm font-mono font-bold text-white group-hover:text-[#38bdf8]">
                  [EXPORT REKORDBOX]
                </div>
                <div className="text-xs font-mono text-[#a1a1aa] mt-1 leading-snug">
                  4 performance cues, Camelot keys, and beatgrids
                </div>
              </button>

              {/* EXPORT PLAYLIST */}
              <button
                type="button"
                onClick={() => void handleTriggerExport('M3u8')}
                disabled={!verification.canExport || isExporting}
                className="p-3.5 bg-[#111116] hover:bg-[#181822] active:scale-[0.99] border border-[#2a2a38] hover:border-[#10b981] text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group focus-visible:ring-2 focus-visible:ring-[#10b981] focus-visible:outline-none"
                data-testid="export-playlist-btn"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono px-2 py-0.5 bg-[#064e3b] text-[#34d399] font-bold border border-[#065f46]">
                    M3U8
                  </span>
                  <span className="text-xs font-mono text-[#a1a1aa] group-hover:text-[#34d399]">
                    UNIVERSAL
                  </span>
                </div>
                <div className="text-sm font-mono font-bold text-white group-hover:text-[#34d399]">
                  [EXPORT PLAYLIST]
                </div>
                <div className="text-xs font-mono text-[#a1a1aa] mt-1 leading-snug">
                  Standard playlist with duration and artist tags
                </div>
              </button>

              {/* EXPORT STAGE SHEET */}
              <button
                type="button"
                onClick={() => void handleTriggerExport('SetSheetMarkdown')}
                disabled={!verification.canExport || isExporting}
                className="p-3.5 bg-[#111116] hover:bg-[#181822] active:scale-[0.99] border border-[#2a2a38] hover:border-[#f59e0b] text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group focus-visible:ring-2 focus-visible:ring-[#f59e0b] focus-visible:outline-none"
                data-testid="export-stage-sheet-btn"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono px-2 py-0.5 bg-[#451a03] text-[#fbbf24] font-bold border border-[#78350f]">
                    MD / CSV
                  </span>
                  <span className="text-xs font-mono text-[#a1a1aa] group-hover:text-[#fbbf24]">
                    STAGE PROTOCOL
                  </span>
                </div>
                <div className="text-sm font-mono font-bold text-white group-hover:text-[#fbbf24]">
                  [EXPORT STAGE SHEET]
                </div>
                <div className="text-xs font-mono text-[#a1a1aa] mt-1 leading-snug">
                  Harmonic moves, recommended bars, in/out cues
                </div>
              </button>
            </div>
          </div>

          {/* Verification State Checklist (CHECK) */}
          <div
            className="p-4 bg-[#070709] border border-[#262633] space-y-3"
            data-testid="delivery-verification-checklist"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold tracking-wider text-[#d4d4d8] uppercase">
                CHECK: PERFORMANCE READINESS
              </span>
              <span className="text-xs font-mono text-[#a1a1aa]">
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
                  : 'text-[#71717a]';

                return (
                  <div
                    key={check.id}
                    data-testid={`check-${check.id}`}
                    className={`flex items-start gap-3 p-2.5 border transition-colors ${
                      isPass
                        ? 'border-[#143324] bg-emerald-950/20'
                        : isWarn
                        ? 'border-amber-900/40 bg-amber-950/20'
                        : isFail
                        ? 'border-rose-900/40 bg-rose-950/20'
                        : 'border-[#22222a] bg-[#0d0d12]'
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
                      <div className="text-xs text-[#a1a1aa] mt-0.5">{check.summary}</div>
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
          <div className="p-4 border border-[#262633] bg-[#0c0c10] space-y-3.5 font-mono">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#d4d4d8]">
                CUSTOM DESTINATION &amp; OVERWRITE
              </span>
              <span className="text-xs text-[#a1a1aa]">Optional file settings</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label
                  htmlFor="export-format-select"
                  className="block text-xs font-mono text-[#a1a1aa] uppercase mb-1"
                >
                  Format
                </label>
                <select
                  id="export-format-select"
                  aria-label="Export format"
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value as ExportTarget)}
                  className="w-full bg-[#141418] border border-[#2a2a38] text-xs font-mono text-[#ededed] px-3 py-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8]"
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
                  className="block text-xs font-mono text-[#a1a1aa] uppercase mb-1"
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
                    className="flex-1 bg-[#141418] border border-[#2a2a38] text-xs font-mono text-[#ededed] px-3 py-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8]"
                  />
                  <button
                    type="button"
                    onClick={() => void handleBrowseDestination(selectedFormat)}
                    title="Save Export As"
                    className="px-3 py-2 bg-[#1a1a22] hover:bg-[#252530] border border-[#333344] text-xs font-mono uppercase text-[#ededed] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8]"
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
                className="w-4 h-4 rounded-none border-[#2a2a38] bg-[#141418] text-[#38bdf8] focus:ring-1 focus:ring-[#38bdf8] cursor-pointer"
              />
              <label
                htmlFor="export-overwrite-checkbox"
                className="text-xs font-mono text-[#cccccc] cursor-pointer select-none"
              >
                Overwrite destination file if it already exists
              </label>
            </div>
          </div>

          {/* Feedback & Notifications */}
          {activeError && (
            <div
              className="text-xs font-mono text-[#f87171] bg-[#1a0808] border border-[#501515] p-3 leading-relaxed"
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
        <div className="px-5 py-3.5 border-t border-[#22222a] bg-[#0e0e12] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportAllFormats}
              disabled={!verification.canExport || isExporting}
              className="px-3.5 py-2 text-xs font-mono uppercase border border-[#2a2a38] bg-[#141418] hover:bg-[#1e1e26] text-[#a1a1aa] hover:text-white transition-colors cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8]"
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
              className="px-3.5 py-2 text-xs font-mono uppercase border border-[#333344] bg-[#1a1a22] hover:bg-[#252530] text-[#ededed] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8]"
            >
              {isExporting ? 'Exporting...' : 'Confirm Export'}
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="px-3.5 py-2 bg-transparent hover:bg-[#1a1a22] text-[#a1a1aa] hover:text-[#ededed] text-xs font-mono uppercase border border-transparent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8]"
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
                className="px-4 py-2 bg-[#0d2818] hover:bg-[#133d24] border border-[#1b5e34] text-[#4ade80] hover:text-white font-bold text-xs font-mono uppercase tracking-wider transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 flex items-center gap-1.5 hw-btn"
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
