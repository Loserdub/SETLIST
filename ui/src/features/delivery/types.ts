import type { ExportTarget } from '../../bindings/ExportTarget';
import type { ExportResult } from '../../bindings/ExportResult';
import type { SetlistEntry } from '../../bindings/SetlistEntry';

export interface VerificationCheck {
  id: 'tracks_available' | 'metadata_complete' | 'cue_points_present' | 'sequence_valid' | 'export_generated';
  label: string;
  passed: boolean;
  status: 'pass' | 'warn' | 'fail' | 'pending';
  summary: string;
  details?: string[];
}

export interface SetlistDeliveryTelemetry {
  totalDurationMs: number;
  durationFormatted: string;
  trackCount: number;
  minBpm: number;
  maxBpm: number;
  bpmRangeFormatted: string;
  transitionCount: number;
  avgCuesPerTrack: number;
  cuesPerTrackFormatted: string;
  keyFlowFormatted: string;
}

export interface SetlistVerificationResult {
  allChecksPassed: boolean;
  canExport: boolean;
  checks: VerificationCheck[];
  telemetry: SetlistDeliveryTelemetry;
}

export interface FinalDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  setlist: SetlistEntry[];
  setlistName: string;
  isExporting: boolean;
  onExport: (target: ExportTarget, customPath?: string, overwrite?: boolean) => Promise<ExportResult | void>;
  onLaunchStageMode?: () => void;
  lastExportResult?: ExportResult | null;
  errorMessage?: string | null;
}
