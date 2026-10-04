import type { Track } from '../../bindings/Track';
import type { StartStep, StartStepsState } from './types';

/**
 * Checks whether a track requires inspection or manual override due to:
 * - Analysis failure / missing analysis
 * - Missing or non-positive BPM
 * - Missing or invalid Camelot key
 */
export function isTrackNeedingReview(track: Track): boolean {
  if (!track.analysis) {
    return true;
  }

  const bpm = track.analysis.rhythm?.grid?.bpm;
  if (typeof bpm !== 'number' || isNaN(bpm) || bpm <= 0) {
    return true;
  }

  const camelot = track.analysis.key?.camelot;
  if (
    !camelot ||
    typeof camelot.number !== 'number' ||
    camelot.number < 1 ||
    camelot.number > 12 ||
    (camelot.letter !== 'A' && camelot.letter !== 'B')
  ) {
    return true;
  }

  return false;
}

/**
 * Pure function that evaluates the live state of the application and returns
 * the four guided onboarding / workflow steps with their live status,
 * descriptive plain sentence, and metadata.
 */
export function getStartSteps(state: StartStepsState): StartStep[] {
  const tracks = state.tracks ?? [];
  const setlist = state.setlist ?? [];
  const isLoadingTracks = Boolean(state.isLoadingTracks);
  const progress = state.progress ?? null;
  const isSuggestingOrder = Boolean(state.isSuggestingOrder);
  const isStageMode = Boolean(state.isStageMode);
  const exportStatus = state.exportStatus ?? null;

  // ─────────────────────────────────────────────────────────────
  // STEP 1: Add your music
  // ─────────────────────────────────────────────────────────────
  const isScanning = isLoadingTracks || progress !== null;
  const analyzedCount = tracks.length;

  let step1Status: StartStep['status'] = 'not_started';
  let step1Sentence = '0 tracks analyzed. Choose a music folder to begin scanning your library.';

  if (isScanning) {
    step1Status = 'in_progress';
    if (progress && typeof progress.current === 'number' && typeof progress.total === 'number') {
      const totalSafe = progress.total > 0 ? progress.total : 1;
      const percent = Math.min(100, Math.round((progress.current / totalSafe) * 100));
      step1Sentence = `Scanning tracks: ${progress.current} of ${progress.total} (${percent}%) — ${analyzedCount} analyzed.`;
    } else {
      step1Sentence = `Scanning folder and analyzing tracks (${analyzedCount} analyzed so far)...`;
    }
  } else if (analyzedCount > 0) {
    step1Status = 'done';
    step1Sentence = `${analyzedCount} ${analyzedCount === 1 ? 'track' : 'tracks'} analyzed and ready in your library.`;
  }

  // ─────────────────────────────────────────────────────────────
  // STEP 2: Check the results
  // ─────────────────────────────────────────────────────────────
  const issuesCount = tracks.filter(isTrackNeedingReview).length;

  let step2Status: StartStep['status'] = 'not_started';
  let step2Sentence = 'No tracks analyzed yet. Scan a folder first to inspect results.';

  if (tracks.length > 0) {
    if (issuesCount === 0) {
      step2Status = 'done';
      step2Sentence = 'All tracks look good.';
    } else {
      step2Status = 'in_progress';
      step2Sentence = `${issuesCount} ${issuesCount === 1 ? 'track needs' : 'tracks need'} a look (analysis failed, missing BPM or key).`;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // STEP 3: Build your set
  // ─────────────────────────────────────────────────────────────
  const setLength = setlist.length;

  let step3Status: StartStep['status'] = 'not_started';
  let step3Sentence = 'Your set currently has 0 tracks.';

  if (isSuggestingOrder) {
    step3Status = 'in_progress';
    step3Sentence = `Optimizing set order and transition harmonic flow (${setLength} tracks in set)...`;
  } else if (setLength === 1) {
    step3Status = 'in_progress';
    step3Sentence = 'Your set has 1 track.';
  } else if (setLength >= 2) {
    step3Status = 'done';
    step3Sentence = `Your set has ${setLength} tracks.`;
  }

  // ─────────────────────────────────────────────────────────────
  // STEP 4: Play and export
  // ─────────────────────────────────────────────────────────────
  const canPlayOrExport = setLength >= 2;

  let step4Status: StartStep['status'] = 'not_started';
  let step4Sentence = 'Add at least 2 tracks to your set to enable live performance and export.';

  if (isStageMode) {
    step4Status = 'in_progress';
    step4Sentence = 'Live performance is active in Stage Mode.';
  } else if (exportStatus) {
    step4Status = 'in_progress';
    step4Sentence = `Exporting setlist: ${exportStatus}`;
  } else if (canPlayOrExport) {
    step4Status = 'done';
    step4Sentence = `Your set has ${setLength} tracks and is ready to play or export.`;
  }

  const getStatusLabel = (status: StartStep['status']): StartStep['statusLabel'] => {
    switch (status) {
      case 'not_started':
        return 'Not started';
      case 'in_progress':
        return 'In progress';
      case 'done':
        return 'Done';
    }
  };

  return [
    {
      id: 'add_music',
      stepNumber: 1,
      title: 'Add your music',
      status: step1Status,
      statusLabel: getStatusLabel(step1Status),
      sentence: step1Sentence,
      analyzedCount,
    },
    {
      id: 'check_results',
      stepNumber: 2,
      title: 'Check the results',
      status: step2Status,
      statusLabel: getStatusLabel(step2Status),
      sentence: step2Sentence,
      issuesCount,
    },
    {
      id: 'build_set',
      stepNumber: 3,
      title: 'Build your set',
      status: step3Status,
      statusLabel: getStatusLabel(step3Status),
      sentence: step3Sentence,
      setLength,
    },
    {
      id: 'play_export',
      stepNumber: 4,
      title: 'Play and export',
      status: step4Status,
      statusLabel: getStatusLabel(step4Status),
      sentence: step4Sentence,
      canPlayOrExport,
    },
  ];
}
