import type { DrivingIntelligenceJobStatus, DrivingIntelligenceJobType } from '@prisma/client';

export const DRIVING_INTELLIGENCE_JOB_CONTRACT_VERSION = 'driving-intelligence-job-v1';

/** Canonical V2 job types — mirrors Prisma enum `DrivingIntelligenceJobType`. */
export const DRIVING_INTELLIGENCE_JOB_TYPES = [
  'DRIVING_NATIVE_EVENTS_INGEST',
  'DRIVING_EVENT_CONTEXT_ENRICH',
  'DRIVING_ROUTE_ENRICH',
  'DRIVING_IMPACT_COMPUTE',
  'DRIVING_MISUSE_RECONCILE',
  'DRIVING_ASSESSABILITY_COMPUTE',
  'DRIVING_ATTRIBUTION_RESOLVE',
  'DRIVING_DECISION_SUMMARY_COMPUTE',
  'RENTAL_DRIVING_ANALYSIS_RECOMPUTE',
  'DRIVING_HEALTH_IMPACT_PUBLISH',
  'DIMO_TRIP_SEGMENT_VALIDATE',
] as const satisfies readonly DrivingIntelligenceJobType[];

export type DrivingIntelligenceJobPayload = {
  organizationId: string;
  vehicleId: string;
  tripId?: string | null;
  bookingId?: string | null;
  analysisRunId: string;
  modelVersion: string;
  idempotencyKey: string;
  correlationId: string;
  requestedAt: string | Date;
};

export type EnqueueDrivingIntelligenceJobInput = DrivingIntelligenceJobPayload & {
  jobType: DrivingIntelligenceJobType;
};

export type DrivingIntelligenceJobValidationIssue = {
  code: string;
  message: string;
};

export type DrivingIntelligenceJobValidationResult =
  | { ok: true; normalized: NormalizedDrivingIntelligenceJobPayload }
  | { ok: false; issues: DrivingIntelligenceJobValidationIssue[] };

export type NormalizedDrivingIntelligenceJobPayload = {
  organizationId: string;
  vehicleId: string;
  tripId: string | null;
  bookingId: string | null;
  analysisRunId: string;
  modelVersion: string;
  idempotencyKey: string;
  correlationId: string;
  requestedAt: Date;
};

export type PersistDrivingIntelligenceJobInput = NormalizedDrivingIntelligenceJobPayload & {
  jobType: DrivingIntelligenceJobType;
};

export type EnqueueDrivingIntelligenceJobResult = {
  job: {
    id: string;
    organizationId: string;
    vehicleId: string;
    tripId: string | null;
    bookingId: string | null;
    analysisRunId: string;
    jobType: DrivingIntelligenceJobType;
    modelVersion: string;
    idempotencyKey: string;
    correlationId: string;
    requestedAt: Date;
    status: DrivingIntelligenceJobStatus;
    bullJobId: string | null;
  };
  created: boolean;
  deduplicated: boolean;
  enqueued: boolean;
};

/** BullMQ envelope — worker loads the persistent row by id. */
export type DrivingIntelligenceBullJobData = {
  persistentJobId: string;
  jobType: DrivingIntelligenceJobType;
  organizationId: string;
};
