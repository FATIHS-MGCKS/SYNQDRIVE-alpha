/** Product detectionMechanism for canonical ERD HV session → VEE RECHARGE projection (not legacy DIMO detector). */
export const ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM =
  'ERD_HV_CHARGE_SESSION_PROJECTION' as const;

export const ERD_RECHARGE_PROJECTION_META_VERSION = 1 as const;

/** Immutable physical product projection identity version (E5.1 foundation). */
export const ERD_RECHARGE_PROJECTION_IDENTITY_VERSION = 'v1' as const;

/** Prefix for {@link buildErdRechargePhysicalProjectionSourceEventKey}. Max total length 512 (VARCHAR). */
export const ERD_RECHARGE_PHYSICAL_PROJECTION_KEY_PREFIX = 'erd:physical:v1:' as const;

/** Documented E3 shared lock — runtime wiring deferred to E5.2+. */
export const ERD_RECHARGE_PROJECTION_AUTHORITY_LOCK_CONTRACT =
  'acquireErdHvChargeSessionVehicleAuthorityLock' as const;
