/** M3.3A generalized battery evidence constants. */

export const GENERALIZED_EVIDENCE_CLASSIFICATION_VERSION = 'm3.3a.1-v1';

/** Nominal R1 cadence for derived metadata only — not used for equality gating. */
export const R1_NOMINAL_REST_CADENCE_MS = 8 * 60 * 60_000;

/** Tolerance policy placeholder until production forensics characterize jitter. */
export const INITIAL_REST_TOLERANCE_POLICY_VERSION = 'RESEARCH_PENDING';

/** M3.3B — empirically grounded rest cadence qualification (shadow only). */
export const REST_CADENCE_POLICY_VERSION = 'M3_3B_V1_1';

/**
 * M3.3B.1 decision C — periodic LV observed but rung-residual tolerance not validated
 * for automatic REST_WAKE promotion. Nominal index remains research metadata only.
 */
export const REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED = false;

export const GENERALIZED_EVIDENCE_SOURCE_KINDS = {
  LIVE_VOLTAGE_CLASSIFY: 'LIVE_VOLTAGE_CLASSIFY',
} as const;

export const ACTIVE_REST_SESSION_STATUSES = [
  'CANDIDATE',
  'CONFIRMED',
  'RESTING',
] as const;

/** Max open rest session duration before SESSION_TIMEOUT (configurable later). */
export const DEFAULT_REST_SESSION_MAX_DURATION_MS = 7 * 24 * 60 * 60_000;

export const TRIP_ASSOCIATION_ANCHOR_TOLERANCE_MS = 120_000;

/** ENDED sessions remain eligible for late trip link within this window after session end. */
export const LATE_TRIP_ASSOCIATION_ENDED_SESSION_LOOKBACK_MS = 7 * 24 * 60 * 60_000;
