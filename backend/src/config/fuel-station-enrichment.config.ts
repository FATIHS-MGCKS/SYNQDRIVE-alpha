import { registerAs } from '@nestjs/config';
import type { FuelStationEnrichmentCutoverState } from '@modules/vehicle-intelligence/fuel-stations/enrichment/fuel-station-enrichment-cutover.util';

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

function parseCutoverAt(value: string | undefined): {
  cutoverAt: Date | null;
  cutoverState: FuelStationEnrichmentCutoverState;
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

export default registerAs('fuelStationEnrichment', () => {
  const cutover = parseCutoverAt(process.env[FUEL_STATION_ENRICHMENT_CUTOVER_AT_ENV]);
  return {
    enabled: parseBooleanEnv(process.env[FUEL_STATION_ENRICHMENT_ENABLED_ENV], false),
    cutoverAt: cutover.cutoverAt,
    cutoverState: cutover.cutoverState,
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
  };
});

export function isFuelStationEnrichmentEnabled(): boolean {
  return parseBooleanEnv(process.env[FUEL_STATION_ENRICHMENT_ENABLED_ENV], false);
}

export function getFuelStationEnrichmentCutoverAt(): Date | null {
  return parseCutoverAt(process.env[FUEL_STATION_ENRICHMENT_CUTOVER_AT_ENV]).cutoverAt;
}
