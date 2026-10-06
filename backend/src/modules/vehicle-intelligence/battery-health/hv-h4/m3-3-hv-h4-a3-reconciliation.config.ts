import { parseStrictPositiveIntegerString } from '../generalized-evidence/rest-session-features/longitudinal/longitudinal-profile-materialization.runtime-config';

export const BATTERY_HV_H4_A3_RECONCILIATION_ENABLED_ENV =
  'BATTERY_HV_H4_A3_RECONCILIATION_ENABLED';

export const BATTERY_HV_H4_A3_RECONCILIATION_INTERVAL_MS_ENV =
  'BATTERY_HV_H4_A3_RECONCILIATION_INTERVAL_MS';

export const BATTERY_HV_H4_A3_RECONCILIATION_BATCH_SIZE_ENV =
  'BATTERY_HV_H4_A3_RECONCILIATION_BATCH_SIZE';

export const BATTERY_HV_H4_A3_RECONCILIATION_INSPECTION_LIMIT_ENV =
  'BATTERY_HV_H4_A3_RECONCILIATION_INSPECTION_LIMIT';

export const A3_RECONCILIATION_INTERVAL_DEFAULT_MS = 900_000;
export const A3_RECONCILIATION_INTERVAL_MIN_MS = 300_000;
export const A3_RECONCILIATION_BATCH_DEFAULT = 5;
export const A3_RECONCILIATION_BATCH_MAX = 25;
export const A3_RECONCILIATION_INSPECTION_LIMIT_DEFAULT = 50;
export const A3_RECONCILIATION_INSPECTION_LIMIT_MAX = 200;

function parseStrictPositiveIntEnv(value: string | undefined, defaultValue: number): number {
  const parsed = parseStrictPositiveIntegerString(value);
  if (parsed == null) return defaultValue;
  return parsed;
}

const boolEnv = (key: string, def: boolean): boolean => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return def;
  return raw.toLowerCase() === 'true' || raw === '1';
};

export function isBatteryHvH4A3ReconciliationEnabled(): boolean {
  return boolEnv(BATTERY_HV_H4_A3_RECONCILIATION_ENABLED_ENV, false);
}

export function getBatteryHvH4A3ReconciliationIntervalMs(): number {
  const parsed = parseStrictPositiveIntEnv(
    process.env[BATTERY_HV_H4_A3_RECONCILIATION_INTERVAL_MS_ENV],
    A3_RECONCILIATION_INTERVAL_DEFAULT_MS,
  );
  return Math.max(parsed, A3_RECONCILIATION_INTERVAL_MIN_MS);
}

export function getBatteryHvH4A3ReconciliationBatchSize(): number {
  const parsed = parseStrictPositiveIntEnv(
    process.env[BATTERY_HV_H4_A3_RECONCILIATION_BATCH_SIZE_ENV],
    A3_RECONCILIATION_BATCH_DEFAULT,
  );
  return Math.min(parsed, A3_RECONCILIATION_BATCH_MAX);
}

export function getBatteryHvH4A3ReconciliationInspectionLimit(): number {
  const parsed = parseStrictPositiveIntEnv(
    process.env[BATTERY_HV_H4_A3_RECONCILIATION_INSPECTION_LIMIT_ENV],
    A3_RECONCILIATION_INSPECTION_LIMIT_DEFAULT,
  );
  return Math.min(parsed, A3_RECONCILIATION_INSPECTION_LIMIT_MAX);
}
