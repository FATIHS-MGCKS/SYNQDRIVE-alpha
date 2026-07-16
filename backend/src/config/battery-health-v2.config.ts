import { registerAs } from '@nestjs/config';

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

/** Prompt 3 flag — real CRANK_MIN assessment (default OFF, Prompt 7/78). */
export const BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV = 'BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENABLED';

/** Prompt 3 flag — collect start-window points for future START_DIP_PROXY analysis. */
export const BATTERY_V2_START_PROXY_ENV = 'BATTERY_V2_START_PROXY_ENABLED';

/** DIMO crank query uses 5 s aggregation — no sub-second precision claims. */
export const BATTERY_CRANK_SIGNAL_CADENCE_MS = 5_000;

export function isLegacyCrankAssessmentEnabled(): boolean {
  return parseBooleanEnv(process.env[BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV], false);
}

export function isStartWindowCollectionEnabled(): boolean {
  return parseBooleanEnv(process.env[BATTERY_V2_START_PROXY_ENV], false);
}

export default registerAs('batteryHealthV2', () => ({
  legacyCrankAssessmentEnabled: isLegacyCrankAssessmentEnabled(),
  startProxyCollectionEnabled: isStartWindowCollectionEnabled(),
  crankSignalCadenceMs: BATTERY_CRANK_SIGNAL_CADENCE_MS,
}));
