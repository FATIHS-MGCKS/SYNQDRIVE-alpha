export const REFERENCE_CAPTURE_SETTLEMENT_SHADOW_JOB_NAME = 'reference-capture-settlement-shadow-execute';

/** Persisted experiment lifecycle states (status column is String, not enum). */
export const REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS = {
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
} as const;

export type ReferenceCaptureSettlementShadowExperimentStatus =
  (typeof REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS)[keyof typeof REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS];

export function buildSettlementShadowJobId(scheduleId: string): string {
  return `rc-shadow-${scheduleId}`;
}

export function buildSettlementShadowAbortSkipReason(abortReason: string): string {
  return `rc_session_aborted:${abortReason}`;
}
