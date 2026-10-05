import type { Song } from '../../bindings/Song';
import type { SongRelationship } from '../../bindings/SongRelationship';
import type { OpenerCandidate } from '../../bindings/OpenerCandidate';
import type { CloserCandidate } from '../../bindings/CloserCandidate';
import type { BridgeCandidateAnalysis } from '../../bindings/BridgeCandidateAnalysis';
import type { RelationshipFacet, SongMusicalRole } from './types';

/**
 * Determines a song's structural performance role in a set based on acoustic analysis
 * and connectivity metrics.
 */
export function determineSongRole(
  song: Song,
  context?: {
    openerIds?: Set<string>;
    closerIds?: Set<string>;
    bridgeIds?: Set<string>;
  }
): SongMusicalRole {
  // Peak climax: high energy rating (8, 9, 10)
  if (song.energy_rating != null && song.energy_rating >= 8) {
    return 'PEAK';
  }

  // Closer: flagged as closer candidate or low wind-down energy (1-3)
  if (
    context?.closerIds?.has(song.id) ||
    (song.energy_rating != null && song.energy_rating <= 3)
  ) {
    return 'CLOSER';
  }

  // Opener: flagged as opener candidate or ideal establishing energy (4-6)
  if (
    context?.openerIds?.has(song.id) ||
    (song.energy_rating != null && song.energy_rating >= 4 && song.energy_rating <= 6)
  ) {
    return 'OPENER';
  }

  // Bridge: intermediate connector
  if (context?.bridgeIds?.has(song.id)) {
    return 'BRIDGE';
  }

  return 'GROOVE';
}

/**
 * Generates an authentic explanation of the musical role transition.
 */
export function getRoleShiftExplanation(
  fromRole: SongMusicalRole,
  toRole: SongMusicalRole
): string {
  if (fromRole === 'BRIDGE' && toRole === 'PEAK') {
    return 'Transition from intermediate bridging groove to high-energy peak climax.';
  }
  if (fromRole === 'OPENER' && toRole === 'PEAK') {
    return 'Direct escalation from set-opening atmosphere into peak energy.';
  }
  if (fromRole === 'OPENER' && toRole === 'GROOVE') {
    return 'Smooth evolution from opening mood into steady dancefloor groove.';
  }
  if (fromRole === 'GROOVE' && toRole === 'PEAK') {
    return 'Elevating from sustained core rhythm into peak-time climax.';
  }
  if (fromRole === 'PEAK' && toRole === 'CLOSER') {
    return 'Cathartic descent from climax into reflective resolution.';
  }
  if (fromRole === 'PEAK' && toRole === 'BRIDGE') {
    return 'Controlled drop from peak intensity into harmonic transition bridge.';
  }
  if (fromRole === 'GROOVE' && toRole === 'CLOSER') {
    return 'Winding down dancefloor groove into closing outro.';
  }
  if (fromRole === 'GROOVE' && toRole === 'BRIDGE') {
    return 'Transitioning into harmonic pivot track.';
  }
  if (fromRole === 'CLOSER' && toRole === 'CLOSER') {
    return 'Sustaining final resolution and outro atmosphere.';
  }
  if (fromRole === 'PEAK' && toRole === 'PEAK') {
    return 'Sustaining high-intensity peak plateau across tracks.';
  }
  if (fromRole === 'OPENER' && toRole === 'OPENER') {
    return 'Extended set-intro building gradual initial tension.';
  }
  if (fromRole === 'BRIDGE' && toRole === 'GROOVE') {
    return 'Resolving bridge tension back into stable rhythm.';
  }
  if (fromRole === 'BRIDGE' && toRole === 'CLOSER') {
    return 'Bridging directly into conclusive set finale.';
  }
  return `Modulating from ${fromRole.toLowerCase()} role to ${toRole.toLowerCase()} role.`;
}

export interface CategorizedTopology {
  harmonicNeighbors: SongRelationship[];
  tempoCompatible: SongRelationship[];
  energyCompatible: SongRelationship[];
  stylisticRelationships: SongRelationship[];
  possibleOpeners: SongRelationship[];
  possiblePeaks: SongRelationship[];
  possibleBridges: SongRelationship[];
  possibleClosers: SongRelationship[];
}

/**
 * Organizes outgoing transitions into the 8 distinct musical relationship facets.
 */
