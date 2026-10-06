import type { Song } from '../bindings/Song';
import type { SongRelationship } from '../bindings/SongRelationship';
import type { SongRelationshipsResponse } from '../bindings/SongRelationshipsResponse';
import type { BridgeCandidateAnalysis } from '../bindings/BridgeCandidateAnalysis';
import type { CatalogCluster } from '../bindings/CatalogCluster';
import type { CatalogOpenersAndClosers } from '../bindings/CatalogOpenersAndClosers';
import type { OpenerCandidate } from '../bindings/OpenerCandidate';
import type { CloserCandidate } from '../bindings/CloserCandidate';
import type { CatalogOutlier } from '../bindings/CatalogOutlier';
import type { CatalogSummaryStats } from '../bindings/CatalogSummaryStats';
import type { DiscoveryCandidatePath } from '../bindings/DiscoveryCandidatePath';
import type { DiscoveryConstraints } from '../bindings/DiscoveryConstraints';
import { mockSongsStore } from './mockData';
import { evaluateMockSongRelationship } from './mockDiscovery';

export async function getMockSongRelationships(songId: string): Promise<SongRelationshipsResponse> {
  const target = mockSongsStore.get(songId);
  if (!target) {
    return { song_id: songId, outgoing: [], incoming: [] };
  }
  const all = Array.from(mockSongsStore.values()).filter((s) => s.id !== songId);
  const outgoing = all
    .map((s) => evaluateMockSongRelationship(target, s))
    .sort((a, b) => b.overall_score - a.overall_score);
  const incoming = all
    .map((s) => evaluateMockSongRelationship(s, target))
    .sort((a, b) => b.overall_score - a.overall_score);
  return { song_id: songId, outgoing, incoming };
}

export async function getMockSongRelationship(fromSongId: string, toSongId: string): Promise<SongRelationship> {
  const from = mockSongsStore.get(fromSongId);
  const to = mockSongsStore.get(toSongId);
  if (!from || !to) {
    throw new Error(`Song not found: ${!from ? fromSongId : toSongId}`);
  }
  return evaluateMockSongRelationship(from, to);
}

export async function getMockPotentialBridges(
  songAId: string,
  songBId: string,
  limit = 5
): Promise<BridgeCandidateAnalysis[]> {
  const songA = mockSongsStore.get(songAId);
  const songB = mockSongsStore.get(songBId);
  if (!songA || !songB) {
    return [];
  }
  const direct = evaluateMockSongRelationship(songA, songB);
  const candidates: BridgeCandidateAnalysis[] = [];

  for (const bridgeSong of mockSongsStore.values()) {
    if (bridgeSong.id === songAId || bridgeSong.id === songBId) continue;
    const relA = evaluateMockSongRelationship(songA, bridgeSong);
    const relB = evaluateMockSongRelationship(bridgeSong, songB);
    const combinedScore = Math.sqrt(relA.overall_score * relB.overall_score);

    const roles: ('HarmonicBridge' | 'TempoBridge' | 'EnergyBridge' | 'StyleBridge')[] = [];
    if (
      relA.explanation.harmony.friction < direct.explanation.harmony.friction &&
      relB.explanation.harmony.friction < direct.explanation.harmony.friction
    ) {
      roles.push('HarmonicBridge');
    }
    if (songA.bpm != null && songB.bpm != null && bridgeSong.bpm != null) {
      const gap = Math.abs(songB.bpm - songA.bpm);
      if (
        gap > 8 &&
        ((songA.bpm < bridgeSong.bpm && bridgeSong.bpm < songB.bpm) ||
          (songB.bpm < bridgeSong.bpm && bridgeSong.bpm < songB.bpm))
      ) {
        roles.push('TempoBridge');
      }
    }
    if (
      songA.energy_rating != null &&
      songB.energy_rating != null &&
      bridgeSong.energy_rating != null
    ) {
      const directE = Math.abs(songB.energy_rating - songA.energy_rating);
      if (
        directE >= 3 &&
        ((songA.energy_rating <= bridgeSong.energy_rating &&
          bridgeSong.energy_rating <= songB.energy_rating) ||
          (songB.energy_rating <= bridgeSong.energy_rating &&
            bridgeSong.energy_rating <= songA.energy_rating))
      ) {
        roles.push('EnergyBridge');
      }
    }

    if (combinedScore > direct.overall_score || roles.length > 0) {
      candidates.push({
        bridge_song: bridgeSong,
        from_a_relationship: relA,
        to_b_relationship: relB,
        combined_score: combinedScore,
        bridge_roles: roles,
        reason: `Connects '${songA.title}' and '${songB.title}' with combined score ${Math.round(
          combinedScore * 100
        )}%.`,
      });
    }
  }

  candidates.sort((a, b) => b.combined_score - a.combined_score);
  return candidates.slice(0, limit);
}

