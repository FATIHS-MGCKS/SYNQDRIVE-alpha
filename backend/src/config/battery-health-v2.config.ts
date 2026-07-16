import { registerAs } from '@nestjs/config';

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
  if (!Number.isFinite(parsed) || parsed < 1) return defaultValue;
  return parsed;
}

/** Prompt 3 flag — real CRANK_MIN assessment (default OFF, Prompt 7/78). */
export const BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV = 'BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENABLED';

/** Prompt 3 flag — collect start-window points for future START_DIP_PROXY analysis. */
export const BATTERY_V2_START_PROXY_ENV = 'BATTERY_V2_START_PROXY_ENABLED';

/** Prompt 3 flag — legacy HV ΔEnergy/ΔSOC pairwise capacity assessment (default OFF, Prompt 8/78). */
export const BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENV =
  'BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENABLED';

/** DIMO crank query uses 5 s aggregation — no sub-second precision claims. */
export const BATTERY_CRANK_SIGNAL_CADENCE_MS = 5_000;

/** HV snapshots are typically ~30 s apart — pairwise capacity is not production-grade. */
export const HV_PAIRWISE_SNAPSHOT_CADENCE_MS = 30_000;

/** Delay before BATTERY_START_PROXY_EXTRACT runs after trip confirmation (DIMO HF latency). */
export const BATTERY_V2_START_PROXY_DELAY_MS_ENV = 'BATTERY_V2_START_PROXY_DELAY_MS';

const DEFAULT_START_PROXY_DELAY_MS = 90_000;

/** Reconciliation scheduler interval — default 5 min. */
export const BATTERY_V2_RECONCILIATION_INTERVAL_MS_ENV = 'BATTERY_V2_RECONCILIATION_INTERVAL_MS';

/** Stale observation gap before reconciliation re-enqueues classify. */
export const BATTERY_V2_OBSERVATION_STALE_MS_ENV = 'BATTERY_V2_OBSERVATION_STALE_MS';

/** Max items reconciled per category per tick. */
export const BATTERY_V2_RECONCILIATION_BATCH_ENV = 'BATTERY_V2_RECONCILIATION_BATCH';

/** Periodic capability refresh interval — default 6 h (no aggressive polling). */
export const BATTERY_CAPABILITY_REFRESH_INTERVAL_MS_ENV =
  'BATTERY_CAPABILITY_REFRESH_INTERVAL_MS';

/** Re-check interval for DEGRADED/UNAVAILABLE capabilities — default 2 h. */
export const BATTERY_CAPABILITY_SIGNAL_LOSS_RECHECK_MS_ENV =
  'BATTERY_CAPABILITY_SIGNAL_LOSS_RECHECK_MS';

/** Loss count before UNAVAILABLE — default 3 refreshes. */
export const BATTERY_CAPABILITY_LOSS_THRESHOLD_ENV = 'BATTERY_CAPABILITY_LOSS_THRESHOLD';

/** DEGRADED grace before UNAVAILABLE — default 24 h. */
export const BATTERY_CAPABILITY_DEGRADED_GRACE_MS_ENV = 'BATTERY_CAPABILITY_DEGRADED_GRACE_MS';

export function getBatteryV2ReconciliationIntervalMs(): number {
  return parsePositiveIntEnv(process.env[BATTERY_V2_RECONCILIATION_INTERVAL_MS_ENV], 300_000);
}

export function getBatteryV2ObservationStaleMs(): number {
  return parsePositiveIntEnv(process.env[BATTERY_V2_OBSERVATION_STALE_MS_ENV], 120_000);
}

export function getBatteryV2ReconciliationBatchSize(): number {
  return parsePositiveIntEnv(process.env[BATTERY_V2_RECONCILIATION_BATCH_ENV], 25);
}

export function getBatteryCapabilityRefreshIntervalMs(): number {
  return parsePositiveIntEnv(
    process.env[BATTERY_CAPABILITY_REFRESH_INTERVAL_MS_ENV],
    6 * 60 * 60 * 1000,
  );
}

export function getBatteryCapabilitySignalLossRecheckMs(): number {
  return parsePositiveIntEnv(
    process.env[BATTERY_CAPABILITY_SIGNAL_LOSS_RECHECK_MS_ENV],
    2 * 60 * 60 * 1000,
  );
}

export function getBatteryCapabilityLossThreshold(): number {
  return parsePositiveIntEnv(process.env[BATTERY_CAPABILITY_LOSS_THRESHOLD_ENV], 3);
}

export function getBatteryCapabilityDegradedGraceMs(): number {
  return parsePositiveIntEnv(
    process.env[BATTERY_CAPABILITY_DEGRADED_GRACE_MS_ENV],
    24 * 60 * 60 * 1000,
  );
}

export function isBatteryV2ReconciliationEnabled(): boolean {
  return parseBooleanEnv(process.env.BATTERY_V2_RECONCILIATION_ENABLED, true);
}

export function isLegacyCrankAssessmentEnabled(): boolean {
  return parseBooleanEnv(process.env[BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV], false);
}

export function isStartWindowCollectionEnabled(): boolean {
  return parseBooleanEnv(process.env[BATTERY_V2_START_PROXY_ENV], false);
}

export function isLegacyHvPairwiseCapacityAssessmentEnabled(): boolean {
  return parseBooleanEnv(process.env[BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENV], false);
}

export function getBatteryV2StartProxyDelayMs(): number {
  const raw = process.env[BATTERY_V2_START_PROXY_DELAY_MS_ENV];
  if (raw == null || raw.trim() === '') return DEFAULT_START_PROXY_DELAY_MS;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_START_PROXY_DELAY_MS;
  return parsed;
}

export default registerAs('batteryHealthV2', () => ({
  legacyCrankAssessmentEnabled: isLegacyCrankAssessmentEnabled(),
  startProxyCollectionEnabled: isStartWindowCollectionEnabled(),
  legacyHvPairwiseCapacityAssessmentEnabled: isLegacyHvPairwiseCapacityAssessmentEnabled(),
  crankSignalCadenceMs: BATTERY_CRANK_SIGNAL_CADENCE_MS,
  hvPairwiseSnapshotCadenceMs: HV_PAIRWISE_SNAPSHOT_CADENCE_MS,
  startProxyDelayMs: getBatteryV2StartProxyDelayMs(),
  reconciliationEnabled: isBatteryV2ReconciliationEnabled(),
  reconciliationIntervalMs: getBatteryV2ReconciliationIntervalMs(),
  observationStaleMs: getBatteryV2ObservationStaleMs(),
  reconciliationBatchSize: getBatteryV2ReconciliationBatchSize(),
  capabilityRefreshIntervalMs: getBatteryCapabilityRefreshIntervalMs(),
  capabilitySignalLossRecheckMs: getBatteryCapabilitySignalLossRecheckMs(),
  capabilityLossThreshold: getBatteryCapabilityLossThreshold(),
  capabilityDegradedGraceMs: getBatteryCapabilityDegradedGraceMs(),
}));
