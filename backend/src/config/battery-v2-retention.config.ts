import { registerAs } from '@nestjs/config';

const intEnv = (key: string, def: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw === null || raw.trim() === '') return def;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
};

const boolEnv = (key: string, def: boolean): boolean => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return def;
  return raw.toLowerCase() === 'true' || raw === '1';
};

/**
 * Battery V2 retention — domain-aware pruning with safe defaults.
 *
 * Master switch defaults OFF; dry-run defaults ON so operators must explicitly
 * opt into destructive deletes. Age windows use days; `0` disables a category.
 */
export default registerAs('batteryV2Retention', () => ({
  enabled: boolEnv('BATTERY_V2_RETENTION_ENABLED', false),
  dryRun: boolEnv('BATTERY_V2_RETENTION_DRY_RUN', true),
  batchSize: intEnv('BATTERY_V2_RETENTION_BATCH_SIZE', 1000),
  maxBatchesPerPhase: intEnv('BATTERY_V2_RETENTION_MAX_BATCHES', 200),

  days: {
    /** Raw LV provider poll snapshots (`battery_health_snapshots`). */
    lvProviderSnapshots: intEnv('RETENTION_BATTERY_LV_PROVIDER_SNAPSHOTS_DAYS', 90),
    /** Raw HV provider poll snapshots (`hv_battery_health_snapshots`). */
    hvProviderSnapshots: intEnv('RETENTION_HV_PROVIDER_SNAPSHOTS_DAYS', 365),
    /** LV measurements by `observedAt`. */
    measurementsLv: intEnv('RETENTION_BATTERY_MEASUREMENTS_LV_DAYS', 730),
    /** HV measurements by `observedAt`. */
    measurementsHv: intEnv('RETENTION_BATTERY_MEASUREMENTS_HV_DAYS', 1095),
    /** Sessions by `startedAt` once aggregates exist and measurements are gone. */
    measurementSessions: intEnv('RETENTION_BATTERY_MEASUREMENT_SESSIONS_DAYS', 1095),
    /** Superseded assessment detail rows by `computedAt`. */
    assessmentsDetail: intEnv('RETENTION_BATTERY_ASSESSMENTS_DAYS', 365),
    /** HV charge sessions by `startAt`. */
    hvChargeSessions: intEnv('RETENTION_HV_CHARGE_SESSIONS_DAYS', 1095),
    /** HV capacity shadow observations by `observedAt`. */
    hvCapacityObservations: intEnv('RETENTION_HV_CAPACITY_OBSERVATIONS_DAYS', 1095),
    /** Shadow-only telemetry evidence by `observedAt`. Qualified evidence: never (0). */
    evidenceShadowOnly: intEnv('RETENTION_BATTERY_EVIDENCE_SHADOW_DAYS', 1095),
    /** Capability change audit by `changedAt`. */
    capabilityChanges: intEnv('RETENTION_BATTERY_CAPABILITY_CHANGES_DAYS', 90),
    /** Dead-letter operational ledger by `failedAt`. */
    deadLetters: intEnv('RETENTION_BATTERY_V2_DEAD_LETTERS_DAYS', 90),
    /** Publications and qualified evidence — 0 = keep indefinitely. */
    publications: intEnv('RETENTION_BATTERY_PUBLICATIONS_DAYS', 0),
    qualifiedEvidence: intEnv('RETENTION_BATTERY_QUALIFIED_EVIDENCE_DAYS', 0),
    /** Retention aggregates themselves — 0 = keep indefinitely. */
    aggregates: intEnv('RETENTION_BATTERY_RETENTION_AGGREGATES_DAYS', 0),
  },
}));
