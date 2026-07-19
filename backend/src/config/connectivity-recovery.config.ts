import { registerAs } from '@nestjs/config';

export const CONNECTIVITY_EPISODE_RECOVERY_ENABLED_ENV =
  'CONNECTIVITY_EPISODE_RECOVERY_ENABLED';
export const CONNECTIVITY_RECONCILIATION_APPLY_ENABLED_ENV =
  'CONNECTIVITY_RECONCILIATION_APPLY_ENABLED';

export function parseConnectivityRecoveryBoolean(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

export function loadConnectivityRecoveryConfig(
  env: NodeJS.ProcessEnv = process.env,
): {
  episodeRecoveryEnabled: boolean;
  reconciliationApplyEnabled: boolean;
} {
  return {
    episodeRecoveryEnabled: parseConnectivityRecoveryBoolean(
      env[CONNECTIVITY_EPISODE_RECOVERY_ENABLED_ENV],
      true,
    ),
    reconciliationApplyEnabled: parseConnectivityRecoveryBoolean(
      env[CONNECTIVITY_RECONCILIATION_APPLY_ENABLED_ENV],
      false,
    ),
  };
}

export default registerAs('connectivityRecovery', () => loadConnectivityRecoveryConfig());
