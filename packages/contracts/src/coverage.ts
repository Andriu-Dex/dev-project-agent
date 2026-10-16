export type CoverageState = 'pending' | 'reviewing' | 'reviewed' | 'partial' | 'outdated' | 'failed' | 'excluded';
export interface CoverageSettings {
  batchUnits: number;
  partBytes: number;
  contextBytes: number;
  maxSeconds: number;
  intervalMinutes: number;
  maxAttempts: number;
  withAi: boolean;
  model: string | null;
  reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null;
  consent: boolean;
}
export interface CoverageFile {
  path: string;
  blobSha: string;
  size: number | null;
  state: CoverageState;
  reason: string | null;
  completedParts: number;
  totalParts: number | null;
  attempts: number;
  analysisHead: string | null;
  dependencies: Record<string, string>;
}
export interface CoverageOverview {
  revision: number;
  head: string | null;
  observedAt: string | null;
  enabled: boolean;
  nextRun: string | null;
  active: boolean;
  lastError: string | null;
  settings: CoverageSettings;
  counts: Record<CoverageState, number>;
  modules: {path: string; eligible: number; reviewed: number; partial: number; excluded: number}[];
  batches: {id: string; head: string; status: string; reviewedUnits: number; errorCode: string | null; createdAt: string; finishedAt: string | null}[];
}
export interface ReportCoverage {
  snapshotId: string;
  head: string;
  observedAt: string;
  capturedAt: string;
  counts: Record<CoverageState, number>;
  withAi: boolean;
  model: string | null;
}
