import type { TripAssessabilityDimensionStatus } from '@prisma/client';
import type { DrivingAnalysisStageKey } from '@prisma/client';

export type ClickHouseAnalysisHealthStatus =
  | 'disabled'
  | 'available'
  | 'degraded'
  | 'circuit_open'
  | 'timeout';

export type ClickHouseAnalysisHealth = {
  status: ClickHouseAnalysisHealthStatus;
  configured: boolean;
  reachable: boolean;
  circuitState: 'closed' | 'open' | 'half_open';
  lastError: string | null;
  lastPingAt: string | null;
};

export type HfAssessabilityDegradation = {
  providerError: boolean;
  hfInsufficient: boolean;
  assessabilityStatus: Extract<
    TripAssessabilityDimensionStatus,
    'PROVIDER_ERROR' | 'INSUFFICIENT_DATA'
  >;
  reasonCodes: Array<'CLICKHOUSE_UNAVAILABLE' | 'CLICKHOUSE_CIRCUIT_OPEN' | 'CLICKHOUSE_TIMEOUT' | 'HF_PROVIDER_ERROR' | 'PROVIDER_ERROR'>;
  limitReason: string;
};

/** Stages that may continue even when ClickHouse is unreachable. */
export const CLICKHOUSE_INDEPENDENT_ANALYSIS_STAGES = new Set<DrivingAnalysisStageKey>([
  'SEGMENT_VALIDATE',
  'NATIVE_EVENTS',
  'ROUTE',
  'ATTRIBUTION',
  'DRIVING_IMPACT',
]);

/** Stages whose HF-related assessability depends on ClickHouse evidence. */
export const CLICKHOUSE_HF_DEPENDENT_ANALYSIS_STAGES = new Set<DrivingAnalysisStageKey>([
  'EVENT_CONTEXT',
  'ASSESSABILITY',
  'MISUSE_RECONCILE',
  'DECISION_SUMMARY',
  'HEALTH_IMPACT_PUBLISH',
]);
