import { registerAs } from '@nestjs/config';

export const FUEL_STATION_ENRICHMENT_ENABLED_ENV = 'FUEL_STATION_ENRICHMENT_ENABLED';
export const FUEL_STATION_ENRICHMENT_CUTOVER_AT_ENV = 'FUEL_STATION_ENRICHMENT_CUTOVER_AT';
export const FUEL_STATION_ENRICHMENT_RECOVERY_ENABLED_ENV =
  'FUEL_STATION_ENRICHMENT_RECOVERY_ENABLED';
export const FUEL_STATION_ENRICHMENT_RECOVERY_INTERVAL_MS_ENV =
  'FUEL_STATION_ENRICHMENT_RECOVERY_INTERVAL_MS';
export const FUEL_STATION_ENRICHMENT_RECOVERY_BATCH_SIZE_ENV =
  'FUEL_STATION_ENRICHMENT_RECOVERY_BATCH_SIZE';
export const FUEL_STATION_ENRICHMENT_JOB_ATTEMPTS_ENV = 'FUEL_STATION_ENRICHMENT_JOB_ATTEMPTS';
export const FUEL_STATION_ENRICHMENT_JOB_BACKOFF_MS_ENV = 'FUEL_STATION_ENRICHMENT_JOB_BACKOFF_MS';

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parsePositiveIntEnv(value: string | undefined, defaultValue: number): number {
  if (value == null || value.trim() === '') return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseCutoverAt(value: string | undefined): Date | null {
  if (value == null || value.trim() === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default registerAs('fuelStationEnrichment', () => ({
  enabled: parseBooleanEnv(process.env[FUEL_STATION_ENRICHMENT_ENABLED_ENV], false),
  cutoverAt: parseCutoverAt(process.env[FUEL_STATION_ENRICHMENT_CUTOVER_AT_ENV]),
  recoveryEnabled: parseBooleanEnv(
    process.env[FUEL_STATION_ENRICHMENT_RECOVERY_ENABLED_ENV],
    false,
  ),
  recoveryIntervalMs: parsePositiveIntEnv(
    process.env[FUEL_STATION_ENRICHMENT_RECOVERY_INTERVAL_MS_ENV],
    300_000,
  ),
  recoveryBatchSize: parsePositiveIntEnv(
    process.env[FUEL_STATION_ENRICHMENT_RECOVERY_BATCH_SIZE_ENV],
    50,
  ),
  jobAttempts: parsePositiveIntEnv(process.env[FUEL_STATION_ENRICHMENT_JOB_ATTEMPTS_ENV], 5),
  jobBackoffMs: parsePositiveIntEnv(process.env[FUEL_STATION_ENRICHMENT_JOB_BACKOFF_MS_ENV], 10_000),
}));

export function isFuelStationEnrichmentEnabled(): boolean {
  return parseBooleanEnv(process.env[FUEL_STATION_ENRICHMENT_ENABLED_ENV], false);
}

export function getFuelStationEnrichmentCutoverAt(): Date | null {
  return parseCutoverAt(process.env[FUEL_STATION_ENRICHMENT_CUTOVER_AT_ENV]);
}
