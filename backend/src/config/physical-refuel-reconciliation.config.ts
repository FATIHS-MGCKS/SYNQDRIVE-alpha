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
}));

export function isPhysicalRefuelReconciliationV2Enabled(): boolean {
  return parseBooleanEnv(process.env[PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED_ENV], false);
}
