/** Shadow execution contract (separate from frozen B2/B4 policy versions). */
export const P25_APD_SHADOW_EXECUTION_V2 = 'P25_APD_SHADOW_EXECUTION_V2' as const;

export type P25ApdShadowExecutionVersion = typeof P25_APD_SHADOW_EXECUTION_V2;

/** Decisions that may advance durable lastAllowed after a successful real baseline poll. */
export const P25_APD_SHADOW_ADVANCING_DECISIONS = [
  'WOULD_POLL',
  'FORCED_TRIP_SAFETY',
  'IMMEDIATE_SNAPSHOT_REQUIRED',
] as const;

export type ApdShadowAdvancingDecision =
  (typeof P25_APD_SHADOW_ADVANCING_DECISIONS)[number];

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
