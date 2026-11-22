import type { VehicleRegistrationConvergenceConfig } from '@config/vehicle-registration-convergence.config';

export function isHmOnlyCanonicalRoutingEnabled(
  config: VehicleRegistrationConvergenceConfig | undefined,
): boolean {
  return config?.hmOnlyCanonicalEnabled === true;
}

/**
 * V2B-PR1: always false — billing single-rail is not armable; manual create keeps legacy hook.
 * V2B-PR6+ may gate on config after manual canonical activation ships.
 */
export function shouldSuppressLegacyVehicleCreateBillingHook(
  _config: VehicleRegistrationConvergenceConfig | undefined,
): boolean {
  return false;
}