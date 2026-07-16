import type { DrivingIntelligenceJobType } from '@prisma/client';

/** Model version for the V2 post-trip analysis pipeline — one init per trip×version. */
export const DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION = 'di-v2-pipeline-v1';

/** Capability snapshot token at finalize-time (no per-signal probe during live FSM). */
export const DRIVING_INTELLIGENCE_INIT_CAPABILITY_VERSION = 'at-finalize-v1';

/** First durable job enqueued after trip completion — downstream stages chain later. */
export const DRIVING_INTELLIGENCE_PIPELINE_START_JOB: DrivingIntelligenceJobType =
  'DIMO_TRIP_SEGMENT_VALIDATE';

export type TripAnalysisInitSource =
  | 'LIVE_FINALIZE'
  | 'MID_GAP_SPLIT'
  | 'REPAIR_FINALIZE';

export type InitializeTripAnalysisInput = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  source: TripAnalysisInitSource;
};

export type TripAnalysisInitJobResult = {
  jobType: DrivingIntelligenceJobType;
  jobId: string;
  created: boolean;
  enqueued: boolean;
  deduplicated: boolean;
  queueError?: string;
  stageKey?: string;
};

export type TripAnalysisInitResult = {
  runId: string;
  runCreated: boolean;
  runDeduplicated: boolean;
  jobs: TripAnalysisInitJobResult[];
  queueErrors: string[];
};

export function buildInitCorrelationId(tripId: string): string {
  return `trip-finalize:${tripId}`;
}

export function buildInitJobIdempotencyKey(
  tripId: string,
  modelVersion: string,
  jobType: DrivingIntelligenceJobType,
): string {
  return `trip-init:${tripId}:${modelVersion}:${jobType}`;
}
