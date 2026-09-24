/** M3.3D D2 — internal longitudinal profile contract (shape). */
export const REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION =
  'M3_3D_LONGITUDINAL_PROFILE_V1' as const;

/** M3.3D D2 — profile assembly semantics (policy). */
export const REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION =
  'M3_3D_PROFILE_POLICY_V1' as const;

export const LONGITUDINAL_PROFILE_D1_CONTRACT_EXPECTED =
  'M3_3D_D1_LONGITUDINAL_INPUT_V1' as const;

/** Not emitted in D2 V1 — reserved for DEC-M3.3D-001. */
export const LONGITUDINAL_PROFILE_STATUS_INSUFFICIENT_SESSIONS_RESERVED =
  'INSUFFICIENT_SESSIONS' as const;