export async function getMockCatalogClusters(): Promise<CatalogCluster[]> {
  const songs = Array.from(mockSongsStore.values());
  if (songs.length < 2) return [];

  const adj = new Map<string, string[]>();
  for (const s of songs) adj.set(s.id, []);

  for (let i = 0; i < songs.length; i++) {
    for (let j = i + 1; j < songs.length; j++) {
      const relAB = evaluateMockSongRelationship(songs[i], songs[j]);
      const relBA = evaluateMockSongRelationship(songs[j], songs[i]);
      if (relAB.overall_score >= 0.68 && relBA.overall_score >= 0.68) {
        adj.get(songs[i].id)?.push(songs[j].id);
        adj.get(songs[j].id)?.push(songs[i].id);
      }
    }
  }

  const visited = new Set<string>();
  const clusters: CatalogCluster[] = [];
  let clusterIdx = 1;

  for (const song of songs) {
    if (visited.has(song.id)) continue;
    const component: string[] = [];
    const queue = [song.id];
    visited.add(song.id);

    while (queue.length > 0) {
      const curr = queue.pop()!;
      component.push(curr);
      for (const nbr of adj.get(curr) || []) {
        if (!visited.has(nbr)) {
          visited.add(nbr);
          queue.push(nbr);
        }
      }
    }

    if (component.length >= 2) {
      const members = component.map((id) => mockSongsStore.get(id)!).filter(Boolean);
      const bpms = members.map((m) => m.bpm).filter((b): b is number => b != null);
      const center_bpm = bpms.length ? bpms.reduce((a, b) => a + b, 0) / bpms.length : null;
      const keys = Array.from(
        new Set(
          members
            .map((m) => m.camelot_code || m.musical_key)
            .filter((k): k is string => Boolean(k))
        )
      ).sort();
      const energies = members.map((m) => m.energy_rating).filter((e): e is number => e != null);
      const average_energy = energies.length
        ? energies.reduce((a, b) => a + b, 0) / energies.length
        : null;

      clusters.push({
        id: `cluster_${clusterIdx++}`,
        label: `Cluster #${clusterIdx - 1}: ${
          center_bpm ? `~${Math.round(center_bpm)} BPM` : 'Mixed'
        } (${keys.join(', ')})`,
        song_ids: component,
        center_bpm,
        camelot_keys: keys,
        average_energy,
        cohesion_score: 0.82,
        description: `Natural cluster of ${component.length} tracks with compatible tempo and harmonic progression.`,
      });
    }
  }

  return clusters.sort((a, b) => b.song_ids.length - a.song_ids.length);
}

