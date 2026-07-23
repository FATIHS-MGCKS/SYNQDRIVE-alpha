export interface VehicleHealthEnforcementConfig {
  shadowMode: boolean;
  failClosed: boolean;
}

export function readVehicleHealthEnforcementConfig(
  env: NodeJS.ProcessEnv = process.env,
): VehicleHealthEnforcementConfig {
  const isProd = (env.NODE_ENV ?? '').toLowerCase() === 'production';

  return {
    shadowMode: parseBool(env.DATA_AUTH_HEALTH_SHADOW_MODE, true),
    failClosed: parseBool(env.DATA_AUTH_HEALTH_FAIL_CLOSED, isProd ? false : false),
  };
}

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}
