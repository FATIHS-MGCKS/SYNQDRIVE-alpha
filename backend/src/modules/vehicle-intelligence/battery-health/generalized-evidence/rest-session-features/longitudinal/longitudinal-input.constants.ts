/** M3.3D D1 — internal longitudinal input inventory contract (not D2 profile). */
export const REST_SESSION_LONGITUDINAL_INPUT_CONTRACT_VERSION =
  'M3_3D_D1_LONGITUDINAL_INPUT_V1' as const;

/**
 * Engineering safety bound for DB reads — NOT a scientific longitudinal window default.
 * Callers requesting more than this limit receive {@link LongitudinalInputReadRejectReason.SESSION_LIMIT_EXCEEDED}.
 */
export const LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS = 100;

export const LONGITUDINAL_INPUT_PER_SESSION_MAX_CANONICAL_CANDIDATES = 4;

export const LONGITUDINAL_CANONICAL_SELECTION_EQUIVALENT_TO_C5A = true as const;
