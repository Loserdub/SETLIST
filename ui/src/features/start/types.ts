import type { Track } from '../../bindings/Track';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { ProgressEvent } from '../../api';

export type StepId = 'add_music' | 'check_results' | 'build_set' | 'play_export';

export type StepStatus = 'not_started' | 'in_progress' | 'done';

export type StatusLabel = 'Not started' | 'In progress' | 'Done';

export interface StartStep {
  id: StepId;
  stepNumber: number;
  title: string;
  status: StepStatus;
  statusLabel: StatusLabel;
  sentence: string;
  analyzedCount?: number;
  issuesCount?: number;
  setLength?: number;
  canPlayOrExport?: boolean;
}

export interface StartStepsState {
  tracks: Track[];
  isLoadingTracks?: boolean;
  progress?: ProgressEvent | null;
  setlist: SetlistEntry[];
  isSuggestingOrder?: boolean;
  isStageMode?: boolean;
  exportStatus?: string | null;
}

export interface StartScreenProps {
  /** Optional callback to open library filtered to tracks needing review. Hidden when missing. */
  onOpenFilteredLibrary?: () => void;
  /** Optional callback to trigger quick set generation. Hidden when missing. */
  onQuickSet?: () => void;
  /** Optional callback to trigger export. If omitted, navigates to Setlist view. */
  onExport?: () => void;
  /** Optional override for folder choose and scan action (useful for tests or custom dialogs). */
  onChooseFolder?: () => void | Promise<void>;
}
