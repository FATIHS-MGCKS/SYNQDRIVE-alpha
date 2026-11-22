import type { VehicleRegistrationConvergenceConfig } from '@config/vehicle-registration-convergence.config';

export function isHmOnlyCanonicalRoutingEnabled(
  config: VehicleRegistrationConvergenceConfig | undefined,
): boolean {
  return config?.hmOnlyCanonicalEnabled === true;
}

export function shouldSuppressLegacyVehicleCreateBillingHook(
  config: VehicleRegistrationConvergenceConfig | undefined,
): boolean {
  return config?.billingSingleRailEnabled === true;
}