export async function getMockCatalogOpenersAndClosers(): Promise<CatalogOpenersAndClosers> {
  const songs = Array.from(mockSongsStore.values());
  const openers: OpenerCandidate[] = [];
  const closers: CloserCandidate[] = [];

  for (const song of songs) {
    const others = songs.filter((s) => s.id !== song.id);
    const outRels = others.map((s) => evaluateMockSongRelationship(song, s));
    const inRels = others.map((s) => evaluateMockSongRelationship(s, song));

    const outCount = outRels.filter((r) => r.overall_score >= 0.7).length;
    const inCount = inRels.filter((r) => r.overall_score >= 0.7).length;

    const outRatio = others.length ? outCount / others.length : 1;
    const inRatio = others.length ? inCount / others.length : 1;

    const opScore =
      0.5 +
      outRatio * 0.35 +
      (song.energy_rating && song.energy_rating >= 4 && song.energy_rating <= 7 ? 0.15 : 0.0);
    const clScore =
      0.5 + inRatio * 0.35 + (song.energy_rating && song.energy_rating >= 8 ? 0.15 : 0.0);

    openers.push({
      song_id: song.id,
      title: song.title,
      artist: song.artist,
      opener_score: Math.min(1.0, opScore),
      compatible_outbound_count: outCount,
      energy_rating: song.energy_rating,
      bpm: song.bpm,
      reasons: [
        `Flows cleanly into ${outCount} catalog tracks (${Math.round(outRatio * 100)}% reachability).`,
      ],
    });

    closers.push({
      song_id: song.id,
      title: song.title,
      artist: song.artist,
      closer_score: Math.min(1.0, clScore),
      compatible_inbound_count: inCount,
      energy_rating: song.energy_rating,
      bpm: song.bpm,
      reasons: [
        `Approached smoothly by ${inCount} catalog tracks (${Math.round(inRatio * 100)}% reachability).`,
      ],
    });
  }

  openers.sort((a, b) => b.opener_score - a.opener_score);
  closers.sort((a, b) => b.closer_score - a.closer_score);

  return { openers, closers };
}

export async function getMockCatalogOutliers(songs: Song[]): Promise<CatalogOutlier[]> {
  const outliers: CatalogOutlier[] = [];
  const avgBpm =
    songs.filter((s) => s.bpm).reduce((acc, s) => acc + (s.bpm ?? 0), 0) /
    (songs.filter((s) => s.bpm).length || 1);

  for (const song of songs) {
    const others = songs.filter((s) => s.id !== song.id);
    let maxScore = 0;
    let strongCount = 0;
    let viableCount = 0;

    for (const other of others) {
      const outRel = evaluateMockSongRelationship(song, other);
      const inRel = evaluateMockSongRelationship(other, song);
      const pairScore = Math.max(outRel.overall_score, inRel.overall_score);
      if (pairScore > maxScore) maxScore = pairScore;
      if (pairScore >= 0.7) strongCount++;
      if (pairScore >= 0.5) viableCount++;
    }

    const reasons: string[] = [];
    if (!song.bpm || (!song.camelot_code && !song.musical_key)) {
      reasons.push('Missing BPM or musical key analysis — track metadata incomplete.');
    }
    if (song.bpm && Math.abs(song.bpm - avgBpm) >= 18) {
      reasons.push(`Unusual tempo (${song.bpm.toFixed(1)} BPM vs catalog average ~${avgBpm.toFixed(1)} BPM).`);
    }
    if (song.energy_rating === 10) {
      reasons.push('Extreme maximum energy (rating 10/10); functions best as an explosive climax or hard drop.');
    } else if (song.energy_rating === 1) {
      reasons.push('Minimal acoustic energy (rating 1/10); functions best as a quiet intro or atmospheric encore.');
    }
    if (strongCount === 0) {
      reasons.push('No strong (≥70% compatibility) harmonic or tempo transitions found in the catalog.');
    } else if (strongCount === 1) {
      reasons.push('Only 1 strong connection found in the catalog.');
    }

    const isOutlier =
      strongCount <= 1 ||
      maxScore < 0.68 ||
      !song.bpm ||
      (!song.camelot_code && !song.musical_key);

    if (isOutlier) {
      reasons.push('Creative opportunity: suitable for intentional hard cuts, energy resets, or bridge-mediated transitions.');
      outliers.push({
        song_id: song.id,
        title: song.title,
        artist: song.artist,
        strong_connection_count: strongCount,
        total_viable_count: viableCount,
        max_compatibility_score: maxScore,
        bpm: song.bpm,
        camelot_code: song.camelot_code ?? song.musical_key,
        energy_rating: song.energy_rating,
        reasons,
      });
    }
  }

  outliers.sort((a, b) => a.max_compatibility_score - b.max_compatibility_score);
  return outliers;
}

