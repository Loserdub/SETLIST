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
import { IconUndo, IconRedo, IconSliders, IconSparkles } from '../../components/icons';

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

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Lock Pins Toolbar */}
          <div className="flex items-center gap-1 bg-[#0e0e0e] border border-[#222222] p-0.5">
            <span className="text-xs font-mono font-semibold text-[#a8a8a8] uppercase px-1">PINS:</span>
            <button
              type="button"
              onClick={() => setPins((prev) => ({ ...prev, lockFirst: !prev.lockFirst }))}
              disabled={setlist.length <= 1}
              className={`px-2 py-0.5 text-xs font-mono transition-colors cursor-pointer border rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] ${
                pins.lockFirst
                  ? 'bg-[#1c1408] text-[#f59e0b] border-[#78350f]'
                  : 'bg-transparent text-[#a8a8a8] hover:text-[#ededed] border-transparent'
              }`}
              title="Lock opening track in first position"
            >
              <span>Lock Opener</span>
            </button>

            <button
              type="button"
              onClick={() => setPins((prev) => ({ ...prev, lockLast: !prev.lockLast }))}
              disabled={setlist.length <= 1}
              className={`px-2 py-0.5 text-xs font-mono transition-colors cursor-pointer border rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] ${
                pins.lockLast
                  ? 'bg-[#1c1408] text-[#f59e0b] border-[#78350f]'
                  : 'bg-transparent text-[#a8a8a8] hover:text-[#ededed] border-transparent'
              }`}
              title="Lock closing track in last position"
            >
              <span>Lock Closer</span>
            </button>
          </div>

          {/* Energy Profile Selector */}
          <div className="flex items-center bg-[#0e0e0e] border border-[#222222] p-0.5">
            <span className="text-xs font-mono font-semibold text-[#a8a8a8] uppercase px-1.5">ARC:</span>
            <button
              type="button"
              onClick={() => setEnergyProfile('LinearRamp')}
              className={`px-2 py-0.5 text-xs font-mono transition-colors cursor-pointer border rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] ${
                energyProfile === 'LinearRamp'
                  ? 'bg-[#222222] text-white border-[#383838]'
                  : 'bg-transparent text-[#a8a8a8] hover:text-[#ededed] border-transparent'
              }`}
            >
              Linear Ramp
            </button>
            <button
              type="button"
              onClick={() => setEnergyProfile('Wave')}
              className={`px-2 py-0.5 text-xs font-mono transition-colors cursor-pointer border rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] ${
                energyProfile === 'Wave'
                  ? 'bg-[#222222] text-white border-[#383838]'
                  : 'bg-transparent text-[#a8a8a8] hover:text-[#ededed] border-transparent'
              }`}
            >
              Wave
            </button>
            <button
              type="button"
              onClick={() => setEnergyProfile('PeakPlateau')}
              className={`px-2 py-0.5 text-xs font-mono transition-colors cursor-pointer border rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] ${
                energyProfile === 'PeakPlateau'
                  ? 'bg-[#222222] text-white border-[#383838]'
                  : 'bg-transparent text-[#a8a8a8] hover:text-[#ededed] border-transparent'
              }`}
            >
              Plateau
            </button>
          </div>

          {/* Suggest Order Button */}
          <button
            type="button"
            onClick={() => void handleSuggestOrder()}
            disabled={setlist.length < 2 || isSuggesting}
            className="px-3 py-1 bg-[#1a1a1a] hover:bg-[#262626] disabled:opacity-30 text-white text-xs font-mono font-medium uppercase tracking-wider border border-[#333333] transition-colors cursor-pointer flex items-center gap-1.5 rounded-none"
            title="Auto-optimize setlist sequence respecting locked pins and energy curve"
          >
            <span className="flex items-center gap-1.5">
              <IconSparkles size={12} className={isSuggesting ? 'animate-spin' : ''} />
              {isSuggesting ? 'Optimizing...' : 'Suggest Order'}
            </span>
          </button>

          {/* Export Selector & Button */}
          <div className="flex items-center bg-[#0e0e0e] border border-[#222222] p-0.5">
            <select
              aria-label="Export format"
              value={exportTarget}
              onChange={(e) => setExportTarget(e.target.value as ExportTarget)}
              className="bg-transparent text-xs font-mono text-[#cccccc] px-2 py-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8] cursor-pointer border-r border-[#222222] pr-2"
            >
              <option value="RekordboxXml" className="bg-[#111111] text-[#ededed]">
                Rekordbox XML
              </option>
              <option value="M3u8" className="bg-[#111111] text-[#ededed]">
                M3U8 Playlist
              </option>
              <option value="SetSheetMarkdown" className="bg-[#111111] text-[#ededed]">
                Set Sheet (MD)
              </option>
              <option value="SetSheetCsv" className="bg-[#111111] text-[#ededed]">
                Set Sheet (CSV)
              </option>
            </select>
            <button
              type="button"
              onClick={() => void handleExportSet()}
              disabled={setlist.length === 0 || isExporting}
              className="px-2.5 py-0.5 bg-[#181818] hover:bg-[#222222] disabled:opacity-40 text-[#ededed] text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer rounded-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8]"
            >
              <span>{isExporting ? 'Exporting...' : 'Export'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              disabled={setlist.length === 0 || isExporting}
              title="Configure export destination and options"
              aria-label="Export options"
              className="px-2 py-1 text-[#a8a8a8] hover:text-[#ededed] disabled:opacity-40 text-xs font-mono transition-colors cursor-pointer border-l border-[#222222] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8] flex items-center justify-center"
            >
              <IconSliders size={12} />
            </button>
          </div>

          {/* Undo / Redo Toolbar */}
          <div className="flex items-center bg-[#0e0e0e] border border-[#222222] p-0.5">
            <button
              type="button"
              onClick={() => undoSetlist(backend)}
              disabled={!canUndoSetlist}
              className="px-2 py-0.5 text-xs font-mono uppercase text-[#cccccc] hover:text-white disabled:opacity-30 disabled:hover:text-[#cccccc] transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8] flex items-center gap-1"
              title="Undo last setlist action [Ctrl+Z]"
              data-testid="setlist-undo-btn"
            >
              <IconUndo size={11} className="shrink-0" />
              <span>Undo</span>
            </button>
            <span className="text-[#666666] px-0.5">|</span>
            <button
              type="button"
              onClick={() => redoSetlist(backend)}
              disabled={!canRedoSetlist}
              className="px-2 py-0.5 text-xs font-mono uppercase text-[#cccccc] hover:text-white disabled:opacity-30 disabled:hover:text-[#cccccc] transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8] flex items-center gap-1"
              title="Redo setlist action [Ctrl+Y]"
              data-testid="setlist-redo-btn"
            >
              <IconRedo size={11} className="shrink-0" />
              <span>Redo</span>
            </button>
          </div>

          {setlist.length > 0 && (
            <button
              type="button"
              onClick={clearSetlist}
              className="px-2 py-1 text-xs font-mono text-[#a8a8a8] hover:text-rose-400 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500"
            >
              CLEAR
            </button>
          )}
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
                <label htmlFor="export-format-select" className="block text-xs font-mono text-[#a8a8a8] uppercase mb-1">
                  Format
                </label>
                <select
                  id="export-format-select"
                  value={exportTarget}
                  onChange={(e) => setExportTarget(e.target.value as ExportTarget)}
                  className="w-full bg-[#090909] border border-[#222222] px-2.5 py-1 text-xs font-mono text-[#ededed] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:border-[#38bdf8]"
                >
                  <option value="RekordboxXml">Rekordbox XML</option>
                  <option value="M3u8">M3U8 Playlist</option>
                  <option value="SetSheetMarkdown">Set Sheet (Markdown)</option>
                  <option value="SetSheetCsv">Set Sheet (CSV)</option>
                </select>
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
    </div>
  );
}

export default SetlistView;
