import type { DrivingAnalysisMaturity, DrivingAnalysisRunStatus, DrivingAnalysisType } from '@prisma/client';

export const DRIVING_ANALYSIS_RUN_CONTRACT_VERSION = 'driving-analysis-run-v1';

/** Ordered identity parts — never include secrets, tokens, or raw payloads. */
export type DrivingAnalysisInputIdentity = {
  organizationId: string;
  tripId: string;
  vehicleId: string;
  analysisType: DrivingAnalysisType;
  dimoSegmentId?: string | null;
  tripEndTimeIso?: string | null;
  behaviorEnrichmentStatus?: string | null;
  routeEnrichmentStatus?: string | null;
  nativeEventCount?: number | null;
  hfPointsCleaned?: number | null;
  waypointCount?: number | null;
  capabilityVersion: string;
  /** Optional extra stable identity tokens (signal names, stage keys) — no secrets. */
  inputTags?: string[];
};

export type BeginDrivingAnalysisRunInput = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  analysisType: DrivingAnalysisType;
  modelVersion: string;
  capabilityVersion: string;
  inputIdentity: DrivingAnalysisInputIdentity;
  maturity?: DrivingAnalysisMaturity;
  recomputeReason?: string | null;
  startedAt?: Date;
};

export type CompleteDrivingAnalysisRunInput = {
  organizationId: string;
  runId: string;
  completedAt?: Date;
  stageSummary?: Record<string, unknown> | null;
  maturity?: DrivingAnalysisMaturity;
};

export type FailDrivingAnalysisRunInput = {
  organizationId: string;
  runId: string;
  errorCode: string;
  errorMessage?: string | null;
  completedAt?: Date;
};

export type DrivingAnalysisStageSummary = Record<string, string | number | boolean | null>;

export type ResolveDrivingAnalysisRunResult = {
  run: {
    id: string;
    organizationId: string;
    vehicleId: string;
    tripId: string;
    analysisType: DrivingAnalysisType;
    modelVersion: string;
    inputFingerprint: string;
    capabilityVersion: string;
    status: DrivingAnalysisRunStatus;
    supersedesRunId: string | null;
    recomputeReason: string | null;
  };
  created: boolean;
  deduplicated: boolean;
  supersededRunId: string | null;
};
