import { useState, useMemo, useEffect } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { getBackend, type Backend } from '../../api';
import type { ExportTarget } from '../../bindings/ExportTarget';
import type { ExportResult } from '../../bindings/ExportResult';
import type { PreferredTransitionPreset } from './types';
import { computeEnergyTrajectory } from './energyCurve';
import { computeCumulativeTimeline } from './roles';

import { EnergyChart } from './EnergyChart';
import { TransitionAdviceModal } from './TransitionAdviceModal';
import { ConstraintCockpit } from './ConstraintCockpit';
import { TrackSelectionDrawer } from './TrackSelectionDrawer';
import { BridgeFinderModal } from './BridgeFinderModal';
import { FinalDeliveryModal, getDefaultExportFileName, getExportDialogFilters } from '../delivery';
import {
  SetlistToolbar,
  SetlistEmptyState,
  SetlistOptimizationBanner,
  SetlistSequenceList,
} from './components';
import { useSetlistBridgeAndAdvice } from './useSetlistBridgeAndAdvice';

export { getDefaultExportFileName, getExportDialogFilters };

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
  } = useAppStore(
    useShallow((s) => ({
      setlist: s.setlist, setlistName: s.setlistName, setSetlistName: s.setSetlistName,
      energyProfile: s.energyProfile, setEnergyProfile: s.setEnergyProfile,
      costWeights: s.costWeights, setCostWeights: s.setCostWeights,
      reorderSetlist: s.reorderSetlist, removeFromSetlist: s.removeFromSetlist, clearSetlist: s.clearSetlist,
      setRoute: s.setRoute, tracks: s.tracks, loadTracks: s.loadTracks, addToSetlist: s.addToSetlist,
      useMockBackend: s.useMockBackend, selectTrack: s.selectTrack, addToast: s.addToast,
      pins: s.pins, setPins: s.setPins, hasLoadedActiveSetlist: s.hasLoadedActiveSetlist,
      loadActiveSetlist: s.loadActiveSetlist, canUndoSetlist: s.canUndoSetlist, canRedoSetlist: s.canRedoSetlist,
      undoSetlist: s.undoSetlist, redoSetlist: s.redoSetlist, suggestOrder: s.suggestOrder,
      persistActiveSetlist: s.persistActiveSetlist,
    }))
  );

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

  const {
    modalState,
    trackA,
    trackB,
    handleOpenAdvice,
    closeAdviceModal,
    bridgePair,
    handleOpenBridgeFinder,
    closeBridgeFinder,
    handleInsertBridge,
  } = useSetlistBridgeAndAdvice({
    setlist,
    energyProfile,
    costWeights,
    backend,
    persistActiveSetlist,
    addToast,
  });

  // Export State
  const [exportTarget, setExportTarget] = useState<ExportTarget>('RekordboxXml');
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [outputPath, setOutputPath] = useState<string>('');
  const [allowOverwrite] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [lastExportResult, setLastExportResult] = useState<ExportResult | null>(null);

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

  const handleCancelSuggest = () => {
    setIsSuggesting(false);
    useAppStore.setState((s) => ({
      isSuggestingOrder: false,
      setlistVersion: (s.setlistVersion ?? 0) + 1,
    }));
    addToast({
      type: 'info',
      message: 'Optimization cancelled',
      details: 'Active setlist order was preserved.',
    });
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


  const excludedIdsSet = useMemo(() => new Set(pins.excludedIds ?? []), [pins.excludedIds]);
  const pinnedIdsSet = useMemo(() => new Set(pins.pinnedIds ?? []), [pins.pinnedIds]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface-deep text-content-primary">
      {/* Top Header */}
      <SetlistToolbar
        setlistName={setlistName}
        setSetlistName={setSetlistName}
        setlistCount={setlist.length}
        onOpenDeliveryModal={() => setIsExportModalOpen(true)}
        exportTarget={exportTarget}
        setExportTarget={setExportTarget}
        isExporting={isExporting}
        onExportSet={() => void handleExportSet()}
        onOpenExportOptions={() => setIsExportModalOpen(true)}
        canUndoSetlist={canUndoSetlist}
        canRedoSetlist={canRedoSetlist}
        onUndo={() => undoSetlist(backend)}
        onRedo={() => redoSetlist(backend)}
        onClearSetlist={clearSetlist}
      />

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
        onCancelSuggest={handleCancelSuggest}
        onRegenerateUnlocked={() => void handleRegenerateUnlocked()}
        onOpenTrackSelector={() => setIsTrackDrawerOpen(true)}
        trackCount={setlist.length}
        excludedCount={pins.excludedIds?.length ?? 0}
      />

      {/* Main Scrollable Creative Canvas */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Suggest Order Feedback & 1-Click Revert Banner */}
        {showOptimizationBanner && (
          <SetlistOptimizationBanner
            onRevert={() => {
              undoSetlist(backend);
              setShowOptimizationBanner(false);
            }}
            onDismiss={() => setShowOptimizationBanner(false)}
          />
        )}

        {/* Export Notification */}
        {exportMessage && (
          <div className="p-2.5 bg-surface-panel border border-border-base text-content-primary text-xs font-mono flex items-center justify-between">
            <span>✓ {exportMessage}</span>
            <button
              type="button"
              onClick={() => setExportMessage(null)}
              className="text-content-muted hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue"
            >
              ✕
            </button>
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-2.5 bg-surface-raised border border-status-danger-dim text-status-danger text-xs font-mono flex items-center justify-between">
            <span>Error: {errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-content-muted hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500"
            >
              ✕
            </button>
          </div>
        )}

        {setlist.length === 0 ? (
          <SetlistEmptyState
            onOpenTrackDrawer={() => setIsTrackDrawerOpen(true)}
            onBrowseLibrary={() => setRoute('library')}
            onLoadSampleTracks={() => void handleLoadSampleTracks()}
          />
        ) : (
          <div className="max-w-4xl mx-auto space-y-4">
            {/* Energy Curve Progression Chart */}
            <EnergyChart points={energyPoints} profile={energyProfile} />

            {/* Setlist Physical Sequence Container */}
            <SetlistSequenceList
              setlist={setlist}
              energyProfile={energyProfile}
              pins={pins}
              setPins={setPins}
              sensors={sensors}
              handleDragEnd={(e) => void handleDragEnd(e)}
              timelineIntervals={timelineIntervals}
              pinnedIdsSet={pinnedIdsSet}
              excludedIdsSet={excludedIdsSet}
              handleOpenAdvice={handleOpenAdvice}
              handleOpenBridgeFinder={handleOpenBridgeFinder}
              removeFromSetlist={removeFromSetlist}
              selectTrack={selectTrack}
              setRoute={setRoute}
              handleTogglePinTrack={handleTogglePinTrack}
              handleToggleExcludeTrack={handleToggleExcludeTrack}
              reorderSetlist={reorderSetlist}
              handleResequenceFromHere={handleResequenceFromHere}
              backend={backend}
            />
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
          onClose={closeBridgeFinder}
          trackA={bridgePair.trackA}
          trackB={bridgePair.trackB}
          onInsertBridge={(bridgeTrack) => void handleInsertBridge(bridgeTrack)}
        />
      )}

      {/* Transition Advice / Transition Lab Modal */}
      <TransitionAdviceModal
        isOpen={modalState.isOpen}
        onClose={closeAdviceModal}
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