export function categorizeRelationships(
  _anchor: Song,
  relationships: SongRelationship[],
  allSongs: Song[],
  openers: OpenerCandidate[] = [],
  closers: CloserCandidate[] = [],
  bridges: BridgeCandidateAnalysis[] = []
): CategorizedTopology {
  const openerIdSet = new Set(openers.map((o) => o.song_id));
  const closerIdSet = new Set(closers.map((c) => c.song_id));
  const bridgeIdSet = new Set(bridges.map((b) => b.bridge_song.id));

  // Map song ID to Song for quick lookup
  const songMap = new Map<string, Song>();
  for (const s of allSongs) {
    songMap.set(s.id, s);
  }

  const harmonicNeighbors: SongRelationship[] = [];
  const tempoCompatible: SongRelationship[] = [];
  const energyCompatible: SongRelationship[] = [];
  const stylisticRelationships: SongRelationship[] = [];
  const possibleOpeners: SongRelationship[] = [];
  const possiblePeaks: SongRelationship[] = [];
  const possibleBridges: SongRelationship[] = [];
  const possibleClosers: SongRelationship[] = [];

  for (const rel of relationships) {
    const toSong = songMap.get(rel.to_song_id);

    // 1. Harmonic Neighbors
    const harm = rel.explanation.harmony.relation;
    const camDist = rel.explanation.harmony.camelot_distance;
    if (
      harm === 'SameKey' ||
      harm === 'RelativeSwitch' ||
      harm === 'Fifth' ||
      harm === 'WholeStepLift' ||
      (camDist != null && camDist <= 2)
    ) {
      harmonicNeighbors.push(rel);
    }

    // 2. Tempo-Compatible
    const bpmCompat = rel.explanation.bpm.compatibility;
    const bpmDelta = rel.explanation.bpm.delta;
    if (
      bpmCompat === 'Exact' ||
      bpmCompat === 'Close' ||
      bpmCompat === 'Moderate' ||
      bpmCompat === 'HalfTime' ||
      bpmCompat === 'DoubleTime' ||
      (bpmDelta != null && Math.abs(bpmDelta) <= 6.0)
    ) {
      tempoCompatible.push(rel);
    }

    // 3. Energy-Compatible
    const energyDelta = rel.explanation.energy.delta;
    const isReset = rel.explanation.energy.is_reset;
    const isContrast = rel.explanation.energy.is_contrast;
    if (
      isReset ||
      isContrast ||
      (energyDelta != null && Math.abs(energyDelta) <= 2) ||
      rel.primary_classification === 'Smooth' ||
      rel.primary_classification === 'Rising' ||
      rel.primary_classification === 'Falling'
    ) {
      energyCompatible.push(rel);
    }

    // 4. Stylistic Relationships
    if (
      rel.explanation.style.shared_tags.length > 0 ||
      rel.explanation.style.similarity > 0.2
    ) {
      stylisticRelationships.push(rel);
    }

    // 5. Possible Openers
    if (toSong && (openerIdSet.has(toSong.id) || (toSong.energy_rating != null && toSong.energy_rating >= 4 && toSong.energy_rating <= 6))) {
      possibleOpeners.push(rel);
    }

    // 6. Possible Peak Tracks
    if (toSong && toSong.energy_rating != null && toSong.energy_rating >= 8) {
      possiblePeaks.push(rel);
    }

    // 7. Possible Bridges
    if (
      toSong &&
      (bridgeIdSet.has(toSong.id) ||
        rel.primary_classification === 'HarmonicTransition' ||
        rel.primary_classification === 'RhythmicTempoTransition')
    ) {
      possibleBridges.push(rel);
    }

    // 8. Possible Closers
    if (toSong && (closerIdSet.has(toSong.id) || (toSong.energy_rating != null && toSong.energy_rating <= 3))) {
      possibleClosers.push(rel);
    }
  }

  return {
    harmonicNeighbors,
    tempoCompatible,
    energyCompatible,
    stylisticRelationships,
    possibleOpeners,
    possiblePeaks,
    possibleBridges,
    possibleClosers,
  };
}

export interface RenderedTopologyNode {
  songId: string;
  title: string;
  artist: string;
  camelotKey: string | null;
  bpm: number | null;
  bpmDelta: number | null;
  energy: number | null;
  energyDelta: number | null;
  role: SongMusicalRole;
  compatibilityScore: number;
  compatibilityTier: string;
  classification: string;
  relationship: SongRelationship;
  x: number;
  y: number;
  radius: number;
  angle: number;
  facets: Set<RelationshipFacet>;
  lineColor: string;
  lineWidth: number;
  isDashed: boolean;
}

/**
 * Computes deterministic 2D topological positions for candidate nodes around the anchor.
 */
