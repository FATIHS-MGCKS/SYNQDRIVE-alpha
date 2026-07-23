export interface TelemetryIngestionEnforcementConfig {
  /** When true, DENY decisions are logged but persistence is still allowed (default). */
  shadowMode: boolean;
  /** When true, DENY blocks persistence — requires shadow coverage before enabling in prod. */
  failClosed: boolean;
}

export function readTelemetryIngestionEnforcementConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelemetryIngestionEnforcementConfig {
  const isProd = (env.NODE_ENV ?? '').toLowerCase() === 'production';

  return {
    shadowMode: parseBool(env.DATA_AUTH_INGEST_SHADOW_MODE, true),
    failClosed: parseBool(env.DATA_AUTH_INGEST_FAIL_CLOSED, isProd ? false : false),
  };
}

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}
