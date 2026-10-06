import type { Song } from '../bindings/Song';
import type { Track } from '../bindings/Track';
import type { SongRelationship } from '../bindings/SongRelationship';
import type { EnergyProfile } from '../bindings/EnergyProfile';
import type { CostWeights } from '../bindings/CostWeights';
import type { TransitionAdvice } from '../bindings/TransitionAdvice';
import type { TransitionType } from '../bindings/TransitionType';
import type { CamelotLetter } from '../bindings/CamelotLetter';
import { computeTransitionCost, DEFAULT_WEIGHTS } from '../features/setlist/costModel';

export function parseMockCamelot(keyStr?: string | null): { number: number; letter: 'A' | 'B' } | null {
  if (!keyStr) return null;
  const trimmed = keyStr.trim();
  const match = trimmed.match(/^(\d{1,2})([ABab])$/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num >= 1 && num <= 12) {
      return { number: num, letter: match[2].toUpperCase() as 'A' | 'B' };
    }
  }
  return null;
}

export function evaluateMockSongRelationship(from: Song, to: Song): SongRelationship {
  const bA = from.bpm;
  const bB = to.bpm;
  let bpmCompat: SongRelationship['explanation']['bpm']['compatibility'] = 'Unknown';
  let bpmFriction = 0.40;
  let bpmDelta: number | null = null;
  let bpmRatio: number | null = null;
  let bpmExp = 'Tempo metadata unanalyzed or missing.';

  if (bA != null && bB != null && bA > 0 && bB > 0) {
    bpmDelta = bB - bA;
    bpmRatio = bB / bA;
    const absDelta = Math.abs(bpmDelta);

    if (Math.abs(bpmRatio - 0.5) / 0.5 <= 0.03) {
      bpmCompat = 'HalfTime';
      bpmFriction = 0.20;
      bpmExp = `Half-time relationship (${bA.toFixed(1)} -> ${bB.toFixed(1)} BPM): Smooth rhythmic half-speed pulse.`;
    } else if (Math.abs(bpmRatio - 2.0) / 2.0 <= 0.03) {
      bpmCompat = 'DoubleTime';
      bpmFriction = 0.20;
      bpmExp = `Double-time relationship (${bA.toFixed(1)} -> ${bB.toFixed(1)} BPM): Driving double-speed tempo.`;
    } else if (absDelta < 0.2) {
      bpmCompat = 'Exact';
      bpmFriction = 0.0;
      bpmExp = `Identical tempo (${bA.toFixed(1)} BPM): Flawless beatmatching with zero pitch bend.`;
    } else if (absDelta <= 2.0) {
      bpmCompat = 'Close';
      bpmFriction = absDelta / 12.0;
      bpmExp = `${bpmDelta > 0 ? '+' : ''}${bpmDelta.toFixed(1)} BPM: Minimal tempo change; effortless blend.`;
    } else if (absDelta <= 6.0) {
      bpmCompat = 'Moderate';
      bpmFriction = absDelta / 8.0;
      bpmExp = `${bpmDelta > 0 ? '+' : ''}${bpmDelta.toFixed(1)} BPM: Moderate tempo shift; smooth pitch bend.`;
    } else {
      bpmCompat = 'Wide';
      bpmFriction = Math.min(1.0, Math.max(0.5, 0.5 + (absDelta - 6.0) / 24.0));
      bpmExp = `${bpmDelta > 0 ? '+' : ''}${bpmDelta.toFixed(1)} BPM: Wide tempo discrepancy; best transitioned during breakdown.`;
    }
  }

  const cA = parseMockCamelot(from.camelot_code || from.musical_key);
  const cB = parseMockCamelot(to.camelot_code || to.musical_key);
  let harmRel: SongRelationship['explanation']['harmony']['relation'] = 'Unknown';
  let harmFriction = 0.40;
  let camDist: number | null = null;
  let modeFlip: boolean | null = null;
  let harmExp = 'Musical key metadata unanalyzed for one or both tracks.';

  if (cA && cB) {
    const diff = Math.abs(cB.number - cA.number);
    camDist = Math.min(diff, 12 - diff);
    modeFlip = cA.letter !== cB.letter;

    if (camDist === 0 && !modeFlip) {
      harmRel = 'SameKey';
      harmFriction = 0.0;
      harmExp = `Exact key match (${cA.number}${cA.letter}): Perfect harmonic consonance.`;
    } else if (camDist === 0 && modeFlip) {
      harmRel = 'RelativeSwitch';
      harmFriction = 0.10;
      harmExp = `Relative major/minor shift (${cA.number}${cA.letter} <-> ${cB.number}${cB.letter}): High harmonic consonance with color shift.`;
    } else if (camDist === 1 && !modeFlip) {
      harmRel = 'Fifth';
      harmFriction = 0.10;
      harmExp = `Perfect fifth step (${cA.number}${cA.letter} -> ${cB.number}${cB.letter}): Smooth natural resolution.`;
    } else if (camDist === 2 && !modeFlip) {
      harmRel = 'WholeStepLift';
      harmFriction = 0.35;
      harmExp = `Whole-step lift (${cA.number}${cA.letter} -> ${cB.number}${cB.letter}): Moderate harmonic tension producing an energy lift.`;
    } else if (camDist === 5 && !modeFlip) {
      harmRel = 'HalfStepLift';
      harmFriction = 0.65;
      harmExp = `Half-step lift (+1 semitone, ${cA.number}${cA.letter} -> ${cB.number}${cB.letter}): Dissonant overlap, rapid cut recommended.`;
    } else if (camDist === 6) {
      harmRel = 'Tritone';
      harmFriction = 1.0;
      harmExp = `Tritone jump (${cA.number}${cA.letter} -> ${cB.number}${cB.letter}): Maximum harmonic dissonance; avoid overlapping tonal stems.`;
    } else {
      harmRel = 'Dissonant';
      harmFriction = 0.75;
      harmExp = `Harmonically distant keys (${cA.number}${cA.letter} -> ${cB.number}${cB.letter}, step ${camDist}): Tonal clash.`;
    }
  }

  const eA = from.energy_rating;
  const eB = to.energy_rating;
  let energyDelta: number | null = null;
  let energyMovement: SongRelationship['explanation']['energy']['movement'] = 'Unknown';
  let isReset = false;
  let isContrast = false;
  let energyFriction = 0.30;
  let energyExp = 'Energy rating not specified.';

  if (eA != null && eB != null) {
    energyDelta = eB - eA;
    energyMovement = energyDelta > 0 ? 'Rise' : energyDelta < 0 ? 'Fall' : 'Steady';

    if (eA >= 7 && eB <= 4) {
      isReset = true;
      energyFriction = 0.20;
      energyExp = `Intentional energy reset (drop from level ${eA} to ${eB}): Clears dancefloor intensity for a new buildup arc.`;
    } else if (Math.abs(energyDelta) >= 4) {
      isContrast = true;
      energyFriction = 0.35;
      energyExp = `Intentional dynamic contrast (shift from level ${eA} to ${eB}): Bold dramatic shift.`;
    } else if (energyDelta === 0) {
      energyFriction = 0.0;
      energyExp = `Maintains consistent energy plateau at intensity level ${eA}.`;
    } else if (energyDelta === 1 || energyDelta === 2) {
      energyFriction = energyDelta * 0.05;
      energyExp = `Smooth upward momentum (+${energyDelta} energy level): Naturally elevates energy.`;
    } else if (energyDelta === -1 || energyDelta === -2) {
      energyFriction = Math.abs(energyDelta) * 0.08;
      energyExp = `Gentle cool-down (${energyDelta} energy level): Smooth decrescendo.`;
    } else {
      energyFriction = 0.30;
      energyExp = `Substantial energy shift (${energyDelta > 0 ? '+' : ''}${energyDelta} levels).`;
    }
  }

  const tA = from.tuning || 'Standard';
  const tB = to.tuning || 'Standard';
  const cA_pos = from.capo || 0;
  const cB_pos = to.capo || 0;
  let tuningCompat: SongRelationship['explanation']['tuning']['compatibility'] = 'Identical';
  let tuningFriction = 0.0;
  let tuningExp = `Identical setup (${tA}, Capo ${cA_pos}).`;

  if (tA.toLowerCase() === tB.toLowerCase() && cA_pos === cB_pos) {
    tuningCompat = 'Identical';
    tuningFriction = 0.0;
    tuningExp = `Identical setup (${tA}, Capo ${cA_pos}).`;
  } else if (tA.toLowerCase() === tB.toLowerCase()) {
    tuningCompat = 'CapoShiftOnly';
    tuningFriction = 0.15;
    tuningExp = `Same tuning (${tA}), adjust capo from fret ${cA_pos} to ${cB_pos}.`;
  } else {
    tuningCompat = 'RetuneRequired';
    tuningFriction = 0.45;
    tuningExp = `Retuning or instrument change required (${tA} -> ${tB}).`;
  }

  const setA = new Set((from.tags || []).map((t) => t.toLowerCase()));
  const setB = new Set((to.tags || []).map((t) => t.toLowerCase()));
  const sharedTags: string[] = [];
  setA.forEach((tag) => {
    if (setB.has(tag)) sharedTags.push(tag);
  });
  const unionSize = new Set([...setA, ...setB]).size;
  const styleSim = unionSize > 0 ? sharedTags.length / unionSize : 0.5;
  const styleExp = sharedTags.length > 0
    ? `Shared stylistic elements: [${sharedTags.join(', ')}].`
    : 'Distinct stylistic palettes providing genre contrast.';

  const transitionFriction = Math.min(1.0, Math.max(0.0,
    0.35 * harmFriction + 0.35 * bpmFriction + 0.20 * energyFriction + 0.10 * tuningFriction
  ));
  const overallScore = Math.min(1.0, Math.max(0.0, 1.0 - transitionFriction));

  const compatibility = overallScore >= 0.85
    ? 'Excellent'
    : overallScore >= 0.70
    ? 'Good'
    : overallScore >= 0.50
    ? 'Viable'
    : overallScore >= 0.30
    ? 'Challenging'
    : 'Clashing';

  const classifications: SongRelationship['classifications'] = [];
  if (['Exact', 'Close'].includes(bpmCompat) && ['SameKey', 'RelativeSwitch', 'Fifth'].includes(harmRel) && (energyDelta == null || Math.abs(energyDelta) <= 2)) {
    classifications.push('Smooth');
  }
  if (energyDelta != null && energyDelta > 0) classifications.push('Rising');
  if (energyDelta != null && energyDelta < 0) classifications.push('Falling');
  if (['RelativeSwitch', 'Fifth', 'WholeStepLift', 'HalfStepLift'].includes(harmRel)) classifications.push('HarmonicTransition');
  if (['HalfTime', 'DoubleTime', 'Moderate'].includes(bpmCompat)) classifications.push('RhythmicTempoTransition');
  if (isReset) classifications.push('EnergyReset');
  if (isContrast) classifications.push('IntentionalContrast');
  if (harmRel === 'Tritone' || bpmCompat === 'Wide' || transitionFriction >= 0.75) classifications.push('PoorFit');
  if (classifications.length === 0) classifications.push('HardCut');

  const primaryClassification = isReset
    ? 'EnergyReset'
    : isContrast
    ? 'IntentionalContrast'
    : classifications.includes('PoorFit')
    ? 'PoorFit'
    : classifications.includes('Smooth')
    ? 'Smooth'
    : classifications.includes('Rising') && (energyDelta ?? 0) >= 2
    ? 'Rising'
    : classifications.includes('Falling') && (energyDelta ?? 0) <= -2
    ? 'Falling'
    : classifications.includes('HarmonicTransition')
    ? 'HarmonicTransition'
    : classifications.includes('RhythmicTempoTransition')
    ? 'RhythmicTempoTransition'
    : 'HardCut';

  const isSymmetric = energyDelta === 0 && (bpmDelta == null || Math.abs(bpmDelta) < 0.2) && harmRel === 'SameKey';
  const summary = `${bpmExp} ${harmExp} ${energyExp}`;

  return {
    from_song_id: from.id,
    to_song_id: to.id,
    from_title: from.title,
    to_title: to.title,
    from_key: from.camelot_code ?? from.musical_key ?? null,
    to_key: to.camelot_code ?? to.musical_key ?? null,
    from_bpm: from.bpm ?? null,
    to_bpm: to.bpm ?? null,
    from_energy: from.energy_rating ?? null,
    to_energy: to.energy_rating ?? null,
    compatibility,
    overall_score: overallScore,
    transition_friction: transitionFriction,
    primary_classification: primaryClassification,
    classifications,
    is_symmetric: isSymmetric,
    explanation: {
      bpm: {
        delta: bpmDelta,
        ratio: bpmRatio,
        compatibility: bpmCompat,
        friction: bpmFriction,
        explanation: bpmExp,
      },
      harmony: {
        relation: harmRel,
        camelot_distance: camDist,
        mode_flip: modeFlip,
        friction: harmFriction,
        explanation: harmExp,
      },
      energy: {
        delta: energyDelta,
        movement: energyMovement,
        is_reset: isReset,
        is_contrast: isContrast,
        friction: energyFriction,
        explanation: energyExp,
      },
      tuning: {
        compatibility: tuningCompat,
        friction: tuningFriction,
        explanation: tuningExp,
      },
      style: {
        shared_tags: sharedTags,
        similarity: styleSim,
        explanation: styleExp,
      },
      summary,
    },
  };
}

