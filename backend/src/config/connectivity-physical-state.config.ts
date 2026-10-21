import { registerAs } from '@nestjs/config';
import { parseConnectivityRecoveryBoolean } from './connectivity-recovery.config';

export const CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV =
  'CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED';

export function loadConnectivityPhysicalStateConfig(
  env: NodeJS.ProcessEnv = process.env,
): {
  physicalStateReconciliationEnabled: boolean;
} {
  return {
    physicalStateReconciliationEnabled: parseConnectivityRecoveryBoolean(
      env[CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV],
      false,
    ),
  };
}

export default registerAs('connectivityPhysicalState', () =>
  loadConnectivityPhysicalStateConfig(),
);

export function isConnectivityPhysicalStateReconciliationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return loadConnectivityPhysicalStateConfig(env).physicalStateReconciliationEnabled;
}
