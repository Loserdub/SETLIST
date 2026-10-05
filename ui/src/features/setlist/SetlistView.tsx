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
import type { Track } from '../../bindings/Track';
import type { ExportTarget } from '../../bindings/ExportTarget';
import type { ExportResult } from '../../bindings/ExportResult';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { TransitionModalState, PreferredTransitionPreset } from './types';
import { computeEnergyTrajectory, recalculateSetlistTargetEnergy } from './energyCurve';
import { computeCumulativeTimeline } from './roles';

import { SortableTrackItem } from './SortableTrackItem';
import { TransitionCostBadge } from './TransitionCostBadge';
import { EnergyChart } from './EnergyChart';
import { TransitionAdviceModal } from './TransitionAdviceModal';
import { ConstraintCockpit } from './ConstraintCockpit';
import { TrackSelectionDrawer } from './TrackSelectionDrawer';
import { BridgeFinderModal } from './BridgeFinderModal';
import { FinalDeliveryModal } from '../delivery';
import { IconUndo, IconRedo, IconSliders } from '../../components/icons';

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
    setCostWeights,
    reorderSetlist,
    removeFromSetlist,
    clearSetlist,
    setRoute,
    tracks,
    loadTracks,
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
    persistActiveSetlist,
  } = useAppStore();

  const backend = customBackend ?? getBackend(useMockBackend);

  useEffect(() => {
    if (!hasLoadedActiveSetlist) {
      void loadActiveSetlist(backend);
    }
  }, [hasLoadedActiveSetlist, loadActiveSetlist, backend]);

  // Target Duration State (Default: 60 minutes)
  const [targetDurationMinutes, setTargetDurationMinutes] = useState<number>(60);

  // Suggesting Order State & Revert Notice
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showOptimizationBanner, setShowOptimizationBanner] = useState(false);

  // Drawers & Modals State
  const [isTrackDrawerOpen, setIsTrackDrawerOpen] = useState(false);
  const [bridgePair, setBridgePair] = useState<{ trackA: Track; trackB: Track } | null>(null);

  // Export State
  const [exportTarget, setExportTarget] = useState<ExportTarget>('RekordboxXml');
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [outputPath, setOutputPath] = useState<string>('');
  const [allowOverwrite] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [lastExportResult, setLastExportResult] = useState<ExportResult | null>(null);

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

  // Cumulative Physical Timeline intervals
  const timelineIntervals = useMemo(() => {
    return computeCumulativeTimeline(setlist);
  }, [setlist]);

  // Total Set Duration
  const totalSetDurationMs = useMemo(() => {
    return setlist.reduce((acc, e) => acc + (e.track?.duration_ms ?? 0), 0);
  }, [setlist]);

  // Active Advice Request Tracking
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

  // Keyboard Shortcuts (Undo / Redo)
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

  // Suggest Order
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

  // Selective Regeneration: Regenerate only unlocked tracks
  const handleRegenerateUnlocked = async () => {
    if (setlist.length < 3) return;
    setIsSuggesting(true);
    setErrorMessage(null);

    try {
      await suggestOrder(backend);
      setShowOptimizationBanner(true);
      addToast({
        type: 'success',
        message: 'Unlocked tracks re-sequenced',
        details: 'Pinned tracks remained anchored in place.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsSuggesting(false);
    }
  };

  // Re-sequence starting from a specific track
  const handleResequenceFromHere = async (fromIndex: number) => {
    if (fromIndex >= setlist.length - 1) return;
    const lockedIds = setlist.slice(0, fromIndex).map((e) => e.track_id);
    setPins((prev) => ({
      ...prev,
      pinnedIds: Array.from(new Set([...(prev.pinnedIds ?? []), ...lockedIds])),
    }));

    setIsSuggesting(true);
    try {
      await suggestOrder(backend);
      addToast({
        type: 'success',
        message: `Set re-sequenced from track #${fromIndex + 1}`,
        details: `Preceding ${fromIndex} track${fromIndex === 1 ? '' : 's'} preserved.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsSuggesting(false);
    }
  };

  // Toggle individual track pin
  const handleTogglePinTrack = (trackId: string) => {
    setPins((prev) => {
      const current = new Set(prev.pinnedIds ?? []);
      if (current.has(trackId)) {
        current.delete(trackId);
      } else {
        current.add(trackId);
      }
      return {
        ...prev,
        pinnedIds: Array.from(current),
      };
    });
  };

  // Toggle individual track exclusion
  const handleToggleExcludeTrack = (trackId: string) => {
    setPins((prev) => {
      const current = new Set(prev.excludedIds ?? []);
      if (current.has(trackId)) {
        current.delete(trackId);
      } else {
        current.add(trackId);
      }
      return {
        ...prev,
        excludedIds: Array.from(current),
      };
    });
  };

  // Preferred transitions / weights preset selection
  const handleSelectWeightsPreset = (preset: PreferredTransitionPreset) => {
    switch (preset) {
      case 'Balanced':
        setCostWeights({ tempo: 0.3, key: 0.35, energy: 0.35, timbre: 0.0 });
        break;
      case 'Harmonic':
        setCostWeights({ tempo: 0.2, key: 0.6, energy: 0.2, timbre: 0.0 });
        break;
      case 'Energy':
        setCostWeights({ tempo: 0.2, key: 0.2, energy: 0.6, timbre: 0.0 });
        break;
      case 'Tempo':
        setCostWeights({ tempo: 0.6, key: 0.2, energy: 0.2, timbre: 0.0 });
        break;
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
      posA: entryA.position,
      posB: entryB.position,
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

  // Open Bridge Finder between two tracks
  const handleOpenBridgeFinder = (trackA: Track, trackB: Track) => {
    setBridgePair({ trackA, trackB });
  };

  // Insert Bridge Track directly into sequence
  const handleInsertBridge = async (bridgeTrack: Track) => {
    if (!bridgePair) return;
    const currentList = [...setlist];
    const idxA = currentList.findIndex((e) => e.track_id === bridgePair.trackA.id);
    if (idxA === -1) return;

    const newEntry: SetlistEntry = {
      position: idxA + 2,
      track_id: bridgeTrack.id,
      track: bridgeTrack,
      transition: null,
      target_energy: null,
    };

    currentList.splice(idxA + 1, 0, newEntry);
    const updated = recalculateSetlistTargetEnergy(currentList, energyProfile);

    useAppStore.setState((state) => ({
      setlist: updated,
      setlistVersion: (state.setlistVersion ?? 0) + 1,
    }));
    await persistActiveSetlist(backend);

    addToast({
      type: 'success',
      message: `Bridge track inserted: ${bridgeTrack.tags.title ?? 'Untitled'}`,
      details: `Connected ${bridgePair.trackA.tags.title ?? 'Track A'} to ${bridgePair.trackB.tags.title ?? 'Track B'}.`,
    });

    // Asynchronously resolve transitions for newly created adjacent pairs
    try {
      const de1 = (updated[idxA + 1].target_energy ?? 0) - (updated[idxA].target_energy ?? 0);
      const trans1 = await backend.getAdvice(
        bridgePair.trackA.id,
        bridgeTrack.id,
        energyProfile,
        costWeights,
        de1
      );

      let trans2 = null;
      if (updated[idxA + 2]) {
        const de2 = (updated[idxA + 2].target_energy ?? 0) - (updated[idxA + 1].target_energy ?? 0);
        trans2 = await backend.getAdvice(
          bridgeTrack.id,
          updated[idxA + 2].track_id,
          energyProfile,
          costWeights,
          de2
        );
      }

      useAppStore.setState((state) => {
        const list = [...state.setlist];
        if (list[idxA + 1]?.track_id === bridgeTrack.id) {
          list[idxA + 1] = { ...list[idxA + 1], transition: trans1 };
          if (list[idxA + 2]) {
            list[idxA + 2] = { ...list[idxA + 2], transition: trans2 };
          }
          return { setlist: list };
        }
        return state;
      });
    } catch {
      // ignore
    }
  };

  // Export Set
  const handleExportSet = async (
    overrideTarget?: ExportTarget,
    overridePath?: string,
    overrideOverwrite?: boolean
  ): Promise<ExportResult | void> => {
    if (setlist.length === 0) return;
    setIsExporting(true);
    setExportMessage(null);
    setErrorMessage(null);
    try {
      const target = overrideTarget ?? exportTarget;
      let path = overridePath !== undefined ? overridePath : (outputPath.trim() || undefined);

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
      setLastExportResult(result);
      addToast({
        type: 'success',
        message: 'Setlist exported successfully',
        details: msg,
      });
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      addToast({
        type: 'error',
        message: 'Setlist export failed',
        details: msg,
      });
      throw err;
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

  const excludedIdsSet = useMemo(() => new Set(pins.excludedIds ?? []), [pins.excludedIds]);
  const pinnedIdsSet = useMemo(() => new Set(pins.pinnedIds ?? []), [pins.pinnedIds]);

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#080808] text-[#ededed]">
      {/* Top Header */}
      <header className="px-5 py-2.5 border-b border-[#1c1c1c] bg-[#0a0a0a] flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
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
          {/* READY FOR PERFORMANCE Delivery Experience */}
          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            disabled={setlist.length === 0}
            data-testid="ready-for-performance-btn"
            className="px-3 py-1 bg-[#142332] hover:bg-[#1a3044] border border-[#1e5480] text-[#38bdf8] hover:text-white font-bold text-xs font-mono uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] disabled:opacity-40 disabled:cursor-not-allowed hw-btn"
            title="Open Ready for Performance delivery checklist and hardware export workflow"
          >
            <span className="hw-led hw-led-cyan" />
            <span>[ READY FOR PERFORMANCE ]</span>
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

      {/* Constraints & Cockpit Controller */}
      <ConstraintCockpit
        totalDurationMs={totalSetDurationMs}
        targetDurationMinutes={targetDurationMinutes}
        onSetTargetDurationMinutes={setTargetDurationMinutes}
        energyProfile={energyProfile}
        onSetEnergyProfile={setEnergyProfile}
        pins={pins}
        onToggleLockFirst={() => setPins((prev) => ({ ...prev, lockFirst: !prev.lockFirst }))}
        onToggleLockLast={() => setPins((prev) => ({ ...prev, lockLast: !prev.lockLast }))}
        costWeights={costWeights}
        onSelectWeightsPreset={handleSelectWeightsPreset}
        isSuggesting={isSuggesting}
        onSuggestOrder={() => void handleSuggestOrder()}
        onRegenerateUnlocked={() => void handleRegenerateUnlocked()}
        onOpenTrackSelector={() => setIsTrackDrawerOpen(true)}
        trackCount={setlist.length}
        excludedCount={pins.excludedIds?.length ?? 0}
      />

      {/* Main Scrollable Creative Canvas */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Suggest Order Feedback & 1-Click Revert Banner */}
        {showOptimizationBanner && (
          <div
            className="p-3 bg-[#142332] border border-[#1e3a5f] text-white text-xs font-mono flex items-center justify-between gap-3 animate-fade-in"
            data-testid="solver-revert-banner"
          >
            <div className="flex items-center gap-2">
              <span className="text-[#38bdf8] font-bold">✨ SEQUENCE OPTIMIZED</span>
              <span className="text-[#cfcfcf] text-xs">
                Arranged by classical DSP solver for optimal harmonic flow and target energy arc.
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
            <p className="text-xs text-[#a8a8a8] max-w-md mt-2 mb-6 leading-relaxed">
              Add tracks from the catalog to begin building a sequence. Optimize track order, adjust energy progression, and inspect transition advice.
            </p>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsTrackDrawerOpen(true)}
                className="px-3 py-1.5 bg-[#181818] hover:bg-[#222222] text-[#38bdf8] text-xs font-mono uppercase tracking-wider border border-[#38bdf8]/40 transition-colors cursor-pointer rounded-none font-semibold"
              >
                + Select Tracks
              </button>
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

            {/* Setlist Physical Sequence Container */}
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
                    const prevEnergy = prevEntry?.track?.analysis?.energy_score ?? prevEntry?.target_energy ?? undefined;
                    const interval = timelineIntervals[index];
                    const isPinned = pinnedIdsSet.has(entry.track_id);
                    const isExcluded = excludedIdsSet.has(entry.track_id);

                    return (
                      <div key={entry.track_id} className="space-y-1">
                        {/* Between-Track Relationship Link (Visible Transition Rail) */}
                        {prevEntry && (
                          <TransitionCostBadge
                            fromTrack={prevEntry.track}
                            toTrack={entry.track}
                            transition={entry.transition}
                            fromTitle={prevEntry.track?.tags.title ?? `Track #${prevEntry.position}`}
                            toTitle={entry.track?.tags.title ?? `Track #${entry.position}`}
                            onOpenAdvice={() => void handleOpenAdvice(prevEntry, entry)}
                            onFindBridge={
                              prevEntry.track && entry.track
                                ? () => handleOpenBridgeFinder(prevEntry.track!, entry.track!)
                                : undefined
                            }
                          />
                        )}

                        {/* Physical Track Module Card */}
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
                          timelineInterval={interval}
                          isPinned={isPinned}
                          onTogglePin={() => handleTogglePinTrack(entry.track_id)}
                          isExcluded={isExcluded}
                          onToggleExclude={() => handleToggleExcludeTrack(entry.track_id)}
                          onMoveUp={
                            index > 0
                              ? () => void reorderSetlist(index, index - 1, pins, backend)
                              : undefined
                          }
                          onMoveDown={
                            index < setlist.length - 1
                              ? () => void reorderSetlist(index, index + 1, pins, backend)
                              : undefined
                          }
                          onResequenceFromHere={() => void handleResequenceFromHere(index)}
                          totalTracks={setlist.length}
                          activeProfile={energyProfile}
                          prevEnergy={prevEnergy}
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

      {/* Track Selection Drawer */}
      <TrackSelectionDrawer
        isOpen={isTrackDrawerOpen}
        onClose={() => setIsTrackDrawerOpen(false)}
        targetDurationMinutes={targetDurationMinutes}
      />

      {/* Bridge Finder Modal */}
      {bridgePair && (
        <BridgeFinderModal
          isOpen={Boolean(bridgePair)}
          onClose={() => setBridgePair(null)}
          trackA={bridgePair.trackA}
          trackB={bridgePair.trackB}
          onInsertBridge={(bridgeTrack) => void handleInsertBridge(bridgeTrack)}
        />
      )}

      {/* Transition Advice / Transition Lab Modal */}
      <TransitionAdviceModal
        isOpen={modalState.isOpen}
        onClose={() => {
          activeAdvicePairRef.current = null;
          setModalState((prev) => ({ ...prev, isOpen: false }));
        }}
        trackA={trackA}
        trackB={trackB}
        posA={modalState.posA}
        posB={modalState.posB}
        advice={modalState.advice}
        isLoading={modalState.isLoading}
        error={modalState.error}
        onOverrideSaved={async () => {
          await loadTracks(backend);
        }}
      />

      {/* Final Delivery & Hardware Export Modal */}
      <FinalDeliveryModal
        isOpen={isExportModalOpen}
        onClose={() => {
          setIsExportModalOpen(false);
          setErrorMessage(null);
        }}
        setlist={setlist}
        setlistName={setlistName}
        isExporting={isExporting}
        onExport={handleExportSet}
        onLaunchStageMode={() => setRoute('stage')}
        lastExportResult={lastExportResult}
        errorMessage={errorMessage}
      />
    </div>
  );
}

export default SetlistView;
