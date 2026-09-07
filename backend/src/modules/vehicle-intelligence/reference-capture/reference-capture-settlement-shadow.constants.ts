export const REFERENCE_CAPTURE_SETTLEMENT_SHADOW_JOB_NAME = 'reference-capture-settlement-shadow-execute';

export function buildSettlementShadowJobId(scheduleId: string): string {
  return `rc-shadow-${scheduleId}`;
}
