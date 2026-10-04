import { useState, useEffect } from 'react';
import {
  type ScanSummary,
  type FailedScanFile,
  getLatestScanSummary,
  subscribeScanSummary,
  copyFailedFilesList,
} from './scanSummary';

interface ScanSummaryPanelProps {
  summary?: ScanSummary | null;
  onDismiss?: () => void;
}

export function ScanSummaryPanel({ summary: propSummary, onDismiss }: ScanSummaryPanelProps) {
  const [activeSummary, setActiveSummary] = useState<ScanSummary | null>(
    propSummary ?? getLatestScanSummary()
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (propSummary !== undefined) {
      setActiveSummary(propSummary);
      return;
    }

    setActiveSummary(getLatestScanSummary());
    const unsubscribe = subscribeScanSummary((newSummary) => {
      setActiveSummary(newSummary);
    });
    return unsubscribe;
  }, [propSummary]);

  if (!activeSummary) {
    return (
      <div
        data-testid="scan-summary-empty"
        className="p-4 bg-[#0a0a0a] border border-[#1c1c1c] text-xs font-mono text-[#a8a8a8]"
      >
        No scan has been run yet in this session.
      </div>
    );
  }

  const { analyzed, skipped, failed, failedFiles } = activeSummary;

  const handleCopyList = async () => {
    if (failedFiles.length === 0) return;
    const success = await copyFailedFilesList(failedFiles);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      role="region"
      aria-label="Scan Summary"
      data-testid="scan-summary-panel"
      className="p-5 bg-[#0a0a0a] border border-[#1c1c1c] space-y-4 font-mono text-xs"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#161616] pb-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">
            Library Scan Summary
          </h3>
          <p className="text-xs text-[#a8a8a8] mt-0.5">
            Results of the latest folder scan and analysis pass.
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss scan summary"
            className="px-2.5 py-1 text-xs text-[#a8a8a8] hover:text-white bg-[#101010] hover:bg-[#181818] border border-[#242424] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Analyzed */}
        <div className="p-3 bg-[#050505] border border-[#1c1c1c] flex flex-col justify-between">
          <span className="text-[#a8a8a8] text-xs">Analyzed</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-bold text-white" data-testid="count-analyzed">
              {analyzed}
            </span>
            <span className="text-xs text-[#4ade80]">new tracks</span>
          </div>
        </div>

        {/* Skipped */}
        <div className="p-3 bg-[#050505] border border-[#1c1c1c] flex flex-col justify-between">
          <span className="text-[#a8a8a8] text-xs">Skipped</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-bold text-[#cfcfcf]" data-testid="count-skipped">
              {skipped}
            </span>
            <span className="text-xs text-[#a8a8a8]">already in library</span>
          </div>
        </div>

        {/* Failed */}
        <div className="p-3 bg-[#050505] border border-[#1c1c1c] flex flex-col justify-between">
          <span className="text-[#a8a8a8] text-xs">Failed</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={`text-lg font-bold ${failed > 0 ? 'text-[#f87171]' : 'text-white'}`}
              data-testid="count-failed"
            >
              {failed}
            </span>
            <span className={`text-xs ${failed > 0 ? 'text-[#f87171]' : 'text-[#a8a8a8]'}`}>
              {failed === 1 ? 'file failed' : 'files failed'}
            </span>
          </div>
        </div>
      </div>

      {/* Failed Files List */}
      {failed > 0 ? (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#f87171] uppercase tracking-wider">
              Failed Files ({failedFiles.length})
            </span>
            <button
              type="button"
              onClick={() => void handleCopyList()}
              className="px-3 py-1.5 bg-[#141414] hover:bg-[#1f1f1f] text-white border border-[#27272a] text-xs uppercase tracking-wider transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
              data-testid="copy-failed-list-btn"
            >
              {copied ? '✓ Copied' : 'Copy List'}
            </button>
          </div>

          <div
            className="max-h-60 overflow-y-auto border border-[#1c1c1c] bg-[#050505] divide-y divide-[#141414]"
            data-testid="failed-files-list"
          >
            {failedFiles.map((file: FailedScanFile, idx: number) => (
              <div key={`${file.fileName}-${idx}`} className="p-2.5 space-y-1">
                <div className="font-semibold text-white break-all">{file.fileName}</div>
                <div className="text-xs text-[#fca5a5]">{file.reason}</div>
                {file.rawError && file.rawError !== file.reason && (
                  <div className="text-xs text-[#71717a] break-all">{file.rawError}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-3 bg-[#050505] border border-[#162a16] text-[#86efac] text-xs">
          ✓ All scanned files were processed successfully without errors.
        </div>
      )}
    </div>
  );
}
