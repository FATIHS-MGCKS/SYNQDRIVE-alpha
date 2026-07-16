import type {
  DrivingAnalysisStageKey,
  DrivingAnalysisStageStatus,
  DrivingIntelligenceJobType,
} from '@prisma/client';

export const DRIVING_ANALYSIS_STAGE_CONTRACT_VERSION = 'driving-analysis-stage-v1';

/** All pipeline stages in topological order. */
export const DRIVING_ANALYSIS_STAGE_KEYS = [
  'SEGMENT_VALIDATE',
  'NATIVE_EVENTS',
  'ROUTE',
  'EVENT_CONTEXT',
  'DRIVING_IMPACT',
  'MISUSE_RECONCILE',
  'ASSESSABILITY',
  'ATTRIBUTION',
  'DECISION_SUMMARY',
  'HEALTH_IMPACT_PUBLISH',
] as const satisfies readonly DrivingAnalysisStageKey[];

export type DrivingAnalysisStageSnapshot = {
  stageKey: DrivingAnalysisStageKey;
  status: DrivingAnalysisStageStatus;
  modelVersion: string;
  inputFingerprint: string;
  attemptCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  preservedFromStageId: string | null;
};

export type StageFingerprintContext = {
  organizationId: string;
  tripId: string;
  vehicleId: string;
  stageKey: DrivingAnalysisStageKey;
  modelVersion: string;
  capabilityVersion: string;
  tripEndTimeIso?: string | null;
  waypointCount?: number | null;
  behaviorEnrichmentStatus?: string | null;
  routeEnrichmentStatus?: string | null;
  nativeEventCount?: number | null;
  /** Stable extra tokens — never secrets. */
  inputTags?: string[];
};

export type InitializeStagesForRunInput = {
  organizationId: string;
  analysisRunId: string;
  tripId: string;
  vehicleId: string;
  modelVersion: string;
  capabilityVersion: string;
  tripEndTimeIso?: string | null;
  waypointCount?: number | null;
  behaviorEnrichmentStatus?: string | null;
  supersededRunId?: string | null;
  /** When set, only these stages are reset to PENDING (targeted recompute). */
  recomputeStageKeys?: DrivingAnalysisStageKey[];
};

export type InitializeStagesForRunResult = {
  stages: DrivingAnalysisStageSnapshot[];
  preservedCount: number;
  pendingCount: number;
};

export type EnqueueReadyStagesInput = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  analysisRunId: string;
  modelVersion: string;
  correlationId: string;
  requestedAt: Date;
};

export type EnqueueReadyStagesResult = {
  enqueued: Array<{
    stageKey: DrivingAnalysisStageKey;
    jobType: DrivingIntelligenceJobType;
    jobId: string;
    created: boolean;
    enqueued: boolean;
    deduplicated: boolean;
    queueError?: string;
  }>;
  readyStageKeys: DrivingAnalysisStageKey[];
};

export type DerivedRunAnalysisStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'PARTIAL'
  | 'COMPLETED'
  | 'FAILED';

export type DerivedRunAnalysisResult = {
  status: DerivedRunAnalysisStatus;
  stageSummary: Record<string, DrivingAnalysisStageStatus>;
  completedStageCount: number;
  terminalStageCount: number;
  failedStageCount: number;
};
