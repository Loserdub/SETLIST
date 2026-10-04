import { useEffect, useState } from 'react';
import {
  type DiagnosticsInfo,
  fetchDiagnostics,
  openLogFolder,
  copyDiagnosticsReport,
} from './diagnosticsClient';
import { ScanSummaryPanel } from './ScanSummaryPanel';

export function DiagnosticsHelpPanel() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsInfo | null>(null);
  const [includePaths, setIncludePaths] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isOpenFolderError, setIsOpenFolderError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void fetchDiagnostics().then((info) => {
      if (mounted) {
        setDiagnostics(info);
        setIsLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleCopy = async () => {
    if (!diagnostics) return;
    const ok = await copyDiagnosticsReport(diagnostics, includePaths);
    if (ok) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleOpenFolder = async () => {
    setIsOpenFolderError(null);
    try {
      await openLogFolder();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setIsOpenFolderError(msg);
    }
  };

  return (
    <div
      role="region"
      aria-label="Diagnostics and Help"
      data-testid="diagnostics-help-panel"
      className="p-5 bg-[#0a0a0a] border border-[#1c1c1c] rounded-none space-y-5 font-mono text-xs"
    >
      {/* Header */}
      <div className="border-b border-[#161616] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#cfcfcf]">
            System Diagnostics & Help
          </h3>
          <p className="text-xs text-[#a8a8a8] mt-0.5">
            Application build version, database paths, and diagnostic log inspection.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void handleOpenFolder()}
            className="px-3 py-1.5 bg-[#141414] hover:bg-[#1f1f1f] text-white border border-[#27272a] text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
            data-testid="open-log-folder-btn"
          >
            Open Log Folder
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={!diagnostics || isLoading}
            className="px-3.5 py-1.5 bg-[#ededed] hover:bg-white text-black text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] disabled:opacity-40"
            data-testid="copy-diagnostics-btn"
          >
            {isCopied ? '✓ Copied' : 'Copy Diagnostics'}
          </button>
        </div>
      </div>

      {isOpenFolderError && (
        <div className="p-3 bg-[#1c0808] border border-[#7f1d1d] text-[#fca5a5] text-xs">
          Failed to open log folder: {isOpenFolderError}
        </div>
      )}

      {/* Diagnostics Metadata Grid */}
      {isLoading ? (
        <div className="text-xs text-[#a8a8a8] py-2">Loading diagnostics information...</div>
      ) : diagnostics ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* App Version */}
          <div className="p-3 bg-[#050505] border border-[#1c1c1c] space-y-1">
            <span className="text-[#a8a8a8] text-xs">Application Version</span>
            <div className="text-white font-bold text-sm" data-testid="diag-version">
              v{diagnostics.app_version}
            </div>
            <div className="text-xs text-[#71717a]">
              Platform: {diagnostics.os} ({diagnostics.arch})
            </div>
          </div>

          {/* Track Count */}
          <div className="p-3 bg-[#050505] border border-[#1c1c1c] space-y-1">
            <span className="text-[#a8a8a8] text-xs">Library Database Tracks</span>
            <div className="text-white font-bold text-sm" data-testid="diag-track-count">
              {diagnostics.track_count} Tracks
            </div>
            <div className="text-xs text-[#71717a]">
              Persisted in SQLite with PRAGMA WAL enabled
            </div>
          </div>

          {/* Log File Path */}
          <div className="p-3 bg-[#050505] border border-[#1c1c1c] space-y-1">
            <span className="text-[#a8a8a8] text-xs">Log File Path</span>
            <div
              className="text-[#cfcfcf] text-xs break-all font-mono select-all"
              data-testid="diag-log-path"
            >
              {diagnostics.log_file_path}
            </div>
          </div>

          {/* Database Path */}
          <div className="p-3 bg-[#050505] border border-[#1c1c1c] space-y-1">
            <span className="text-[#a8a8a8] text-xs">SQLite Database Path</span>
            <div
              className="text-[#cfcfcf] text-xs break-all font-mono select-all"
              data-testid="diag-db-path"
            >
              {diagnostics.database_path}
            </div>
          </div>
        </div>
      ) : null}

      {/* Include Paths Toggle */}
      <div className="pt-2 flex items-center justify-between border-t border-[#161616]">
        <label className="flex items-center gap-2.5 cursor-pointer text-xs text-[#cfcfcf] select-none">
          <input
            type="checkbox"
            checked={includePaths}
            onChange={(e) => setIncludePaths(e.target.checked)}
            className="w-4 h-4 accent-white cursor-pointer rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
            data-testid="include-paths-checkbox"
          />
          <span>Include paths outside application data folder</span>
        </label>
        <span className="text-xs text-[#71717a]">
          {includePaths
            ? 'Full external paths will be included in copied report'
            : 'External paths redacted for privacy (Default)'}
        </span>
      </div>

      {/* Scan Summary Section */}
      <div className="pt-3 border-t border-[#161616] space-y-3">
        <ScanSummaryPanel />
      </div>
    </div>
  );
}