export async function getMockUnusualTransitions(
  songId: string,
  songs: Song[],
  limit = 5
): Promise<SongRelationship[]> {
  const fromSong = songs.find((s) => s.id === songId);
  if (!fromSong) return [];

  const others = songs.filter((s) => s.id !== songId);
  const rels = others.map((s) => evaluateMockSongRelationship(fromSong, s));

  const unusual = rels.filter(
    (r) =>
      r.explanation.energy.is_reset ||
      r.explanation.energy.is_contrast ||
      r.explanation.bpm.compatibility === 'HalfTime' ||
      r.explanation.bpm.compatibility === 'DoubleTime' ||
      r.explanation.bpm.compatibility === 'Wide' ||
      r.explanation.harmony.relation === 'WholeStepLift' ||
      r.explanation.harmony.relation === 'HalfStepLift' ||
      r.explanation.harmony.relation === 'Tritone' ||
      r.primary_classification === 'HardCut' ||
      r.primary_classification === 'EnergyReset' ||
      r.primary_classification === 'IntentionalContrast'
  );

  unusual.sort((a, b) => b.overall_score - a.overall_score);
  return unusual.slice(0, limit);
}

export async function getMockCatalogSummaryStats(
  songs: Song[],
  clusters: CatalogCluster[],
  outliers: CatalogOutlier[]
): Promise<CatalogSummaryStats> {
  const totalSongs = songs.length;
  if (totalSongs < 2) {
    return {
      total_songs: totalSongs,
      total_possible_transitions: 0,
      strong_transitions_count: 0,
      average_compatibility: 0,
      cluster_count: 0,
      outlier_count: totalSongs,
    };
  }

  const totalPossible = totalSongs * (totalSongs - 1);
  let strongCount = 0;
  let totalScore = 0;

  for (const from of songs) {
    for (const to of songs) {
      if (from.id === to.id) continue;
      const rel = evaluateMockSongRelationship(from, to);
      totalScore += rel.overall_score;
      if (rel.overall_score >= 0.7) strongCount++;
    }
  }

  return {
    total_songs: totalSongs,
    total_possible_transitions: totalPossible,
    strong_transitions_count: strongCount,
    average_compatibility: totalScore / totalPossible,
    cluster_count: clusters.length,
    outlier_count: outliers.length,
  };
}

