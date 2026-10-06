import React from 'react';
import {
  DndContext,
  closestCenter,
  type SensorDescriptor,
  type SensorOptions,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { SetlistEntry } from '../../../bindings/SetlistEntry';
import type { EnergyProfile } from '../../../bindings/EnergyProfile';
import type { Track } from '../../../bindings/Track';
import type { Backend } from '../../../api';
import type { SetlistPins } from '../types';
import type { Route } from '../../../store/types';
import type { TimelineInterval } from '../roles';
import { SortableTrackItem } from '../SortableTrackItem';
import { TransitionCostBadge } from '../TransitionCostBadge';

export interface SetlistSequenceListProps {
  setlist: SetlistEntry[];
  energyProfile: EnergyProfile;
  pins: SetlistPins;
  setPins: (pins: SetlistPins | ((prev: SetlistPins) => SetlistPins)) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sensors: SensorDescriptor<SensorOptions>[];
  handleDragEnd: (event: DragEndEvent) => void;
  timelineIntervals: TimelineInterval[];
  pinnedIdsSet: Set<string>;
  excludedIdsSet: Set<string>;
  handleOpenAdvice: (entryA: SetlistEntry, entryB: SetlistEntry) => void;
  handleOpenBridgeFinder: (trackA: Track, trackB: Track) => void;
  removeFromSetlist: (pos: number) => void;
  selectTrack: (id: string) => void;
  setRoute: (route: Route) => void;
  handleTogglePinTrack: (id: string) => void;
  handleToggleExcludeTrack: (id: string) => void;
  reorderSetlist: (
    oldIndex: number,
    newIndex: number,
    pins?: SetlistPins,
    backend?: Backend
  ) => void;
  handleResequenceFromHere: (index: number) => void;
  backend: Backend;
}

export const SetlistSequenceList: React.FC<SetlistSequenceListProps> = ({
  setlist,
  energyProfile,
  pins,
  setPins,
  sensors,
  handleDragEnd,
  timelineIntervals,
  pinnedIdsSet,
  excludedIdsSet,
  handleOpenAdvice,
  handleOpenBridgeFinder,
  removeFromSetlist,
  selectTrack,
  setRoute,
  handleTogglePinTrack,
  handleToggleExcludeTrack,
  reorderSetlist,
  handleResequenceFromHere,
  backend,
}) => {
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
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
            const prevEnergy =
              prevEntry?.track?.analysis?.energy_score ??
              prevEntry?.target_energy ??
              undefined;
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
                    fromTitle={
                      prevEntry.track?.tags.title ??
                      `Track #${prevEntry.position}`
                    }
                    toTitle={
                      entry.track?.tags.title ?? `Track #${entry.position}`
                    }
                    onOpenAdvice={() => void handleOpenAdvice(prevEntry, entry)}
                    onFindBridge={
                      prevEntry.track && entry.track
                        ? () =>
                            handleOpenBridgeFinder(
                              prevEntry.track!,
                              entry.track!
                            )
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
                    setPins((prev) => ({
                      ...prev,
                      lockFirst: !prev.lockFirst,
                    }))
                  }
                  onToggleLockLast={() =>
                    setPins((prev) => ({
                      ...prev,
                      lockLast: !prev.lockLast,
                    }))
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
                  onToggleExclude={() =>
                    handleToggleExcludeTrack(entry.track_id)
                  }
                  onMoveUp={
                    index > 0
                      ? () =>
                          void reorderSetlist(
                            index,
                            index - 1,
                            pins,
                            backend
                          )
                      : undefined
                  }
                  onMoveDown={
                    index < setlist.length - 1
                      ? () =>
                          void reorderSetlist(
                            index,
                            index + 1,
                            pins,
                            backend
                          )
                      : undefined
                  }
                  onResequenceFromHere={() =>
                    void handleResequenceFromHere(index)
                  }
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
  );
};
