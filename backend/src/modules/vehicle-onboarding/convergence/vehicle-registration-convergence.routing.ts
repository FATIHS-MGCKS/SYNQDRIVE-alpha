import type { VehicleRegistrationConvergenceConfig } from '@config/vehicle-registration-convergence.config';

export function isHmOnlyCanonicalRoutingEnabled(
  config: VehicleRegistrationConvergenceConfig | undefined,
): boolean {
  return config?.hmOnlyCanonicalEnabled === true;
}

/** V2B-PR7: log-only readiness divergence when legacy HM path is still active (default OFF). */
export function isHmOnlyShadowCompareEnabled(
  config: VehicleRegistrationConvergenceConfig | undefined,
): boolean {
  return config?.shadowCompareEnabled === true && !isHmOnlyCanonicalRoutingEnabled(config);
}

/**
 * V2B-PR1: always false — billing single-rail is not armable. V2B-PR4 retired public manual create (harness-only row insert).
 * V2B-PR4 retired public manual registration (VO-DEC-2B-002); V2B-PR6+ may gate billing single-rail only.
 */
export function shouldSuppressLegacyVehicleCreateBillingHook(
  _config: VehicleRegistrationConvergenceConfig | undefined,
): boolean {
  return false;
}