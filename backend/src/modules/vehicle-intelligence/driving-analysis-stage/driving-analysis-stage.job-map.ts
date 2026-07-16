import type { DrivingAnalysisStageKey, DrivingIntelligenceJobType } from '@prisma/client';

/** Maps each orchestrated stage to its durable job type. */
export const STAGE_TO_JOB_TYPE: Record<DrivingAnalysisStageKey, DrivingIntelligenceJobType> = {
  SEGMENT_VALIDATE: 'DIMO_TRIP_SEGMENT_VALIDATE',
  NATIVE_EVENTS: 'DRIVING_NATIVE_EVENTS_INGEST',
  ROUTE: 'DRIVING_ROUTE_ENRICH',
  EVENT_CONTEXT: 'DRIVING_EVENT_CONTEXT_ENRICH',
  DRIVING_IMPACT: 'DRIVING_IMPACT_COMPUTE',
  MISUSE_RECONCILE: 'DRIVING_MISUSE_RECONCILE',
  ASSESSABILITY: 'DRIVING_ASSESSABILITY_COMPUTE',
  ATTRIBUTION: 'DRIVING_ATTRIBUTION_RESOLVE',
  DECISION_SUMMARY: 'DRIVING_DECISION_SUMMARY_COMPUTE',
  HEALTH_IMPACT_PUBLISH: 'DRIVING_HEALTH_IMPACT_PUBLISH',
};

const JOB_TYPE_TO_STAGE = new Map<DrivingIntelligenceJobType, DrivingAnalysisStageKey>(
  Object.entries(STAGE_TO_JOB_TYPE).map(([stage, job]) => [
    job as DrivingIntelligenceJobType,
    stage as DrivingAnalysisStageKey,
  ]),
);

export function jobTypeToStageKey(
  jobType: DrivingIntelligenceJobType,
): DrivingAnalysisStageKey | null {
  return JOB_TYPE_TO_STAGE.get(jobType) ?? null;
}

export function stageKeyToJobType(stageKey: DrivingAnalysisStageKey): DrivingIntelligenceJobType {
  return STAGE_TO_JOB_TYPE[stageKey];
}

export function buildStageJobIdempotencyKey(
  tripId: string,
  modelVersion: string,
  stageKey: DrivingAnalysisStageKey,
  inputFingerprint: string,
): string {
  return `stage:${tripId}:${modelVersion}:${stageKey}:${inputFingerprint.slice(0, 16)}`;
}