export function computeTopologyPositions(
  _anchor: Song,
  relationships: SongRelationship[],
  allSongs: Song[],
  categorized: CategorizedTopology,
  context: {
    openerIds?: Set<string>;
    closerIds?: Set<string>;
    bridgeIds?: Set<string>;
  },
  canvasWidth: number = 800,
  canvasHeight: number = 600
): RenderedTopologyNode[] {
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  const songMap = new Map<string, Song>();
  for (const s of allSongs) {
    songMap.set(s.id, s);
  }

  const nodes: RenderedTopologyNode[] = [];
  const limit = Math.min(relationships.length, 36);

  // Group nodes by Camelot offset or similarity to space them nicely
  for (let idx = 0; idx < limit; idx++) {
    const rel = relationships[idx];
    const song = songMap.get(rel.to_song_id);
    if (!song) continue;

    const role = determineSongRole(song, context);

    // Facet memberships
    const facets = new Set<RelationshipFacet>(['all']);
    if (categorized.harmonicNeighbors.some((r) => r.to_song_id === song.id)) facets.add('harmonic');
    if (categorized.tempoCompatible.some((r) => r.to_song_id === song.id)) facets.add('tempo');
    if (categorized.energyCompatible.some((r) => r.to_song_id === song.id)) facets.add('energy');
    if (categorized.stylisticRelationships.some((r) => r.to_song_id === song.id)) facets.add('style');
    if (categorized.possibleOpeners.some((r) => r.to_song_id === song.id)) facets.add('openers');
    if (categorized.possiblePeaks.some((r) => r.to_song_id === song.id)) facets.add('peaks');
    if (categorized.possibleBridges.some((r) => r.to_song_id === song.id)) facets.add('bridges');
    if (categorized.possibleClosers.some((r) => r.to_song_id === song.id)) facets.add('closers');

    // Orbital Radius based on transition friction
    let orbitRadius = 140;
    if (rel.overall_score >= 0.85) {
      orbitRadius = 125 + (idx % 3) * 15; // Inner Consonance
    } else if (rel.overall_score >= 0.70) {
      orbitRadius = 195 + (idx % 4) * 16; // Middle Compatibility
    } else {
      orbitRadius = 265 + (idx % 3) * 18; // Outer Modulation / Contrast
    }

    // Angular placement based on harmonic distance and index
    const harmRel = rel.explanation.harmony.relation;

    let baseAngle = (idx / limit) * 2 * Math.PI - Math.PI / 2;
    if (harmRel === 'SameKey') {
      baseAngle = -Math.PI / 2 + ((idx % 3) - 1) * 0.25;
    } else if (harmRel === 'Fifth') {
      baseAngle = -Math.PI / 3 + ((idx % 3) - 1) * 0.25;
    } else if (harmRel === 'RelativeSwitch') {
      baseAngle = Math.PI / 2 + ((idx % 3) - 1) * 0.25;
    } else if (harmRel === 'WholeStepLift') {
      baseAngle = -Math.PI / 6 + ((idx % 3) - 1) * 0.25;
    } else if (rel.explanation.energy.is_reset || rel.explanation.energy.is_contrast) {
      baseAngle = (3 * Math.PI) / 4 + ((idx % 3) - 1) * 0.3;
    }

    const x = cx + orbitRadius * Math.cos(baseAngle);
    const y = cy + orbitRadius * Math.sin(baseAngle);

    // Line coloring reflecting genuine musical nature
    let lineColor = '#10b981'; // Emerald (High consonance)
    let isDashed = false;
    let lineWidth = 1.8;

    if (rel.overall_score >= 0.85) {
      lineColor = '#34d399'; // Emerald
      lineWidth = 2.4;
    } else if (rel.primary_classification === 'Smooth') {
      lineColor = '#38bdf8'; // Sky
      lineWidth = 2.0;
    } else if (rel.primary_classification === 'Rising') {
      lineColor = '#fbbf24'; // Amber
      lineWidth = 1.8;
    } else if (rel.primary_classification === 'HarmonicTransition') {
      lineColor = '#c084fc'; // Purple
      lineWidth = 1.8;
    } else if (rel.explanation.energy.is_reset || rel.explanation.energy.is_contrast) {
      lineColor = '#fb7185'; // Rose
      lineWidth = 1.5;
      isDashed = true;
    } else {
      lineColor = '#52525b'; // Zinc/dim
      lineWidth = 1.0;
      isDashed = true;
    }

    nodes.push({
      songId: song.id,
      title: song.title,
      artist: song.artist,
      camelotKey: song.camelot_code ?? song.musical_key ?? null,
      bpm: song.bpm ?? null,
      bpmDelta: rel.explanation.bpm.delta ?? null,
      energy: song.energy_rating ?? null,
      energyDelta: rel.explanation.energy.delta ?? null,
      role,
      compatibilityScore: rel.overall_score,
      compatibilityTier: rel.compatibility,
      classification: rel.primary_classification,
      relationship: rel,
      x,
      y,
      radius: orbitRadius,
      angle: baseAngle,
      facets,
      lineColor,
      lineWidth,
      isDashed,
    });
  }

  return nodes;
}
