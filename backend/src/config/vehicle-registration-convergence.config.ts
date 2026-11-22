import { registerAs } from '@nestjs/config';

export const VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED_ENV =
  'VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED';
export const VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL_ENV =
  'VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL';

const STRICT_TRUE = new Set(['true', '1', 'yes', 'on']);
const STRICT_FALSE = new Set(['false', '0', 'no', 'off']);

function parseStrictBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (STRICT_TRUE.has(normalized)) return true;
  if (STRICT_FALSE.has(normalized)) return false;
  throw new Error(
    `Invalid boolean for vehicle registration convergence env (got "${value}"); use true|false|1|0`,
  );
}

export interface VehicleRegistrationConvergenceConfig {
  hmOnlyCanonicalEnabled: boolean;
  billingSingleRailEnabled: boolean;
}

/** V2B-PR1: billing single-rail cannot be armed until manual canonical emits VEHICLE_ACTIVATED. */
export const VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL_NOT_ARMABLE_PR1 =
  'VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL is not armable in V2B-PR1 (manual canonical activation not shipped)';

export function validateVehicleRegistrationConvergenceConfig(
  config: VehicleRegistrationConvergenceConfig,
): void {
  if (config.billingSingleRailEnabled) {
    throw new Error(`FATAL: ${VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL_NOT_ARMABLE_PR1}`);
  }
}

export function loadVehicleRegistrationConvergenceConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): VehicleRegistrationConvergenceConfig {
  const config: VehicleRegistrationConvergenceConfig = {
    hmOnlyCanonicalEnabled: parseStrictBooleanEnv(
      env[VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED_ENV],
      false,
    ),
    billingSingleRailEnabled: parseStrictBooleanEnv(
      env[VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL_ENV],
      false,
    ),
  };
  validateVehicleRegistrationConvergenceConfig(config);
  return config;
}

/**
 * V2B-PR1: canonical registration convergence flags (default OFF).
 * Arming routes or billing suppression without owner approval is unsupported in PR1.
 */
export default registerAs('vehicleRegistrationConvergence', () =>
  loadVehicleRegistrationConvergenceConfigFromEnv(),
);