export function computeTransitionAdvice(
  fromTrack: Track,
  toTrack: Track,
  profile?: EnergyProfile | null,
  weights?: CostWeights | null,
  deTarget?: number | null
): TransitionAdvice {
  const fromBpm = fromTrack.analysis?.rhythm.grid.bpm ?? 124;
  const toBpm = toTrack.analysis?.rhythm.grid.bpm ?? 124;
  const bpmDelta = toBpm - fromBpm;

  const fromCam = fromTrack.analysis?.key.camelot ?? { number: 8, letter: 'A' as CamelotLetter };
  const toCam = toTrack.analysis?.key.camelot ?? { number: 8, letter: 'A' as CamelotLetter };

  const diffNum = Math.abs(toCam.number - fromCam.number);
  const circularDist = Math.min(diffNum, 12 - diffNum);
  const modeFlip = fromCam.letter !== toCam.letter;

  let transitionType: TransitionType = 'Other';
  const notes: string[] = [];

  if (circularDist === 0 && !modeFlip) {
    transitionType = 'ExactMatch';
    notes.push('Exact key match: harmonic blend with seamless bass swap.');
  } else if (circularDist === 0 && modeFlip) {
    transitionType = 'RelativeSwitch';
    notes.push('Relative major/minor shift: high consonance mood change.');
  } else if (circularDist === 1 && !modeFlip) {
    transitionType = 'Fifth';
    notes.push(toCam.number > fromCam.number ? 'Dominant fifth lift: subtle energy climb.' : 'Subdominant fifth: mellow resolution.');
  } else if (circularDist === 2 && !modeFlip) {
    transitionType = 'WholeStepLift';
    notes.push('Whole-step modulation: dramatic uplifting energy boost.');
  } else if (circularDist === 7 || (circularDist === 5 && !modeFlip)) {
    transitionType = 'HalfStepLift';
    notes.push('Half-step shift: high dissonance, use quick cut or phrase drop.');
  } else if (circularDist === 6) {
    transitionType = 'Tritone';
    notes.push('Tritone contrast: maximum dissonance, execute clean transition on breakdown.');
  } else {
    notes.push(`Harmonic distance d=${circularDist}${modeFlip ? ' with mode flip' : ''}.`);
  }

  const interventionRequired = Math.abs(bpmDelta) > 8 || circularDist > 3;
  if (Math.abs(bpmDelta) > 8) {
    notes.push(`Wide tempo gap (Δ${bpmDelta.toFixed(1)} BPM): ramp tempo during breakdown.`);
  }

  const activeWeights = weights ?? DEFAULT_WEIGHTS;
  const activeDe = deTarget ?? 0;
  const costBreakdown = computeTransitionCost(
    fromTrack,
    toTrack,
    null,
    activeDe,
    activeWeights,
    profile ?? null
  );

  return {
    transition_type: transitionType,
    bpm_delta: Math.round(bpmDelta * 10) / 10,
    key_distance: circularDist,
    mode_flip: modeFlip,
    intervention_required: interventionRequired,
    loop_extension_recommended: (fromTrack.duration_ms * 0.18) < 25000,
    phrase_bars: 16,
    notes,
    total_cost: costBreakdown.isAvailable ? costBreakdown.total : null,
    tempo_cost: costBreakdown.isAvailable ? costBreakdown.phiTempo : null,
    key_cost: costBreakdown.isAvailable ? costBreakdown.phiKey : null,
    energy_cost: costBreakdown.isAvailable ? costBreakdown.phiEnergy : null,
    timbre_cost: costBreakdown.isAvailable ? costBreakdown.phiTimbre : null,
    de_target: costBreakdown.isAvailable ? activeDe : null,
    weights: costBreakdown.isAvailable ? activeWeights : null,
    profile: profile ?? null,
  };
}
