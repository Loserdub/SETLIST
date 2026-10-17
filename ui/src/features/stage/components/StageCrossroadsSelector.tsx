import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Track } from '../../../bindings/Track';
import type { SetlistEntry } from '../../../bindings/SetlistEntry';

export interface StageCrossroadsSelectorProps {
  currentTrack: Track | null;
  nextEntry: SetlistEntry | null;
  allTracks: Track[];
  onCommitBranch: (branchIndex: 1 | 2 | 3, chosenTrack?: Track) => void;
}

interface CrossroadsBranch {
  id: 1 | 2 | 3;
  type: 'planned' | 'energy' | 'vip';
  title: string;
  artist: string;
  badgeLabel: string;
  badgeColor: string;
  keyCamelot: string;
  bpm: number | null;
  energy: number | null;
  reason: string;
  track?: Track;
}

/**
 * StageCrossroadsSelector — 3-Way Tactical Narrative Branching Selector.
 *
 * Implements non-linear live narrative choices at phrase turnaround:
 * [1] Planned Setlist Track (Rehearsed flight path)
 * [2] Energy Surge (Harmonic high-impact crowd-lifter)
 * [3] VIP / Edit / Harmonic Twin (Producer alternate cut or mashup twin)
 *
 * Styled in Pioneer CDJ / Serato pro-audio hardware colorway.
 */
