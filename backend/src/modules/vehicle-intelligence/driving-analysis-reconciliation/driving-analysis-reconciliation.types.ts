export const DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES = {
  TRIP_WITHOUT_ANALYSIS_RUN: 'TRIP_WITHOUT_ANALYSIS_RUN',
  RUN_STUCK_STAGE: 'RUN_STUCK_STAGE',
  DRIVING_IMPACT_STATUS_MISMATCH: 'DRIVING_IMPACT_STATUS_MISMATCH',
  NATIVE_EVENT_WITHOUT_CONTEXT: 'NATIVE_EVENT_WITHOUT_CONTEXT',
  MISUSE_WITHOUT_RECONCILIATION: 'MISUSE_WITHOUT_RECONCILIATION',
  BOOKING_WITHOUT_RENTAL_ANALYSIS: 'BOOKING_WITHOUT_RENTAL_ANALYSIS',
  HEALTH_IMPACT_WITHOUT_QUALIFIED_INPUT: 'HEALTH_IMPACT_WITHOUT_QUALIFIED_INPUT',
  PENDING_JOB_RETRY: 'PENDING_JOB_RETRY',
} as const;

export type DrivingAnalysisReconciliationCheckType =
  (typeof DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES)[keyof typeof DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES];

export type DrivingAnalysisReconciliationFinding = {
  checkType: DrivingAnalysisReconciliationCheckType;
  organizationId: string;
  entityType: string;
  entityId: string;
  detail?: string;
};

export type DrivingAnalysisReconciliationResult = {
  scannedOrgs: number;
  findings: DrivingAnalysisReconciliationFinding[];
  actionsEnqueued: number;
  actionsSkipped: number;
  actionsFailed: number;
};

export const DRIVING_ANALYSIS_RECONCILIATION_DEFAULTS = {
  MAX_ACTIONS_PER_RUN: 100,
  MAX_FINDINGS_PER_CHECK: 50,
  LOOKBACK_DAYS: 14,
  STUCK_RUN_MS: 30 * 60_000,
  STUCK_JOB_MS: 20 * 60_000,
  RECONCILE_IDEMPOTENCY_BUCKET_MS: 60 * 60_000,
} as const;

export function buildReconciliationIdempotencyKey(
  checkType: DrivingAnalysisReconciliationCheckType,
  entityId: string,
  bucketMs = DRIVING_ANALYSIS_RECONCILIATION_DEFAULTS.RECONCILE_IDEMPOTENCY_BUCKET_MS,
  now = Date.now(),
): string {
  const bucket = Math.floor(now / bucketMs);
  return `reconcile:${checkType}:${entityId}:${bucket}`;
}
