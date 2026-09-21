/** M3.3A generalized battery evidence constants. */

export const GENERALIZED_EVIDENCE_CLASSIFICATION_VERSION = 'm3.3a-v1';

/** Nominal R1 cadence for derived metadata only — not used for equality gating. */
export const R1_NOMINAL_REST_CADENCE_MS = 8 * 60 * 60_000;

/** Tolerance policy placeholder until production forensics characterize jitter. */
export const INITIAL_REST_TOLERANCE_POLICY_VERSION = 'RESEARCH_PENDING';

/** Minimum age after session anchor before REST_WAKE_VOLTAGE (not exact 8h). */
export const MIN_REST_WAKE_AGE_AFTER_ANCHOR_MS = 60_000;

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
