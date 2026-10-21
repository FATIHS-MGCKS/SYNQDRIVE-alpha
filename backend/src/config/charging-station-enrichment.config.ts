import { registerAs } from '@nestjs/config';
import type { ChargingStationEnrichmentCutoverState } from '@modules/vehicle-intelligence/charging-stations/enrichment/charging-station-enrichment-cutover.util';

export const CHARGING_STATION_ENRICHMENT_ENABLED_ENV = 'CHARGING_STATION_ENRICHMENT_ENABLED';
export const CHARGING_STATION_ENRICHMENT_CUTOVER_AT_ENV =
  'CHARGING_STATION_ENRICHMENT_CUTOVER_AT';
export const CHARGING_STATION_ENRICHMENT_RECOVERY_ENABLED_ENV =
  'CHARGING_STATION_ENRICHMENT_RECOVERY_ENABLED';
export const CHARGING_STATION_ENRICHMENT_RECOVERY_INTERVAL_MS_ENV =
  'CHARGING_STATION_ENRICHMENT_RECOVERY_INTERVAL_MS';
export const CHARGING_STATION_ENRICHMENT_RECOVERY_BATCH_SIZE_ENV =
  'CHARGING_STATION_ENRICHMENT_RECOVERY_BATCH_SIZE';
export const CHARGING_STATION_ENRICHMENT_JOB_ATTEMPTS_ENV =
  'CHARGING_STATION_ENRICHMENT_JOB_ATTEMPTS';
export const CHARGING_STATION_ENRICHMENT_JOB_BACKOFF_MS_ENV =
  'CHARGING_STATION_ENRICHMENT_JOB_BACKOFF_MS';

/** Only explicit `true` enables critical runtime paths (E6.3 contract). */
export function parseStrictBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  return value.trim().toLowerCase() === 'true';
}

export function parseStrictPositiveIntEnv(value: string | undefined, defaultValue: number): number {
  if (value == null || value.trim() === '') return defaultValue;
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return defaultValue;
  if (String(parsed) !== trimmed && !/^\+?[1-9]\d*$/.test(trimmed)) return defaultValue;
  return parsed;
}

function parseCutoverAt(value: string | undefined): {
  cutoverAt: Date | null;
  cutoverState: ChargingStationEnrichmentCutoverState;
} {
  if (value == null || value.trim() === '') {
    return { cutoverAt: null, cutoverState: 'missing' };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { cutoverAt: null, cutoverState: 'invalid' };
  }
  return { cutoverAt: parsed, cutoverState: 'valid' };
}

export default registerAs('chargingStationEnrichment', () => {
  const cutover = parseCutoverAt(process.env[CHARGING_STATION_ENRICHMENT_CUTOVER_AT_ENV]);
  return {
    enabled: parseStrictBooleanEnv(process.env[CHARGING_STATION_ENRICHMENT_ENABLED_ENV], false),
    cutoverAt: cutover.cutoverAt,
    cutoverState: cutover.cutoverState,
    recoveryEnabled: parseStrictBooleanEnv(
      process.env[CHARGING_STATION_ENRICHMENT_RECOVERY_ENABLED_ENV],
      false,
    ),
    recoveryIntervalMs: parseStrictPositiveIntEnv(
      process.env[CHARGING_STATION_ENRICHMENT_RECOVERY_INTERVAL_MS_ENV],
      300_000,
    ),
    recoveryBatchSize: parseStrictPositiveIntEnv(
      process.env[CHARGING_STATION_ENRICHMENT_RECOVERY_BATCH_SIZE_ENV],
      50,
    ),
    jobAttempts: parseStrictPositiveIntEnv(
      process.env[CHARGING_STATION_ENRICHMENT_JOB_ATTEMPTS_ENV],
      5,
    ),
    jobBackoffMs: parseStrictPositiveIntEnv(
      process.env[CHARGING_STATION_ENRICHMENT_JOB_BACKOFF_MS_ENV],
      10_000,
    ),
  };
});