export async function exploreMockCandidatePaths(
  constraints: DiscoveryConstraints,
  songs: Song[],
  openers: OpenerCandidate[]
): Promise<DiscoveryCandidatePath[]> {
  if (songs.length < 2) return [];

  const totalDur = songs.reduce((acc, s) => acc + s.duration_seconds, 0);
  const avgDuration = Math.max(60, totalDur / songs.length);

  let targetCount = 4;
  let targetSeconds: number | null = null;
  if (constraints.target_duration_minutes) {
    targetSeconds = constraints.target_duration_minutes * 60;
    targetCount = Math.min(songs.length, Math.max(2, Math.round(targetSeconds / avgDuration)));
  } else if (constraints.must_include_ids?.length) {
    targetCount = Math.min(songs.length, Math.max(2, constraints.must_include_ids.length + 2));
  }

  const startIds: string[] = [];
  if (constraints.start_song_id && songs.some((s) => s.id === constraints.start_song_id)) {
    startIds.push(constraints.start_song_id);
  } else {
    for (const op of openers.slice(0, 4)) {
      startIds.push(op.song_id);
    }
    if (!startIds.length) {
      startIds.push(...songs.slice(0, 4).map((s) => s.id));
    }
  }

  const rawPaths: string[][] = [];

  for (const startId of startIds) {
    let beam: { path: string[]; score: number }[] = [{ path: [startId], score: 1.0 }];

    while (beam.length > 0) {
      const nextBeam: { path: string[]; score: number }[] = [];

      for (const { path, score } of beam) {
        if (path.length >= targetCount) {
          rawPaths.push(path);
          continue;
        }

        const lastId = path[path.length - 1];
        const lastSong = songs.find((s) => s.id === lastId);
        if (!lastSong) continue;

        const isLastStep = path.length + 1 === targetCount;
        if (isLastStep && constraints.end_song_id && !path.includes(constraints.end_song_id)) {
          const endSong = songs.find((s) => s.id === constraints.end_song_id);
          if (endSong) {
            const rel = evaluateMockSongRelationship(lastSong, endSong);
            nextBeam.push({ path: [...path, endSong.id], score: score * rel.overall_score });
            continue;
          }
        }

        const candidates: { song: Song; candScore: number }[] = [];
        for (const nextSong of songs) {
          if (path.includes(nextSong.id)) continue;
          if (!isLastStep && constraints.end_song_id && nextSong.id === constraints.end_song_id) {
            continue;
          }
          const rel = evaluateMockSongRelationship(lastSong, nextSong);
          let cScore = rel.overall_score;
          if (constraints.must_include_ids?.includes(nextSong.id)) {
            cScore += 0.35;
          }
          candidates.push({ song: nextSong, candScore: cScore });
        }

        candidates.sort((a, b) => b.candScore - a.candScore);
        for (const { song: candSong, candScore } of candidates.slice(0, 3)) {
          nextBeam.push({ path: [...path, candSong.id], score: score * candScore });
        }
      }

      nextBeam.sort((a, b) => b.score - a.score);
      beam = nextBeam.slice(0, 10);
    }
  }

  const candidatePaths: DiscoveryCandidatePath[] = [];
  const seen = new Set<string>();

  for (const pIds of rawPaths) {
    const sig = pIds.join('->');
    if (seen.has(sig)) continue;
    seen.add(sig);

    if (constraints.end_song_id && pIds[pIds.length - 1] !== constraints.end_song_id) {
      continue;
    }

    const pathSongs = pIds.map((id) => songs.find((s) => s.id === id)!).filter(Boolean);
    if (pathSongs.length !== pIds.length) continue;

    const transitions: SongRelationship[] = [];
    for (let i = 0; i < pathSongs.length - 1; i++) {
      transitions.push(evaluateMockSongRelationship(pathSongs[i], pathSongs[i + 1]));
    }

    const pTotalDur = pathSongs.reduce((acc, s) => acc + s.duration_seconds, 0);
    const avgScore =
      transitions.reduce((acc, t) => acc + t.overall_score, 0) / (transitions.length || 1);
    const minScore = Math.min(...transitions.map((t) => t.overall_score));
    const energyProgression = pathSongs.map((s) => s.energy_rating ?? 5);

    const totalMins = Math.round(pTotalDur / 60);
    const summary = `A cohesive ${pathSongs.length}-track path (~${totalMins} min) moving from '${pathSongs[0].title}' to '${pathSongs[pathSongs.length - 1].title}' with ${Math.round(avgScore * 100)}% average harmonic/energy compatibility.`;

    candidatePaths.push({
      song_ids: pIds,
      songs: pathSongs,
      transitions,
      total_duration_seconds: pTotalDur,
      average_score: avgScore,
      min_score: minScore,
      energy_progression: energyProgression,
      summary,
    });
  }

  candidatePaths.sort((a, b) => b.average_score - a.average_score);
  return candidatePaths.slice(0, constraints.limit ?? 5);
}
