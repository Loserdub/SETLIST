import React, { useMemo } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../../store/useAppStore';
import { getStartSteps } from './startSteps';
import type { StartScreenProps, StepStatus } from './types';
import { isStageModeEnabled } from '../../config/stageFeatureFlag';

/**
 * Returns accessible Tailwind color classes for the given step status badge.
 * All combinations satisfy WCAG AA contrast (>= 4.5:1) on dark backgrounds.
 */
function getStatusBadgeClasses(status: StepStatus): string {
  switch (status) {
    case 'done':
      return 'bg-[#052e16] text-[#4ade80] border-[#166534]';
    case 'in_progress':
      return 'bg-[#082f49] text-[#38bdf8] border-[#0284c7]';
    case 'not_started':
      return 'bg-[#18181b] text-[#d4d4d8] border-[#3f3f46]';
  }
}

/**
 * StartScreen: A guided 4-step launch and onboarding overview screen
 * displaying live statuses, plain English descriptions, and direct actions.
 */
export function StartScreen({
  onOpenFilteredLibrary,
  onQuickSet,
  onExport,
  onChooseFolder,
}: StartScreenProps): React.JSX.Element {
  // Store values accessed through dedicated selectors only (no direct store state reads)
  const tracks = useAppStore((s) => s.tracks);
  const isLoadingTracks = useAppStore((s) => s.isLoadingTracks);
  const progress = useAppStore((s) => s.progress);
  const setlist = useAppStore((s) => s.setlist);
  const isSuggestingOrder = useAppStore((s) => s.isSuggestingOrder);
  const isStageMode = useAppStore((s) => s.isStageMode);
  const exportStatus = useAppStore((s) => s.exportStatus);

  // Existing store actions
  const scanFolder = useAppStore((s) => s.scanFolder);
  const setRoute = useAppStore((s) => s.setRoute);
  const enterStageMode = useAppStore((s) => s.enterStageMode);

  // Pure steps calculation from live store state
  const steps = useMemo(() => {
    return getStartSteps({
      tracks,
      isLoadingTracks,
      progress,
      setlist,
      isSuggestingOrder,
      isStageMode,
      exportStatus,
    });
  }, [tracks, isLoadingTracks, progress, setlist, isSuggestingOrder, isStageMode, exportStatus]);

  const step1 = steps[0];
  const step2 = steps[1];
  const step3 = steps[2];
  const step4 = steps[3];

  // Step 1: Choose folder & scan
  const handleScanClick = async () => {
    if (onChooseFolder) {
      await onChooseFolder();
      return;
    }
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Choose Music Folder',
      });
      if (selected && typeof selected === 'string') {
        await scanFolder(selected);
      }
    } catch {
      // In tests or non-Tauri environments where native dialog is unmocked
      await scanFolder('');
    }
  };

  // Step 4: Export trigger
  const handleExportClick = () => {
    if (onExport) {
      onExport();
    } else {
      setRoute('setlist');
    }
  };

  return (
    <div
      className="flex-1 flex flex-col h-screen overflow-y-auto bg-[#080808] text-[#ededed] select-none"
      data-testid="start-screen"
    >
      {/* ── Top Header ── */}
      <header className="px-6 py-5 border-b border-[#1c1c1c] bg-[#0a0a0a]">
        <div className="max-w-4xl mx-auto flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-mono font-bold tracking-widest text-white uppercase">
              GETTING STARTED
            </h1>
            <span className="text-xs font-mono px-2 py-0.5 border border-[#2b2b2b] bg-[#141414] text-[#a1a1aa] uppercase tracking-wider">
              GUIDED WORKFLOW
            </span>
          </div>
          <p className="text-sm font-mono text-[#a1a1aa] leading-relaxed">
            Follow the four steps below to scan your music, verify track analysis, construct your set, and perform live.
          </p>
        </div>
      </header>

      {/* ── Main Content Area: 4 Steps ── */}
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto flex flex-col gap-4">
          {/* ═════════════════════════════════════════════════════════ */}
          {/* STEP 1: Add your music                                  */}
          {/* ═════════════════════════════════════════════════════════ */}
          <section
            className="p-5 bg-[#0e0e0e] border border-[#222222] flex flex-col gap-3.5"
            data-testid="start-step-1"
            aria-labelledby="step-1-title"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-mono font-bold px-2 py-0.5 border border-[#333333] bg-[#1a1a1a] text-[#ededed]">
                  STEP 1
                </span>
                <h2
                  id="step-1-title"
                  className="text-sm font-mono font-bold uppercase tracking-wider text-white"
                >
                  {step1.title}
                </h2>
              </div>
              <span
                className={`text-xs font-mono px-2.5 py-0.5 border uppercase tracking-wider font-semibold ${getStatusBadgeClasses(
                  step1.status
                )}`}
                data-testid="start-step-1-status"
              >
                {step1.statusLabel}
              </span>
            </div>

            <p
              className="text-sm font-mono text-[#d4d4d8] leading-relaxed"
              data-testid="start-step-1-sentence"
            >
              {step1.sentence}
            </p>

            {/* Live Progress Bar if scanning with total */}
            {progress && (
              <div
                className="p-2.5 bg-[#080808] border border-[#242424] flex flex-col gap-1.5"
                aria-live="polite"
              >
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#a1a1aa] uppercase tracking-wider">
                    {progress.stage}...
                  </span>
                  <span className="text-[#ededed] font-semibold">
                    {progress.current} / {progress.total} (
                    {Math.round((progress.current / (progress.total || 1)) * 100)}%)
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#1a1a1a] overflow-hidden">
                  <div
                    className="h-full bg-[#38bdf8] transition-all duration-200"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((progress.current / (progress.total || 1)) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => void handleScanClick()}
                disabled={isLoadingTracks}
                className="px-4 py-2 text-xs font-mono uppercase tracking-wider font-semibold text-white bg-[#181818] hover:bg-[#242424] disabled:opacity-40 disabled:cursor-not-allowed border border-[#333333] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:ring-offset-1 focus-visible:ring-offset-[#080808]"
                data-testid="start-scan-btn"
              >
                {isLoadingTracks ? 'Scanning...' : 'Choose Folder & Scan'}
              </button>
            </div>
          </section>

          {/* ═════════════════════════════════════════════════════════ */}
          {/* STEP 2: Check the results                               */}
          {/* ═════════════════════════════════════════════════════════ */}
          <section
            className="p-5 bg-[#0e0e0e] border border-[#222222] flex flex-col gap-3.5"
            data-testid="start-step-2"
            aria-labelledby="step-2-title"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-mono font-bold px-2 py-0.5 border border-[#333333] bg-[#1a1a1a] text-[#ededed]">
                  STEP 2
                </span>
                <h2
                  id="step-2-title"
                  className="text-sm font-mono font-bold uppercase tracking-wider text-white"
                >
                  {step2.title}
                </h2>
              </div>
              <span
                className={`text-xs font-mono px-2.5 py-0.5 border uppercase tracking-wider font-semibold ${getStatusBadgeClasses(
                  step2.status
                )}`}
                data-testid="start-step-2-status"
              >
                {step2.statusLabel}
              </span>
            </div>

            <p
              className="text-sm font-mono text-[#d4d4d8] leading-relaxed"
              data-testid="start-step-2-sentence"
            >
              {step2.sentence}
            </p>

            {/* Main button: opens My Music filtered to those tracks. Hidden if missing prop or if 0 issues */}
            {onOpenFilteredLibrary && (step2.issuesCount ?? 0) > 0 && (
              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onOpenFilteredLibrary}
                  className="px-4 py-2 text-xs font-mono uppercase tracking-wider font-semibold text-white bg-[#181818] hover:bg-[#242424] border border-[#333333] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:ring-offset-1 focus-visible:ring-offset-[#080808]"
                  data-testid="start-review-btn"
                >
                  Open My Music (Filtered)
                </button>
              </div>
            )}
          </section>

          {/* ═════════════════════════════════════════════════════════ */}
          {/* STEP 3: Build your set                                  */}
          {/* ═════════════════════════════════════════════════════════ */}
          <section
            className="p-5 bg-[#0e0e0e] border border-[#222222] flex flex-col gap-3.5"
            data-testid="start-step-3"
            aria-labelledby="step-3-title"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-mono font-bold px-2 py-0.5 border border-[#333333] bg-[#1a1a1a] text-[#ededed]">
                  STEP 3
                </span>
                <h2
                  id="step-3-title"
                  className="text-sm font-mono font-bold uppercase tracking-wider text-white"
                >
                  {step3.title}
                </h2>
              </div>
              <span
                className={`text-xs font-mono px-2.5 py-0.5 border uppercase tracking-wider font-semibold ${getStatusBadgeClasses(
                  step3.status
                )}`}
                data-testid="start-step-3-status"
              >
                {step3.statusLabel}
              </span>
            </div>

            <p
              className="text-sm font-mono text-[#d4d4d8] leading-relaxed"
              data-testid="start-step-3-sentence"
            >
              {step3.sentence}
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {/* Main button opens My Set */}
              <button
                type="button"
                onClick={() => setRoute('setlist')}
                className="px-4 py-2 text-xs font-mono uppercase tracking-wider font-semibold text-white bg-[#181818] hover:bg-[#242424] border border-[#333333] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:ring-offset-1 focus-visible:ring-offset-[#080808]"
                data-testid="start-open-set-btn"
              >
                Open My Set
              </button>

              {/* Second button: Quick set (hidden if prop missing) */}
              {onQuickSet && (
                <button
                  type="button"
                  onClick={onQuickSet}
                  className="px-4 py-2 text-xs font-mono uppercase tracking-wider font-semibold text-[#e2e2e2] bg-[#121212] hover:bg-[#1a1a1a] hover:text-white border border-[#2b2b2b] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:ring-offset-1 focus-visible:ring-offset-[#080808]"
                  data-testid="start-quick-set-btn"
                >
                  Quick set
                </button>
              )}
            </div>
          </section>

          {/* ═════════════════════════════════════════════════════════ */}
          {/* STEP 4: Play and export                                 */}
          {/* ═════════════════════════════════════════════════════════ */}
          <section
            className="p-5 bg-[#0e0e0e] border border-[#222222] flex flex-col gap-3.5"
            data-testid="start-step-4"
            aria-labelledby="step-4-title"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-mono font-bold px-2 py-0.5 border border-[#333333] bg-[#1a1a1a] text-[#ededed]">
                  STEP 4
                </span>
                <h2
                  id="step-4-title"
                  className="text-sm font-mono font-bold uppercase tracking-wider text-white"
                >
                  {step4.title}
                </h2>
              </div>
              <span
                className={`text-xs font-mono px-2.5 py-0.5 border uppercase tracking-wider font-semibold ${getStatusBadgeClasses(
                  step4.status
                )}`}
                data-testid="start-step-4-status"
              >
                {step4.statusLabel}
              </span>
            </div>

            <p
              className="text-sm font-mono text-[#d4d4d8] leading-relaxed"
              data-testid="start-step-4-sentence"
            >
              {step4.sentence}
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {/* Play set (Stage Mode) button, disabled if setlist.length < 2 */}
              {isStageModeEnabled() && (
                <button
                  type="button"
                  onClick={enterStageMode}
                  disabled={setlist.length < 2}
                  className="px-4 py-2 text-xs font-mono uppercase tracking-wider font-semibold text-white bg-[#181818] hover:bg-[#242424] disabled:opacity-40 disabled:cursor-not-allowed border border-[#333333] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:ring-offset-1 focus-visible:ring-offset-[#080808]"
                  data-testid="start-play-stage-btn"
                >
                  Play set (Stage Mode)
                </button>
              )}

              {/* Export button, disabled if setlist.length < 2 */}
              <button
                type="button"
                onClick={handleExportClick}
                disabled={setlist.length < 2}
                className="px-4 py-2 text-xs font-mono uppercase tracking-wider font-semibold text-[#e2e2e2] bg-[#121212] hover:bg-[#1a1a1a] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed border border-[#2b2b2b] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:ring-offset-1 focus-visible:ring-offset-[#080808]"
                data-testid="start-export-btn"
              >
                Export
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
