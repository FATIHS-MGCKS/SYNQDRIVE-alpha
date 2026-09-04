import { registerAs } from '@nestjs/config';

export const PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED_ENV =
  'PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED';

/** Bounded candidate load: lookback from trigger observation time. Default 6h. */
export const PHYSICAL_REFUEL_CANDIDATE_LOOKBACK_MS_ENV =
  'PHYSICAL_REFUEL_CANDIDATE_LOOKBACK_MS';

/** Bounded candidate load: lookahead from trigger observation time. Default 1h. */
export const PHYSICAL_REFUEL_CANDIDATE_LOOKAHEAD_MS_ENV =
  'PHYSICAL_REFUEL_CANDIDATE_LOOKAHEAD_MS';

/** Settlement horizon override (ms). Default 60m — matches G1.2c INFERRED calibration. */
export const PHYSICAL_REFUEL_SETTLEMENT_HORIZON_MS_ENV =
  'PHYSICAL_REFUEL_SETTLEMENT_HORIZON_MS';

/** G2.1a durable reconciliation recovery scheduler. */
export const PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED_ENV =
  'PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED';

export const PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_INTERVAL_MS_ENV =
  'PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_INTERVAL_MS';

export const PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_BATCH_SIZE_ENV =
  'PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_BATCH_SIZE';

/**
 * Events observed at/after this instant are V2-owned when reconciliation is enabled.
 * Defaults to FUEL_STATION_ENRICHMENT_CUTOVER_AT when unset.
 */
export const PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV =
  'PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT';

/** Bounded orphan scan lookback for recovery (default 7d). */
export const PHYSICAL_REFUEL_RECOVERY_ORPHAN_LOOKBACK_MS_ENV =
  'PHYSICAL_REFUEL_RECOVERY_ORPHAN_LOOKBACK_MS';

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

function parseOptionalIsoDate(value: string | undefined): Date | null {
  if (value == null || value.trim() === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default registerAs('physicalRefuelReconciliation', () => ({
  enabled: parseBooleanEnv(process.env[PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED_ENV], false),
  candidateLookbackMs: parsePositiveIntEnv(
    process.env[PHYSICAL_REFUEL_CANDIDATE_LOOKBACK_MS_ENV],
    6 * 60 * 60 * 1000,
  ),
  candidateLookaheadMs: parsePositiveIntEnv(
    process.env[PHYSICAL_REFUEL_CANDIDATE_LOOKAHEAD_MS_ENV],
    60 * 60 * 1000,
  ),
  settlementHorizonMs: parsePositiveIntEnv(
    process.env[PHYSICAL_REFUEL_SETTLEMENT_HORIZON_MS_ENV],
    60 * 60 * 1000,
  ),
  recoveryEnabled: parseBooleanEnv(
    process.env[PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED_ENV],
    true,
  ),
  recoveryIntervalMs: parsePositiveIntEnv(
    process.env[PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_INTERVAL_MS_ENV],
    60_000,
  ),
  recoveryBatchSize: parsePositiveIntEnv(
    process.env[PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_BATCH_SIZE_ENV],
    25,
  ),
  v2OwnershipCutoverAt: parseOptionalIsoDate(
    process.env[PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV],
  ),
  recoveryOrphanLookbackMs: parsePositiveIntEnv(
    process.env[PHYSICAL_REFUEL_RECOVERY_ORPHAN_LOOKBACK_MS_ENV],
    7 * 24 * 60 * 60 * 1000,
  ),
}));

export function isPhysicalRefuelReconciliationV2Enabled(): boolean {
  return parseBooleanEnv(process.env[PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED_ENV], false);
}