export function StageCrossroadsSelector({
  currentTrack,
  nextEntry,
  allTracks,
  onCommitBranch,
}: StageCrossroadsSelectorProps) {
  const [selectedBranch, setSelectedBranch] = useState<1 | 2 | 3>(1);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Compute the 3 branches
  const branches: CrossroadsBranch[] = useMemo(() => {
    const list: CrossroadsBranch[] = [];

    // Branch 1: Planned Next Track
    if (nextEntry?.track) {
      const t = nextEntry.track;
      const key = t.analysis?.key?.camelot
        ? `${t.analysis.key.camelot.number}${t.analysis.key.camelot.letter}`
        : '—';
      const bpm = t.analysis?.rhythm?.grid?.bpm ? Math.round(t.analysis.rhythm.grid.bpm) : null;
      list.push({
        id: 1,
        type: 'planned',
        title: t.tags?.title ?? nextEntry.track_id,
        artist: t.tags?.artist ?? '',
        badgeLabel: 'PLANNED PATH',
        badgeColor: 'border-[#334155] bg-[#1e293b] text-[#cbd5e1]',
        keyCamelot: key,
        bpm,
        energy: t.analysis?.energy_score ?? null,
        reason: 'Scheduled in active setlist sequence',
        track: t,
      });
    } else {
      list.push({
        id: 1,
        type: 'planned',
        title: 'End of Setlist',
        artist: '',
        badgeLabel: 'PLANNED PATH',
        badgeColor: 'border-[#334155] bg-[#1e293b] text-[#94a3b8]',
        keyCamelot: '—',
        bpm: null,
        energy: null,
        reason: 'No scheduled upcoming track',
      });
    }

    if (!currentTrack) {
      return list;
    }

    const currentKeyNum = currentTrack.analysis?.key?.camelot?.number ?? 1;
    const currentKeyMode = currentTrack.analysis?.key?.camelot?.letter ?? 'A';
    const currentBpm = currentTrack.analysis?.rhythm?.grid?.bpm ?? 120;
    const currentEnergy = currentTrack.analysis?.energy_score ?? 5;

    const keyDistance = (t: Track): number => {
      if (!t.analysis?.key?.camelot) return 99;
      const n = t.analysis.key.camelot.number;
      const m = t.analysis.key.camelot.letter;
      const diff = Math.min(Math.abs(n - currentKeyNum), 12 - Math.abs(n - currentKeyNum));
      return m === currentKeyMode ? diff : diff + 0.5;
    };

    const candidates = allTracks.filter(
      (t) => t.id !== currentTrack.id && (!nextEntry?.track || t.id !== nextEntry.track.id)
    );

    // Branch 2: Energy Surge Candidate
    const energySurge = candidates
      .filter((t) => {
        const bpm = t.analysis?.rhythm?.grid?.bpm;
        if (!bpm || Math.abs(bpm - currentBpm) > 8) return false;
        const e = t.analysis?.energy_score ?? 0;
        return e >= currentEnergy && keyDistance(t) <= 2;
      })
      .sort((a, b) => (b.analysis?.energy_score ?? 0) - (a.analysis?.energy_score ?? 0))[0];

    if (energySurge) {
      const key = energySurge.analysis?.key?.camelot
        ? `${energySurge.analysis.key.camelot.number}${energySurge.analysis.key.camelot.letter}`
        : '—';
      list.push({
        id: 2,
        type: 'energy',
        title: energySurge.tags?.title ?? energySurge.id,
        artist: energySurge.tags?.artist ?? '',
        badgeLabel: 'ENERGY SURGE',
        badgeColor: 'border-[#f59e0b]/60 bg-[#291804] text-[#fcd34d]',
        keyCamelot: key,
        bpm: energySurge.analysis?.rhythm?.grid?.bpm
          ? Math.round(energySurge.analysis.rhythm.grid.bpm)
          : null,
        energy: energySurge.analysis?.energy_score ?? null,
        reason: `+${(energySurge.analysis?.energy_score ?? 0) - currentEnergy} Energy lift • Compatible harmonic key`,
        track: energySurge,
      });
    }

    // Branch 3: VIP / Edit / Harmonic Twin Candidate
    const isVipEdit = (t: Track): boolean => {
      const title = (t.tags?.title ?? '').toLowerCase();
      return (
        title.includes('vip') ||
        title.includes('dub') ||
        title.includes('edit') ||
        title.includes('remix') ||
        title.includes('inst')
      );
    };

    const vipCandidate =
      candidates.find((t) => isVipEdit(t) && keyDistance(t) <= 2) ||
      candidates.find((t) => keyDistance(t) === 0);

    if (vipCandidate) {
      const key = vipCandidate.analysis?.key?.camelot
        ? `${vipCandidate.analysis.key.camelot.number}${vipCandidate.analysis.key.camelot.letter}`
        : '—';
      list.push({
        id: 3,
        type: 'vip',
        title: vipCandidate.tags?.title ?? vipCandidate.id,
        artist: vipCandidate.tags?.artist ?? '',
        badgeLabel: isVipEdit(vipCandidate) ? 'VIP / EDIT SWAP' : 'HARMONIC TWIN',
        badgeColor: 'border-[#00b4d8]/60 bg-[#072438] text-[#38bdf8]',
        keyCamelot: key,
        bpm: vipCandidate.analysis?.rhythm?.grid?.bpm
          ? Math.round(vipCandidate.analysis.rhythm.grid.bpm)
          : null,
        energy: vipCandidate.analysis?.energy_score ?? null,
        reason: isVipEdit(vipCandidate)
          ? 'Producer alternate cut / VIP remix'
          : 'Exact harmonic twin (d=0) for mashup',
        track: vipCandidate,
      });
    }

    return list;
  }, [currentTrack, nextEntry, allTracks]);

  const handleCommit = useCallback(
    (branchId: 1 | 2 | 3) => {
      const branch = branches.find((b) => b.id === branchId);
      if (!branch) return;

      setSelectedBranch(branchId);
      onCommitBranch(branchId, branch.track);

      setToastMessage(`Branch [${branchId}] Committed: ${branch.title}`);
    },
    [branches, onCommitBranch]
  );

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  return (
    <div
      className="w-full bg-[#0d0e12] border border-[#22242c] rounded-sm p-4 flex flex-col gap-3 font-mono shadow-sm"
      data-testid="stage-crossroads-selector"
    >
      {/* Header */}
      <div className="flex items-center justify-between text-xs text-[#94a3b8]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
          <span className="font-bold uppercase tracking-wider text-[#cbd5e1]">
            CROSSROADS BRANCHING
          </span>
          <span className="text-[#475569]">|</span>
          <span className="text-[#94a3b8]">SELECT PIVOT VIA [1] [2] [3]</span>
        </div>
        <div className="text-[11px] text-[#64748b]">TACTICAL NARRATIVE FORK</div>
      </div>

      {/* Confirmation Toast */}
      {toastMessage && (
        <div
          className="py-1 px-3 bg-[#0c283d] border border-[#00b4d8] text-[#38bdf8] text-xs font-bold rounded-sm animate-pulse"
          data-testid="crossroads-feedback"
        >
          ✓ {toastMessage}
        </div>
      )}

      {/* 3 Tactical Branch Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {branches.map((branch) => {
          const isSelected = selectedBranch === branch.id;
          return (
            <div
              key={`crossroad-${branch.id}`}
              data-testid={`crossroads-branch-${branch.id}`}
              className={`p-3.5 rounded-sm border transition-all flex flex-col justify-between gap-3 ${
                isSelected
                  ? 'bg-[#151722] border-[#00b4d8] shadow-[0_0_12px_rgba(0,180,216,0.2)]'
                  : 'bg-[#101117] border-[#1f212c] hover:border-[#333748]'
              }`}
            >
              <div>
                {/* Branch Header Pill */}
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-sm border ${branch.badgeColor}`}
                  >
                    {branch.badgeLabel}
                  </span>
                  <span className="w-5 h-5 flex items-center justify-center bg-[#1c1f2b] border border-[#2b3042] text-white text-xs font-bold rounded-sm">
                    {branch.id}
                  </span>
                </div>

                {/* Track Details */}
                <h4 className="text-sm font-bold text-white line-clamp-1 leading-snug">
                  {branch.title}
                </h4>
                {branch.artist && (
                  <p className="text-xs text-[#94a3b8] truncate mt-0.5">{branch.artist}</p>
                )}

                {/* Metadata Pills */}
                <div className="flex items-center gap-2 mt-2 text-[10px]">
                  {branch.keyCamelot && (
                    <span className="text-[#38bdf8] font-bold">KEY {branch.keyCamelot}</span>
                  )}
                  {branch.bpm && <span className="text-[#cbd5e1]">• {branch.bpm} BPM</span>}
                  {branch.energy && <span className="text-[#f59e0b]">• E:{branch.energy}</span>}
                </div>

                {/* Reason Explanation */}
                <p className="text-[10px] text-[#64748b] mt-1.5 line-clamp-2 leading-relaxed">
                  {branch.reason}
                </p>
              </div>

              {/* Commit Action Button */}
              <button
                type="button"
                onClick={() => handleCommit(branch.id)}
                className={`w-full py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none ${
                  isSelected
                    ? 'bg-[#00b4d8] hover:bg-[#0284c7] text-[#090d16]'
                    : 'bg-[#181b26] hover:bg-[#202433] text-[#cbd5e1] border border-[#252837]'
                }`}
                title={`Commit Branch [${branch.id}]`}
              >
                {isSelected ? '✓ ACTIVE NEXT' : `[ ${branch.id} ] COMMIT BRANCH`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
