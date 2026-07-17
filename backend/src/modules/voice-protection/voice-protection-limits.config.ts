/** Default protection thresholds — overridable per org via VoiceBudgetPolicy. */
export const VOICE_BUDGET_WARN_THRESHOLDS_PCT = [70, 85, 100] as const;

export const VOICE_PROTECTION_DEFAULTS = {
  maxConversationDurationSeconds: 3600,
  dailyOutboundMinutesLimit: 120,
  maxRepeatsPerDestination: 5,
  destinationCooldownSeconds: 300,
  hardLimitThresholdPct: 100,
  hardLimitGraceMinutes: 0,
  abuseShortCallSeconds: 10,
  abuseShortCallBurstCount: 8,
  abuseShortCallWindowSeconds: 600,
  abuseFailedTargetBurstCount: 5,
  abuseFailedTargetWindowSeconds: 900,
  abuseInternationalCostCents: 5000,
  abuseLongCallSeconds: 5400,
  concurrentReservationTtlSeconds: 7200,
} as const;

export function effectiveLimit<T extends number | null | undefined>(
  policyValue: T,
  planValue: number | null | undefined,
  defaultValue: number,
): number {
  if (typeof policyValue === 'number' && policyValue > 0) {
    return policyValue;
  }
  if (typeof planValue === 'number' && planValue > 0) {
    return planValue;
  }
  return defaultValue;
}
