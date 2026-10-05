import { useState, useMemo, useRef, useEffect } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useAppStore } from '../../store/useAppStore';
import { getBackend, type Backend } from '../../api';
import type { ExportTarget } from '../../bindings/ExportTarget';
import type { ExportResult } from '../../bindings/ExportResult';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { TransitionModalState } from './types';
import { computeEnergyTrajectory } from './energyCurve';

import { SortableTrackItem } from './SortableTrackItem';
import { TransitionCostBadge } from './TransitionCostBadge';
import { EnergyChart } from './EnergyChart';
import { TransitionAdviceModal } from './TransitionAdviceModal';
import { QuickSetModal } from './QuickSetModal';
import { IconUndo, IconRedo, IconSparkles } from '../../components/icons';

export const getDefaultExportFileName = (target: ExportTarget): string => {
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
};

export const getExportDialogFilters = (target: ExportTarget) => {
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
};

interface SetlistViewProps {
  customBackend?: Backend;
}

export function SetlistView({ customBackend }: SetlistViewProps) {
  const {
    setlist,
    setlistName,
    setSetlistName,
    energyProfile,
    setEnergyProfile,
    costWeights,
    reorderSetlist,
    removeFromSetlist,
    clearSetlist,
    setRoute,
    tracks,
    addToSetlist,
    useMockBackend,
    selectTrack,
    addToast,
    pins,
    setPins,
    hasLoadedActiveSetlist,
    loadActiveSetlist,
    canUndoSetlist,
    canRedoSetlist,
    undoSetlist,
    redoSetlist,
    suggestOrder,
    enterStageMode,
  } = useAppStore();

  const backend = customBackend ?? getBackend(useMockBackend);

  useEffect(() => {
    if (!hasLoadedActiveSetlist) {
      void loadActiveSetlist(backend);
    }
  }, [hasLoadedActiveSetlist, loadActiveSetlist, backend]);

  // Suggesting Order State & Revert Notice
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showOptimizationBanner, setShowOptimizationBanner] = useState(false);

  // More Menu State
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isQuickSetOpen, setIsQuickSetOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close more menu on click outside or Escape key
  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMoreMenuOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMoreMenuOpen]);

  // Export State
  const [exportTarget, setExportTarget] = useState<ExportTarget>('RekordboxXml');
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [outputPath, setOutputPath] = useState<string>('');
  const [allowOverwrite, setAllowOverwrite] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  // Transition Advice Modal State
  const [modalState, setModalState] = useState<TransitionModalState>({
    isOpen: false,
    trackAId: null,
    trackBId: null,
    trackATitle: '',
    trackBTitle: '',
    advice: null,
    isLoading: false,
    error: null,
  });

  // dnd-kit Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Energy Trajectory calculation for SVG chart
  const energyPoints = useMemo(() => {
    return computeEnergyTrajectory(setlist, energyProfile);
  }, [setlist, energyProfile]);

  // Active Advice Request Tracking (avoids stale advice replacing newer adjacent pair advice)
  const activeAdvicePairRef = useRef<string | null>(null);

  // Handle Drag Reorder
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = setlist.findIndex((e) => e.track_id === active.id);
    const newIndex = setlist.findIndex((e) => e.track_id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    await reorderSetlist(oldIndex, newIndex, pins, backend);
  };

  // Setlist Undo / Redo Global Keyboard Shortcuts (Ctrl+Z / Ctrl+Y / Cmd+Z / Cmd+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedoSetlist) redoSetlist(backend);
        } else {
          if (canUndoSetlist) undoSetlist(backend);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (canRedoSetlist) redoSetlist(backend);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndoSetlist, canRedoSetlist, undoSetlist, redoSetlist, backend]);

  // Suggest Order with Pin Preservation & Undo History
  const handleSuggestOrder = async () => {
    if (setlist.length < 2) return;
    setIsSuggesting(true);
    setErrorMessage(null);

    try {
      await suggestOrder(backend);
      setShowOptimizationBanner(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      addToast({
        type: 'error',
        message: 'Order suggestion failed',
        details: msg,
      });
    } finally {
      setIsSuggesting(false);
    }
  };

  // Open Transition Advice Modal
  const handleOpenAdvice = async (entryA: SetlistEntry, entryB: SetlistEntry) => {
    const pairKey = `${entryA.track_id}->${entryB.track_id}`;
    activeAdvicePairRef.current = pairKey;

    setModalState({
      isOpen: true,
      trackAId: entryA.track_id,
      trackBId: entryB.track_id,
      trackATitle: entryA.track?.tags.title ?? 'Track A',
      trackBTitle: entryB.track?.tags.title ?? 'Track B',
      advice: entryB.transition ?? null,
      isLoading: !entryB.transition,
      error: null,
    });

    if (!entryB.transition) {
      try {
        const de = (entryB.target_energy ?? 0) - (entryA.target_energy ?? 0);
        const advice = await backend.getAdvice(
          entryA.track_id,
          entryB.track_id,
          energyProfile,
          costWeights,
          de
        );

        if (activeAdvicePairRef.current === pairKey) {
          setModalState((prev) => {
            if (!prev.isOpen || prev.trackAId !== entryA.track_id || prev.trackBId !== entryB.track_id) {
              return prev;
            }
            return {
              ...prev,
              advice,
              isLoading: false,
            };
          });
        }
      } catch (err: unknown) {
        if (activeAdvicePairRef.current === pairKey) {
          const msg = err instanceof Error ? err.message : String(err);
          setModalState((prev) => {
            if (!prev.isOpen || prev.trackAId !== entryA.track_id || prev.trackBId !== entryB.track_id) {
              return prev;
            }
            return {
              ...prev,
              error: msg,
              isLoading: false,
            };
          });
        }
      }
    }
  };

  // Export Set
  const handleExportSet = async (
    overrideTarget?: ExportTarget,
    overridePath?: string,
    overrideOverwrite?: boolean
  ) => {
    if (setlist.length === 0) return;
    setIsExporting(true);
    setExportMessage(null);
    setErrorMessage(null);
    try {
      const target = overrideTarget ?? exportTarget;
      let path = overridePath !== undefined ? overridePath : (outputPath.trim() || undefined);

      // If destination path is not explicitly set, use native save dialog with format-based default filename
      if (path === undefined) {
        try {
          const defaultPath = getDefaultExportFileName(target);
          const selected = await save({
            defaultPath,
            filters: getExportDialogFilters(target),
            title: 'Export Setlist',
          });
          if (selected) {
            path = selected;
            setOutputPath(selected);
          } else if (selected === null) {
            // User explicitly cancelled save dialog
            setIsExporting(false);
            return;
          }
        } catch {
          // Native dialog unavailable in non-Tauri / test environments
        }
      }

      const overwrite = overrideOverwrite !== undefined ? overrideOverwrite : allowOverwrite;
      const result: ExportResult = await backend.exportSet(setlist, target, path, overwrite);
      const msg = `Exported ${result.track_count} tracks to ${result.format} (${result.path})`;
      setExportMessage(msg);
      setIsExportModalOpen(false);
      addToast({
        type: 'success',
        message: 'Setlist exported successfully',
        details: msg,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      addToast({
        type: 'error',
        message: 'Setlist export failed',
        details: msg,
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Load sample tracks
  const handleLoadSampleTracks = async () => {
    clearSetlist();
    let sourceTracks = tracks;
    if (sourceTracks.length === 0) {
      sourceTracks = await backend.listTracks();
      useAppStore.setState({ tracks: sourceTracks });
    }
    const sample = sourceTracks.slice(0, 6);
    for (const t of sample) {
      await addToSetlist(t.id);
    }
  };

  const trackA = useMemo(() => {
    return modalState.trackAId
      ? setlist.find((e) => e.track_id === modalState.trackAId)?.track ?? null
      : null;
  }, [modalState.trackAId, setlist]);

  const trackB = useMemo(() => {
    return modalState.trackBId
      ? setlist.find((e) => e.track_id === modalState.trackBId)?.track ?? null
      : null;
  }, [modalState.trackBId, setlist]);

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#080808] text-[#ededed]">
      {/* Top Header */}
      <header className="px-5 py-3 border-b border-[#1c1c1c] bg-[#0a0a0a] flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <input
              type="text"
              value={setlistName}
              onChange={(e) => setSetlistName(e.target.value)}
              className="text-sm font-mono font-bold tracking-wider text-[#ededed] bg-transparent border-b border-transparent hover:border-[#333333] focus:border-[#38bdf8] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8] transition-colors uppercase"
              title="Click to rename setlist"
            />
            <span className="text-xs font-mono px-2 py-0.5 border border-[#222222] bg-[#111111] text-[#cfcfcf]">
              {setlist.length} {setlist.length === 1 ? 'track' : 'tracks'}
            </span>
          </div>
          <p className="text-xs font-mono text-[#a8a8a8] mt-0.5">
            Sequential ordering co-pilot • Cost model harmonic alignment & energy curve solver
          </p>
        </div>

        {/* Action Toolbar: Three primary buttons only + More menu */}
        <div className="flex items-center gap-2">
          {/* 1. Suggest order */}
          <button
            type="button"
            onClick={() => void handleSuggestOrder()}
            disabled={setlist.length < 2 || isSuggesting}
            className="px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#262626] disabled:opacity-30 text-white text-xs font-mono font-medium uppercase tracking-wider border border-[#333333] transition-colors cursor-pointer flex items-center gap-1.5 rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
            title="Auto-optimize setlist sequence respecting locked pins and energy curve"
            data-testid="setlist-suggest-btn"
          >
            <span className="flex items-center gap-1.5">
              <IconSparkles size={12} className={isSuggesting ? 'animate-spin' : ''} />
              {isSuggesting ? 'Optimizing...' : 'Suggest order'}
            </span>
          </button>

          {/* 2. Play set */}
          <button
            type="button"
            onClick={enterStageMode}
            disabled={setlist.length < 2}
            className="px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#262626] disabled:opacity-30 text-white text-xs font-mono font-medium uppercase tracking-wider border border-[#333333] transition-colors cursor-pointer flex items-center gap-1.5 rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
            title="Enter full-screen live performance mode"
            aria-label="Play set"
            data-testid="setlist-play-btn"
          >
            <span>Play set</span>
          </button>

          {/* 3. Export */}
          <button
            type="button"
            onClick={() => void handleExportSet()}
            disabled={setlist.length === 0 || isExporting}
            className="px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#262626] disabled:opacity-30 text-white text-xs font-mono font-medium uppercase tracking-wider border border-[#333333] transition-colors cursor-pointer flex items-center gap-1.5 rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
            title="Export setlist to DJ hardware or file formats"
            aria-label="Export"
            data-testid="setlist-export-btn"
          >
            <span>{isExporting ? 'Exporting...' : 'Export'}</span>
          </button>

          {/* Accessible export options trigger for shortcuts / test compatibility */}
          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            aria-label="Export options"
            title="Configure export destination and options"
            className="sr-only"
          >
            Export options
          </button>

          {/* More menu */}
          <div className="relative" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => setIsMoreMenuOpen((v) => !v)}
              aria-haspopup="true"
              aria-expanded={isMoreMenuOpen}
              aria-label="More"
              title="More options (Energy profile, pins, undo/redo, quick set, clear)"
              className="px-2.5 py-1.5 bg-[#101010] hover:bg-[#1a1a1a] text-[#a8a8a8] hover:text-white text-xs font-mono uppercase tracking-wider border border-[#262626] transition-colors cursor-pointer flex items-center gap-1 rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
              data-testid="setlist-more-btn"
            >
              <span>More ▾</span>
            </button>

            {isMoreMenuOpen && (
              <div className="absolute right-0 mt-1 w-64 bg-[#0e0e0e] border border-[#27272a] shadow-xl p-3 z-30 space-y-3 font-mono text-xs select-none">
                {/* Arc */}
                <div>
                  <span className="block text-xs font-semibold text-[#a8a8a8] uppercase mb-1">
                    Energy Arc
                  </span>
                  <div className="grid grid-cols-3 gap-1 bg-[#090909] p-1 border border-[#222222]">
                    <button
                      type="button"
                      onClick={() => setEnergyProfile('LinearRamp')}
                      className={`px-1.5 py-1 text-xs text-center border transition-colors cursor-pointer ${
                        energyProfile === 'LinearRamp'
                          ? 'bg-[#222222] text-white border-[#383838]'
                          : 'bg-transparent text-[#a8a8a8] hover:text-white border-transparent'
                      }`}
                    >
                      Linear Ramp
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnergyProfile('Wave')}
                      className={`px-1.5 py-1 text-xs text-center border transition-colors cursor-pointer ${
                        energyProfile === 'Wave'
                          ? 'bg-[#222222] text-white border-[#383838]'
                          : 'bg-transparent text-[#a8a8a8] hover:text-white border-transparent'
                      }`}
                    >
                      Wave
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnergyProfile('PeakPlateau')}
                      className={`px-1.5 py-1 text-xs text-center border transition-colors cursor-pointer ${
                        energyProfile === 'PeakPlateau'
                          ? 'bg-[#222222] text-white border-[#383838]'
                          : 'bg-transparent text-[#a8a8a8] hover:text-white border-transparent'
                      }`}
                    >
                      Plateau
                    </button>
                  </div>
                </div>

                {/* Pins */}
                <div>
                  <span className="block text-xs font-semibold text-[#a8a8a8] uppercase mb-1">
                    Pins
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPins((prev) => ({ ...prev, lockFirst: !prev.lockFirst }))}
                      disabled={setlist.length <= 1}
                      title="Lock opening track in first position"
                      className={`flex-1 px-2 py-1 text-xs border text-center transition-colors cursor-pointer ${
                        pins.lockFirst
                          ? 'bg-[#1c1408] text-[#f59e0b] border-[#78350f]'
                          : 'bg-[#090909] text-[#a8a8a8] hover:text-white border-[#222222]'
                      }`}
                    >
                      Lock Opener
                    </button>
                    <button
                      type="button"
                      onClick={() => setPins((prev) => ({ ...prev, lockLast: !prev.lockLast }))}
                      disabled={setlist.length <= 1}
                      title="Lock closing track in last position"
                      className={`flex-1 px-2 py-1 text-xs border text-center transition-colors cursor-pointer ${
                        pins.lockLast
                          ? 'bg-[#1c1408] text-[#f59e0b] border-[#78350f]'
                          : 'bg-[#090909] text-[#a8a8a8] hover:text-white border-[#222222]'
                      }`}
                    >
                      Lock Closer
                    </button>
                  </div>
                </div>

                {/* History */}
                <div>
                  <span className="block text-xs font-semibold text-[#a8a8a8] uppercase mb-1">
                    History
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => undoSetlist(backend)}
                      disabled={!canUndoSetlist}
                      title="Undo last setlist action [Ctrl+Z]"
                      data-testid="setlist-undo-btn"
                      className="flex-1 px-2 py-1 bg-[#090909] border border-[#222222] text-[#cccccc] hover:text-white disabled:opacity-30 disabled:hover:text-[#cccccc] text-center transition-colors cursor-pointer flex items-center justify-center gap-1"
                    >
                      <IconUndo size={11} className="shrink-0" />
                      <span>Undo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => redoSetlist(backend)}
                      disabled={!canRedoSetlist}
                      title="Redo setlist action [Ctrl+Y]"
                      data-testid="setlist-redo-btn"
                      className="flex-1 px-2 py-1 bg-[#090909] border border-[#222222] text-[#cccccc] hover:text-white disabled:opacity-30 disabled:hover:text-[#cccccc] text-center transition-colors cursor-pointer flex items-center justify-center gap-1"
                    >
                      <IconRedo size={11} className="shrink-0" />
                      <span>Redo</span>
                    </button>
                  </div>
                </div>

                {/* Export options */}
                <div className="pt-2 border-t border-[#1c1c1c]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      setIsExportModalOpen(true);
                    }}
                    className="w-full text-left px-2 py-1.5 text-xs text-[#ededed] hover:bg-[#1a1a1a] flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span>Export options...</span>
                    <span className="text-[#a8a8a8] text-xs">Format & path</span>
                  </button>
                </div>

                {/* Quick set trigger */}
                <div className="pt-2 border-t border-[#1c1c1c]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      setIsQuickSetOpen(true);
                    }}
                    className="w-full text-left px-2 py-1.5 text-xs text-[#ededed] hover:bg-[#1a1a1a] flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span>⚡ Quick set...</span>
                    <span className="text-[#a8a8a8] text-xs">Auto-build</span>
                  </button>
                </div>

                {/* Clear Set */}
                {setlist.length > 0 && (
                  <div className="pt-2 border-t border-[#1c1c1c]">
                    <button
                      type="button"
                      onClick={() => {
                        clearSetlist();
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full text-left px-2 py-1.5 text-xs text-rose-400 hover:bg-[#1c0a0a] transition-colors cursor-pointer"
                    >
                      ✕ Clear set
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Suggest Order Feedback & 1-Click Revert Banner */}
        {showOptimizationBanner && (
          <div
            className="p-3 bg-[#142332] border border-[#1e3a5f] text-white text-xs font-mono flex items-center justify-between gap-3 animate-fade-in"
            data-testid="solver-revert-banner"
          >
            <div className="flex items-center gap-2">
              <span className="text-[#38bdf8] font-bold">✨ SEQUENCE OPTIMIZED</span>
              <span className="text-[#cfcfcf] text-xs">
                Arranged by DSP solver for optimal harmonic compatibility and energy progression.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  undoSetlist(backend);
                  setShowOptimizationBanner(false);
                }}
                className="px-2.5 py-1 bg-[#181818] hover:bg-[#222222] text-[#38bdf8] border border-[#38bdf8]/60 text-xs uppercase font-mono transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
                data-testid="revert-suggested-order-btn"
              >
                ↶ Revert to Previous Order
              </button>
              <button
                type="button"
                onClick={() => setShowOptimizationBanner(false)}
                className="text-[#a8a8a8] hover:text-white px-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
                title="Dismiss notice"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Export Notification */}
        {exportMessage && (
          <div className="p-2.5 bg-[#0e0e0e] border border-[#262626] text-[#ededed] text-xs font-mono flex items-center justify-between">
            <span>✓ {exportMessage}</span>
            <button
              type="button"
              onClick={() => setExportMessage(null)}
              className="text-[#a8a8a8] hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8]"
            >
              ✕
            </button>
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-2.5 bg-[#180a0a] border border-[#501515] text-[#f87171] text-xs font-mono flex items-center justify-between">
            <span>Error: {errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-[#a8a8a8] hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500"
            >
              ✕
            </button>
          </div>
        )}

        {setlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-8 border border-[#1e1e1e] bg-[#0c0c0c] max-w-xl mx-auto my-12">
            <h3 className="text-xs font-mono font-bold tracking-widest text-[#cccccc] uppercase">
              Your Setlist is Empty
            </h3>
            <p className="text-xs text-[#71717a] max-w-md mt-2 mb-6 leading-relaxed">
              Add tracks from the catalog to begin building a sequence. Optimize track order, adjust energy progression, and inspect transition advice.
            </p>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setRoute('library')}
                className="px-3 py-1.5 bg-[#181818] hover:bg-[#222222] text-[#ededed] text-xs font-mono uppercase tracking-wider border border-[#2b2b2b] transition-colors cursor-pointer rounded-none"
              >
                Browse Library
              </button>
              <button
                type="button"
                onClick={() => void handleLoadSampleTracks()}
                className="px-3 py-1.5 bg-[#121212] hover:bg-[#1a1a1a] text-[#a1a1aa] hover:text-white text-xs font-mono uppercase tracking-wider border border-[#222222] transition-colors cursor-pointer rounded-none"
              >
                Load Sample Tracks
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-4">
            {/* Energy Curve Progression Chart */}
            <EnergyChart points={energyPoints} profile={energyProfile} />

            {/* Setlist Drag & Drop List */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => void handleDragEnd(e)}
            >
              <SortableContext
                items={setlist.map((e) => e.track_id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {setlist.map((entry, index) => {
                    const isFirst = index === 0;
                    const isLast = index === setlist.length - 1;
                    const prevEntry = index > 0 ? setlist[index - 1] : null;

                    return (
                      <div key={entry.track_id} className="space-y-1">
                        {/* Transition Cost Badge between adjacent tracks */}
                        {prevEntry && (
                          <TransitionCostBadge
                            fromTrack={prevEntry.track}
                            toTrack={entry.track}
                            transition={entry.transition}
                            fromTitle={prevEntry.track?.tags.title ?? `Track #${prevEntry.position}`}
                            toTitle={entry.track?.tags.title ?? `Track #${entry.position}`}
                            onOpenAdvice={() => void handleOpenAdvice(prevEntry, entry)}
                          />
                        )}

                        {/* Draggable Track Item Card */}
                        <SortableTrackItem
                          entry={entry}
                          isFirst={isFirst}
                          isLast={isLast}
                          lockFirst={pins.lockFirst}
                          lockLast={pins.lockLast}
                          onToggleLockFirst={() =>
                            setPins((prev) => ({ ...prev, lockFirst: !prev.lockFirst }))
                          }
                          onToggleLockLast={() =>
                            setPins((prev) => ({ ...prev, lockLast: !prev.lockLast }))
                          }
                          onRemove={(pos) => void removeFromSetlist(pos)}
                          onInspect={(trackId) => {
                            selectTrack(trackId);
                            setRoute('track');
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      {/* Transition Advice Modal / Drawer */}
      <TransitionAdviceModal
        isOpen={modalState.isOpen}
        onClose={() => {
          activeAdvicePairRef.current = null;
          setModalState((prev) => ({ ...prev, isOpen: false }));
        }}
        trackA={trackA}
        trackB={trackB}
        advice={modalState.advice}
        isLoading={modalState.isLoading}
        error={modalState.error}
      />

      {/* Export Options Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="bg-[#0e0e0e] border border-[#27272a] max-w-md w-full p-4 space-y-3.5 select-none rounded-none">
            <div className="flex items-center justify-between border-b border-[#1c1c1c] pb-2.5">
              <h3 className="text-xs font-mono font-bold tracking-wider uppercase text-[#ededed]">
                Export Setlist
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsExportModalOpen(false);
                  setErrorMessage(null);
                }}
                className="text-[#a8a8a8] hover:text-[#ededed] text-xs font-mono cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8]"
                aria-label="Close export modal"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="export-format-select" className="block text-xs font-mono text-[#a8a8a8] uppercase mb-2 font-semibold">
                  Format
                </label>
                {/* Accessible select for assistive technologies and test compatibility */}
                <select
                  id="export-format-select"
                  aria-label="Export format"
                  value={exportTarget}
                  onChange={(e) => setExportTarget(e.target.value as ExportTarget)}
                  className="sr-only"
                >
                  <option value="RekordboxXml">Rekordbox file</option>
                  <option value="M3u8">Playlist (M3U8)</option>
                  <option value="SetSheetMarkdown">Printable set sheet</option>
                  <option value="SetSheetCsv">Set Sheet (CSV)</option>
                </select>

                <div className="space-y-2">
                  {/* Rekordbox file */}
                  <button
                    type="button"
                    onClick={() => setExportTarget('RekordboxXml')}
                    className={`w-full text-left p-2.5 border transition-all cursor-pointer rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] ${
                      exportTarget === 'RekordboxXml'
                        ? 'bg-[#142332] border-[#38bdf8] text-white'
                        : 'bg-[#090909] border-[#222222] text-[#cfcfcf] hover:border-[#333333]'
                    }`}
                    data-testid="export-opt-rekordbox"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider">
                        Rekordbox file
                      </span>
                      {exportTarget === 'RekordboxXml' && (
                        <span className="text-xs text-[#38bdf8] font-bold">●</span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-[#a8a8a8] mt-0.5">
                      Export hot cues and beat grids for Pioneer CDJs and Rekordbox.
                    </p>
                  </button>

                  {/* Playlist (M3U8) */}
                  <button
                    type="button"
                    onClick={() => setExportTarget('M3u8')}
                    className={`w-full text-left p-2.5 border transition-all cursor-pointer rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] ${
                      exportTarget === 'M3u8'
                        ? 'bg-[#142332] border-[#38bdf8] text-white'
                        : 'bg-[#090909] border-[#222222] text-[#cfcfcf] hover:border-[#333333]'
                    }`}
                    data-testid="export-opt-m3u8"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider">
                        Playlist (M3U8)
                      </span>
                      {exportTarget === 'M3u8' && (
                        <span className="text-xs text-[#38bdf8] font-bold">●</span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-[#a8a8a8] mt-0.5">
                      Universal playlist file compatible with media players and other DJ software.
                    </p>
                  </button>

                  {/* Printable set sheet */}
                  <button
                    type="button"
                    onClick={() => setExportTarget('SetSheetMarkdown')}
                    className={`w-full text-left p-2.5 border transition-all cursor-pointer rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] ${
                      exportTarget === 'SetSheetMarkdown' || exportTarget === 'SetSheetCsv'
                        ? 'bg-[#142332] border-[#38bdf8] text-white'
                        : 'bg-[#090909] border-[#222222] text-[#cfcfcf] hover:border-[#333333]'
                    }`}
                    data-testid="export-opt-setsheet"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider">
                        Printable set sheet
                      </span>
                      {(exportTarget === 'SetSheetMarkdown' || exportTarget === 'SetSheetCsv') && (
                        <span className="text-xs text-[#38bdf8] font-bold">●</span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-[#a8a8a8] mt-0.5">
                      Printable tracklist and transition plan in CSV and Markdown.
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="export-destination-input" className="block text-xs font-mono text-[#a8a8a8] uppercase mb-1">
                  Custom Destination Path (optional)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="export-destination-input"
                    type="text"
                    value={outputPath}
                    onChange={(e) => setOutputPath(e.target.value)}
                    placeholder="Auto-generated or choose location..."
                    className="flex-1 bg-[#090909] border border-[#222222] px-2.5 py-1 text-xs font-mono text-[#ededed] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:border-[#38bdf8] placeholder-[#888888]"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const defaultPath = getDefaultExportFileName(exportTarget);
                        const selected = await save({
                          defaultPath,
                          filters: getExportDialogFilters(exportTarget),
                          title: 'Save Export As',
                        });
                        if (selected) {
                          setOutputPath(selected);
                        }
                      } catch {
                        // ignore
                      }
                    }}
                    className="px-2.5 py-1 text-xs font-mono tracking-wider uppercase border border-[#333333] bg-[#161616] hover:bg-[#222222] text-[#d4d4d4] transition-colors cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
                  >
                    Browse...
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="export-overwrite-checkbox"
                  checked={allowOverwrite}
                  onChange={(e) => setAllowOverwrite(e.target.checked)}
                  className="w-3.5 h-3.5 rounded-none border border-[#333333] bg-[#0c0c0c] text-[#ededed] cursor-pointer accent-[#222222] focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
                />
                <label htmlFor="export-overwrite-checkbox" className="text-xs font-mono text-[#a8a8a8] cursor-pointer">
                  Overwrite destination file if it already exists
                </label>
              </div>

              <div className="text-xs font-mono text-[#a8a8a8] bg-[#090909] p-2 border border-[#1a1a1a]">
                Exporting <span className="font-semibold text-[#ededed]">{setlist.length}</span> tracks with cues and transitions.
              </div>

              {errorMessage && (
                <div className="text-xs font-mono text-[#f87171] bg-[#1a0808] border border-[#501515] p-2">
                  ⚠️ {errorMessage}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1c1c1c]">
              <button
                type="button"
                onClick={() => {
                  setIsExportModalOpen(false);
                  setErrorMessage(null);
                }}
                className="px-2.5 py-1 text-xs font-mono text-[#a8a8a8] hover:text-[#ededed] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleExportSet()}
                disabled={isExporting}
                aria-label="Confirm export"
                className="px-3 py-1 bg-[#1a1a1a] hover:bg-[#262626] disabled:opacity-40 text-white text-xs font-mono uppercase tracking-wider border border-[#333333] transition-colors cursor-pointer rounded-none"
              >
                <span>{isExporting ? 'Exporting...' : 'Export Now'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Quick Set Modal */}
      <QuickSetModal
        isOpen={isQuickSetOpen}
        onClose={() => setIsQuickSetOpen(false)}
        customBackend={backend}
      />
    </div>
  );
}

export default SetlistView;
