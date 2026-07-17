/**
 * Customer-facing billable minute rule (ADR 6A / production architecture):
 * - Raw value: connected seconds
 * - 6-second grace: calls at or below grace incur 0 billable minutes
 * - Above grace: round up to the next whole minute
 */
export const VOICE_BILLING_GRACE_SECONDS = 6;

export function billableMinutesFromSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= VOICE_BILLING_GRACE_SECONDS) {
    return 0;
  }
  return Math.ceil(seconds / 60);
}

export function normalizeBillableSeconds(seconds: number | null | undefined): number {
  if (!Number.isFinite(seconds) || (seconds as number) < 0) {
    return 0;
  }
  return Math.floor(seconds as number);
}
