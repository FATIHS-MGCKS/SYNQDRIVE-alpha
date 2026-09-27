import { parseStrictPositiveIntegerString } from './longitudinal-profile-materialization.runtime-config';

/** M3.3F F4.1 — bounded D3 reconciliation scheduler interval (default 15 min). */
export const BATTERY_V2_LONGITUDINAL_RECONCILIATION_INTERVAL_MS_ENV =
  'BATTERY_V2_LONGITUDINAL_RECONCILIATION_INTERVAL_MS';

/** M3.3F F4.1 — bounded D3 reconciliation batch size (default 2, max 5). */
export const BATTERY_V2_LONGITUDINAL_RECONCILIATION_BATCH_SIZE_ENV =
  'BATTERY_V2_LONGITUDINAL_RECONCILIATION_BATCH_SIZE';

export const LONGITUDINAL_RECONCILIATION_INTERVAL_DEFAULT_MS = 900_000;
export const LONGITUDINAL_RECONCILIATION_INTERVAL_MIN_MS = 300_000;
export const LONGITUDINAL_RECONCILIATION_BATCH_DEFAULT = 2;
export const LONGITUDINAL_RECONCILIATION_BATCH_MAX = 5;

function parseStrictPositiveIntEnv(value: string | undefined, defaultValue: number): number {
  const parsed = parseStrictPositiveIntegerString(value);
  if (parsed == null) return defaultValue;
  return parsed;
}

export function getBatteryV2LongitudinalReconciliationIntervalMs(): number {
  const parsed = parseStrictPositiveIntEnv(
    process.env[BATTERY_V2_LONGITUDINAL_RECONCILIATION_INTERVAL_MS_ENV],
    LONGITUDINAL_RECONCILIATION_INTERVAL_DEFAULT_MS,
  );
  return Math.max(parsed, LONGITUDINAL_RECONCILIATION_INTERVAL_MIN_MS);
}

export function getBatteryV2LongitudinalReconciliationBatchSize(): number {
  const parsed = parseStrictPositiveIntEnv(
    process.env[BATTERY_V2_LONGITUDINAL_RECONCILIATION_BATCH_SIZE_ENV],
    LONGITUDINAL_RECONCILIATION_BATCH_DEFAULT,
  );
  return Math.min(parsed, LONGITUDINAL_RECONCILIATION_BATCH_MAX);
}
