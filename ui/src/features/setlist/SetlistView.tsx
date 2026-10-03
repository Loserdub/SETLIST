import { useState, useMemo, useRef } from 'react';
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
import { applyPinsToOrderedIds } from './reorder';
import {
  computeEnergyTrajectory,
  getTargetEnergy,
  recalculateSetlistTargetEnergy,
} from './energyCurve';
import { SortableTrackItem } from './SortableTrackItem';
import { TransitionCostBadge } from './TransitionCostBadge';
import { EnergyChart } from './EnergyChart';
import { TransitionAdviceModal } from './TransitionAdviceModal';

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
  } = useAppStore();

  const backend = customBackend ?? getBackend(useMockBackend);

  // Suggesting Order State
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  // Suggest Order with Pin Preservation
  const handleSuggestOrder = async () => {
    if (setlist.length < 2) return;
    const capturedVersion = useAppStore.getState().setlistVersion ?? 0;
    setIsSuggesting(true);
    setErrorMessage(null);

    try {
      const originalIds = setlist.map((e) => e.track_id);
      // Call backend solver
      const solverResult = await backend.suggestOrder(originalIds, energyProfile, costWeights);

      // Stale-request protection: Discard if setlist was mutated while solver was running
      if (useAppStore.getState().setlistVersion !== capturedVersion) {
        return;
      }

      const suggestedIds = solverResult.map((e) => e.track_id);
      const suggestedIdSet = new Set(suggestedIds);
      const missingIds = originalIds.filter((id) => !suggestedIdSet.has(id));
      const fullSuggestedIds = missingIds.length > 0 ? [...suggestedIds, ...missingIds] : suggestedIds;

      // Apply pins (anchor first and/or anchor last)
      const constrainedIds = applyPinsToOrderedIds(originalIds, fullSuggestedIds, pins);

      // Reconstruct SetlistEntries with updated transitions
      const updatedEntries: SetlistEntry[] = [];
      for (let i = 0; i < constrainedIds.length; i++) {
        if (useAppStore.getState().setlistVersion !== capturedVersion) return;

        const id = constrainedIds[i];
        const existingEntry = setlist.find((e) => e.track_id === id);
        const solverEntry = solverResult.find((e) => e.track_id === id);
        const track = existingEntry?.track ?? solverEntry?.track ?? (await backend.getTrack(id));

        if (useAppStore.getState().setlistVersion !== capturedVersion) return;

        let transition = null;
        if (i > 0) {
          const prevEntry = updatedEntries[i - 1];
          // If the solver already computed transition for this adjacent pair, reuse it
          const solverPairIdx = solverResult.findIndex((e) => e.track_id === id);
          if (
            solverPairIdx > 0 &&
            solverResult[solverPairIdx - 1]?.track_id === prevEntry.track_id &&
            solverResult[solverPairIdx]?.transition
          ) {
            transition = solverResult[solverPairIdx].transition;
          } else if (prevEntry.track?.analysis && track?.analysis) {
            try {
              const de =
                getTargetEnergy(energyProfile, i, constrainedIds.length) -
                getTargetEnergy(energyProfile, i - 1, constrainedIds.length);
              transition = await backend.getAdvice(
                prevEntry.track_id,
                id,
                energyProfile,
                costWeights,
                de
              );
            } catch {
              transition = null;
            }
          }
        }

        updatedEntries.push({
          position: i + 1,
          track_id: id,
          track: track ?? null,
          transition,
          target_energy: getTargetEnergy(energyProfile, i, constrainedIds.length),
        });
      }

      // Re-verify version before committing to store
      if (useAppStore.getState().setlistVersion !== capturedVersion) return;

      useAppStore.setState((state) => {
        if ((state.setlistVersion ?? 0) !== capturedVersion) return state;
        return {
          setlist: recalculateSetlistTargetEnergy(updatedEntries, energyProfile),
          setlistVersion: capturedVersion + 1,
        };
      });
    } catch (err: unknown) {
      if (useAppStore.getState().setlistVersion === capturedVersion) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
        addToast({
          type: 'error',
          message: 'Order suggestion failed',
          details: msg,
        });
      }
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
      const path = overridePath !== undefined ? overridePath : (outputPath.trim() || undefined);
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
              className="text-sm font-mono font-bold tracking-wider text-[#ededed] bg-transparent border-b border-transparent hover:border-[#333333] focus:border-[#555555] focus:outline-none transition-colors uppercase"
              title="Click to rename setlist"
            />
            <span className="text-[10px] font-mono px-2 py-0.5 border border-[#222222] bg-[#111111] text-[#777777]">
              {setlist.length} {setlist.length === 1 ? 'track' : 'tracks'}
            </span>
          </div>
          <p className="text-[11px] font-mono text-[#666666] mt-0.5">
            Sequential ordering co-pilot • Cost model harmonic alignment & energy curve solver
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Lock Pins Toolbar */}
          <div className="flex items-center gap-1 bg-[#0e0e0e] border border-[#222222] p-0.5">
            <span className="text-[10px] font-mono font-semibold text-[#666666] uppercase px-1">PINS:</span>
            <button
              type="button"
              onClick={() => setPins((prev) => ({ ...prev, lockFirst: !prev.lockFirst }))}
              disabled={setlist.length <= 1}
              className={`px-2 py-0.5 text-[11px] font-mono transition-colors cursor-pointer border rounded-none ${
                pins.lockFirst
                  ? 'bg-[#1c1408] text-[#f59e0b] border-[#78350f]'
                  : 'bg-transparent text-[#777777] hover:text-[#cccccc] border-transparent'
              }`}
              title="Lock opening track in first position"
            >
              <span>Lock Opener</span>
            </button>

            <button
              type="button"
              onClick={() => setPins((prev) => ({ ...prev, lockLast: !prev.lockLast }))}
              disabled={setlist.length <= 1}
              className={`px-2 py-0.5 text-[11px] font-mono transition-colors cursor-pointer border rounded-none ${
                pins.lockLast
                  ? 'bg-[#1c1408] text-[#f59e0b] border-[#78350f]'
                  : 'bg-transparent text-[#777777] hover:text-[#cccccc] border-transparent'
              }`}
              title="Lock closing track in last position"
            >
              <span>Lock Closer</span>
            </button>
          </div>

          {/* Energy Profile Selector */}
          <div className="flex items-center bg-[#0e0e0e] border border-[#222222] p-0.5">
            <span className="text-[10px] font-mono font-semibold text-[#666666] uppercase px-1.5">ARC:</span>
            <button
              type="button"
              onClick={() => setEnergyProfile('LinearRamp')}
              className={`px-2 py-0.5 text-[11px] font-mono transition-colors cursor-pointer border rounded-none ${
                energyProfile === 'LinearRamp'
                  ? 'bg-[#222222] text-white border-[#383838]'
                  : 'bg-transparent text-[#777777] hover:text-[#cccccc] border-transparent'
              }`}
            >
              Linear Ramp
            </button>
            <button
              type="button"
              onClick={() => setEnergyProfile('Wave')}
              className={`px-2 py-0.5 text-[11px] font-mono transition-colors cursor-pointer border rounded-none ${
                energyProfile === 'Wave'
                  ? 'bg-[#222222] text-white border-[#383838]'
                  : 'bg-transparent text-[#777777] hover:text-[#cccccc] border-transparent'
              }`}
            >
              Wave
            </button>
            <button
              type="button"
              onClick={() => setEnergyProfile('PeakPlateau')}
              className={`px-2 py-0.5 text-[11px] font-mono transition-colors cursor-pointer border rounded-none ${
                energyProfile === 'PeakPlateau'
                  ? 'bg-[#222222] text-white border-[#383838]'
                  : 'bg-transparent text-[#777777] hover:text-[#cccccc] border-transparent'
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
            <span>{isSuggesting ? 'Optimizing...' : 'Suggest Order'}</span>
          </button>

          {/* Export Selector & Button */}
          <div className="flex items-center bg-[#0e0e0e] border border-[#222222] p-0.5">
            <select
              aria-label="Export format"
              value={exportTarget}
              onChange={(e) => setExportTarget(e.target.value as ExportTarget)}
              className="bg-transparent text-xs font-mono text-[#cccccc] px-2 py-0.5 focus:outline-none cursor-pointer border-r border-[#222222] pr-2"
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
              className="px-2.5 py-0.5 bg-[#181818] hover:bg-[#222222] disabled:opacity-40 text-[#ededed] text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer rounded-none"
            >
              <span>{isExporting ? 'Exporting...' : 'Export'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              disabled={setlist.length === 0 || isExporting}
              title="Configure export destination and options"
              aria-label="Export options"
              className="px-1.5 py-0.5 text-[#666666] hover:text-[#cccccc] disabled:opacity-40 text-xs font-mono transition-colors cursor-pointer border-l border-[#222222]"
            >
              [OPT]
            </button>
          </div>

          {setlist.length > 0 && (
            <button
              type="button"
              onClick={clearSetlist}
              className="px-2 py-1 text-xs font-mono text-[#666666] hover:text-rose-400 transition-colors cursor-pointer"
            >
              CLEAR
            </button>
          )}
        </div>
      </header>

      {/* Main Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Export Notification */}
        {exportMessage && (
          <div className="p-2.5 bg-[#0e0e0e] border border-[#262626] text-[#ededed] text-xs font-mono flex items-center justify-between">
            <span>✓ {exportMessage}</span>
            <button
              type="button"
              onClick={() => setExportMessage(null)}
              className="text-[#666666] hover:text-white cursor-pointer"
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
              className="text-[#888888] hover:text-white cursor-pointer"
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
                className="text-[#666666] hover:text-[#ededed] text-xs font-mono cursor-pointer"
                aria-label="Close export modal"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="export-format-select" className="block text-[11px] font-mono text-[#888888] uppercase mb-1">
                  Format
                </label>
                <select
                  id="export-format-select"
                  value={exportTarget}
                  onChange={(e) => setExportTarget(e.target.value as ExportTarget)}
                  className="w-full bg-[#090909] border border-[#222222] px-2.5 py-1 text-xs font-mono text-[#ededed] focus:outline-none focus:border-[#444444]"
                >
                  <option value="RekordboxXml">Rekordbox XML</option>
                  <option value="M3u8">M3U8 Playlist</option>
                  <option value="SetSheetMarkdown">Set Sheet (Markdown)</option>
                  <option value="SetSheetCsv">Set Sheet (CSV)</option>
                </select>
              </div>

              <div>
                <label htmlFor="export-destination-input" className="block text-[11px] font-mono text-[#888888] uppercase mb-1">
                  Custom Destination Path (optional)
                </label>
                <input
                  id="export-destination-input"
                  type="text"
                  value={outputPath}
                  onChange={(e) => setOutputPath(e.target.value)}
                  placeholder="Auto-generated in app directory or enter full path..."
                  className="w-full bg-[#090909] border border-[#222222] px-2.5 py-1 text-xs font-mono text-[#ededed] focus:outline-none focus:border-[#444444] placeholder-[#555555]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="export-overwrite-checkbox"
                  checked={allowOverwrite}
                  onChange={(e) => setAllowOverwrite(e.target.checked)}
                  className="w-3.5 h-3.5 rounded-none border border-[#333333] bg-[#0c0c0c] text-[#ededed] cursor-pointer accent-[#222222]"
                />
                <label htmlFor="export-overwrite-checkbox" className="text-xs font-mono text-[#888888] cursor-pointer">
                  Overwrite destination file if it already exists
                </label>
              </div>

              <div className="text-[11px] font-mono text-[#666666] bg-[#090909] p-2 border border-[#1a1a1a]">
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
                className="px-2.5 py-1 text-xs font-mono text-[#666666] hover:text-[#ededed] transition-colors cursor-pointer"
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
