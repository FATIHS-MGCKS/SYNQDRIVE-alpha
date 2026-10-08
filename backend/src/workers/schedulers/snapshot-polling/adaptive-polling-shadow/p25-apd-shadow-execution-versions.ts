/** Shadow execution contract (separate from frozen B2/B4 policy versions). */
export const P25_APD_SHADOW_EXECUTION_V2 = 'P25_APD_SHADOW_EXECUTION_V2' as const;

/**
 * V2.1 — LV bootstrap persistence for forced-missing reconciliation polls without
 * expanding lastAllowed advancing semantics. Production V2 rows remain historical evidence.
 */
export const P25_APD_SHADOW_EXECUTION_V2_1 = 'P25_APD_SHADOW_EXECUTION_V2_1' as const;

export const P25_APD_SHADOW_EXECUTION_VERSIONS = [
  P25_APD_SHADOW_EXECUTION_V2,
  P25_APD_SHADOW_EXECUTION_V2_1,
] as const;

export type P25ApdShadowExecutionVersion =
  (typeof P25_APD_SHADOW_EXECUTION_VERSIONS)[number];

/** Pre-poll / post-poll contract for new observations after APDS-9.5B (deploy gate). */
export const P25_APD_SHADOW_EXECUTION_VERSION_CURRENT: P25ApdShadowExecutionVersion =
  P25_APD_SHADOW_EXECUTION_V2_1;

/** Decisions that may advance durable lastAllowed after a successful real baseline poll. */
export const P25_APD_SHADOW_ADVANCING_DECISIONS = [
  'WOULD_POLL',
  'FORCED_TRIP_SAFETY',
  'IMMEDIATE_SNAPSHOT_REQUIRED',
] as const;

export type ApdShadowAdvancingDecision =
  (typeof P25_APD_SHADOW_ADVANCING_DECISIONS)[number];

/**
 * Pre-poll decisions that may seed simulated LV source timestamps after SUCCESS
 * (reconciliation polls only), without treating the poll as lastAllowed-advancing.
 */
export const P25_APD_SHADOW_LV_BOOTSTRAP_ELIGIBLE_DECISIONS = [
  'FORCED_SOURCE_TIMESTAMP_MISSING',
] as const;

export type ApdShadowLvBootstrapEligibleDecision =
  (typeof P25_APD_SHADOW_LV_BOOTSTRAP_ELIGIBLE_DECISIONS)[number];

/** Union used for simulated LV source lookup and visibility persistence admission. */
export const P25_APD_SHADOW_SIMULATED_LV_SOURCE_DECISIONS = [
  ...P25_APD_SHADOW_ADVANCING_DECISIONS,
  ...P25_APD_SHADOW_LV_BOOTSTRAP_ELIGIBLE_DECISIONS,
] as const;

export function isApdShadowAdvancingDecision(decision: string): boolean {
  return (P25_APD_SHADOW_ADVANCING_DECISIONS as readonly string[]).includes(decision);
}

export function isApdShadowLvBootstrapEligibleDecision(decision: string): boolean {
  return (P25_APD_SHADOW_LV_BOOTSTRAP_ELIGIBLE_DECISIONS as readonly string[]).includes(
    decision,
  );
}

export function isApdShadowSimulatedLvSourceDecision(decision: string): boolean {
  return (P25_APD_SHADOW_SIMULATED_LV_SOURCE_DECISIONS as readonly string[]).includes(
    decision,
  );
}

export const APD_SHADOW_CANONICAL_ENQUEUE_OUTCOMES = [
  'ENQUEUED',
  'RECOVERED_TERMINAL',
  'COALESCED',
  'QUEUE_FAILED',
  'PERSIST_FAILED',
] as const;

export type ApdShadowCanonicalEnqueueOutcome =
  (typeof APD_SHADOW_CANONICAL_ENQUEUE_OUTCOMES)[number];

export const APD_SHADOW_REAL_POLL_STATUSES = ['SUCCESS', 'FAILURE'] as const;
export type ApdShadowRealPollStatus =
  (typeof APD_SHADOW_REAL_POLL_STATUSES)[number];
