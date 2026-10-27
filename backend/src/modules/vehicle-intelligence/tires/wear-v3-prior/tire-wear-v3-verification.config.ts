/**
 * Tire Wear V3 — manual tread verification cadence (km + time fallback).
 * Isolated from V2 `TIRE_HEALTH_CONFIG.measurementFreshness` / confidenceLevels.
 */
export const TIRE_WEAR_V3_VERIFICATION_POLICY = {
  remindKm: 4500,
  dueKm: 5000,
  overdueKm: 6000,
  timeFallbackMonths: 6,
} as const;

export type TireWearV3VerificationPolicy = {
  remindKm: number;
  dueKm: number;
  overdueKm: number;
  timeFallbackMonths: number;
};

export function validateTireWearV3VerificationPolicy(
  policy: TireWearV3VerificationPolicy,
): void {
  const { remindKm, dueKm, overdueKm, timeFallbackMonths } = policy;
  if (!(remindKm < dueKm && dueKm < overdueKm)) {
    throw new Error(
      'Tire Wear V3 verification policy requires remindKm < dueKm < overdueKm',
    );
  }
  if (timeFallbackMonths < 1) {
    throw new Error('timeFallbackMonths must be at least 1');
  }
}

validateTireWearV3VerificationPolicy(TIRE_WEAR_V3_VERIFICATION_POLICY);
