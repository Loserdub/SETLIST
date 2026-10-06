import { useState, useRef, useMemo } from 'react';
import type { Track } from '../../bindings/Track';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { EnergyProfile } from '../../bindings/EnergyProfile';
import type { CostWeights } from '../../bindings/CostWeights';
import type { TransitionModalState } from './types';
import type { Backend } from '../../api';
import { recalculateSetlistTargetEnergy } from './energyCurve';
import { useAppStore } from '../../store/useAppStore';

interface UseSetlistBridgeAndAdviceParams {
  setlist: SetlistEntry[];
  energyProfile: EnergyProfile;
  costWeights: CostWeights;
  backend: Backend;
  persistActiveSetlist: (backend?: Backend) => Promise<void>;
  addToast: (toast: { type: 'success' | 'info' | 'error'; message: string; details?: string }) => void;
}

export function useSetlistBridgeAndAdvice({
  setlist,
  energyProfile,
  costWeights,
  backend,
  persistActiveSetlist,
  addToast,
}: UseSetlistBridgeAndAdviceParams) {
  const activeAdvicePairRef = useRef<string | null>(null);

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

  const [bridgePair, setBridgePair] = useState<{ trackA: Track; trackB: Track } | null>(null);

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

  const closeAdviceModal = () => {
    activeAdvicePairRef.current = null;
    setModalState((prev) => ({ ...prev, isOpen: false }));
  };

  const handleOpenBridgeFinder = (trackAItem: Track, trackBItem: Track) => {
    setBridgePair({ trackA: trackAItem, trackB: trackBItem });
  };

  const closeBridgeFinder = () => {
    setBridgePair(null);
  };

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

  return {
    modalState,
    setModalState,
    trackA,
    trackB,
    handleOpenAdvice,
    closeAdviceModal,
    bridgePair,
    handleOpenBridgeFinder,
    closeBridgeFinder,
    handleInsertBridge,
  };
}
