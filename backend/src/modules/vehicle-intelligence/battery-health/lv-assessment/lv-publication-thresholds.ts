import { BATTERY_FRESHNESS_THRESHOLDS_MS } from '../battery-freshness.policy';

/** Bump when publication gates or hysteresis change. */
export const LV_PUBLICATION_POLICY_VERSION = '1.0.0';

export const LV_PUBLICATION_MATURITY_STATES = [
  'UNAVAILABLE',
  'CALIBRATING',
  'SHADOW',
  'PROVISIONAL',
  'STABLE',
  'STALE',
  'SUPERSEDED',
] as const;

export type LvPublicationMaturity =
  (typeof LV_PUBLICATION_MATURITY_STATES)[number];

/** Minimum distinct compatible measurement cycles before provisional publication. */
export const LV_PUBLICATION_MIN_COMPATIBLE_CYCLES_PROVISIONAL = 3;

/** Minimum compatible cycles for STABLE maturity (architecture O8: 6 VALID REST). */
export const LV_PUBLICATION_MIN_COMPATIBLE_CYCLES_STABLE = 6;

/** Minimum span from first to latest assessment evidence for STABLE. */
export const LV_PUBLICATION_MIN_DAYS_FOR_STABLE = 14;

/** Minimum selected VALID evidence count for any user-facing publication. */
export const LV_PUBLICATION_MIN_VALID_EVIDENCE_COUNT = 2;

/** Confidence score floor for provisional publication. */
export const LV_PUBLICATION_MIN_CONFIDENCE_SCORE_PROVISIONAL = 0.5;

/** Confidence score floor for stable publication. */
export const LV_PUBLICATION_MIN_CONFIDENCE_SCORE_STABLE = 0.5;

/**
 * When contamination rejections exceed this share of all considered evidence,
 * publication is blocked (contamination dominance).
 */
export const LV_PUBLICATION_CONTAMINATION_DOMINANCE_MAX_RATIO = 0.5;

/** EWMA alpha for stabilizing estimated-health before hysteresis gate. */
export const LV_PUBLICATION_EWMA_ALPHA = 0.25;

/** Damped alpha when stabilize() detects an outlier. */
export const LV_PUBLICATION_EWMA_DAMPED_ALPHA = 0.05;

/** Hysteresis minimum delta (percentage points) before updating published value. */
export const LV_PUBLICATION_HYSTERESIS_MIN_DELTA_PP = 2;

/** Assessment evidence must be fresh within this window — not live voltage. */
export const LV_PUBLICATION_ASSESSMENT_FRESHNESS_MS =
  BATTERY_FRESHNESS_THRESHOLDS_MS.assessmentObservation;

/** Published row becomes STALE when evidence age exceeds this window. */
export const LV_PUBLICATION_OBSERVATION_STALE_MS =
  BATTERY_FRESHNESS_THRESHOLDS_MS.publicationObservation;
