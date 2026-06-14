import { registerAs } from '@nestjs/config';

/**
 * Data Retention configuration.
 *
 * Controls the {@link DataRetentionScheduler} that prunes append-only
 * telemetry / polling / log tables which otherwise grow unbounded.
 *
 * All age windows are expressed in **days**. A value of `0` disables
 * retention for that table (nothing is ever deleted). Operational log
 * tables ship with sane non-zero defaults; product- and health-relevant
 * tables default to `0` (disabled) and must be opted into explicitly.
 */

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

export default registerAs('retention', () => ({
  // Master switch. When false the scheduler runs but performs no deletes.
  enabled: boolEnv('DATA_RETENTION_ENABLED', true),

  // Rows deleted per batch (keeps locks short, avoids long-running transactions).
  batchSize: intEnv('DATA_RETENTION_BATCH_SIZE', 5000),
  // Safety cap on batches per table per run (batchSize * maxBatches = max rows/run/table).
  maxBatchesPerTable: intEnv('DATA_RETENTION_MAX_BATCHES', 500),

  // Age windows in days. 0 = retention disabled for that table.
  days: {
    // ── Operational logs / runs (safe defaults: enabled) ──
    dimoPollLogs: intEnv('RETENTION_DIMO_POLL_LOGS_DAYS', 30),
    tripTrackingRuns: intEnv('RETENTION_TRIP_TRACKING_RUNS_DAYS', 30),
    hmStreamSyncLogs: intEnv('RETENTION_HM_STREAM_SYNC_LOGS_DAYS', 14),
    hmHealthSyncLogs: intEnv('RETENTION_HM_HEALTH_SYNC_LOGS_DAYS', 30),
    tripRepairs: intEnv('RETENTION_TRIP_REPAIRS_DAYS', 365),
    refreshTokens: intEnv('RETENTION_REFRESH_TOKENS_DAYS', 30),

    // ── Product / audit / health data (default: disabled — opt-in only) ──
    activityLogs: intEnv('RETENTION_ACTIVITY_LOGS_DAYS', 0),
    tripWaypoints: intEnv('RETENTION_TRIP_WAYPOINTS_DAYS', 0),
    tireHealthSnapshots: intEnv('RETENTION_TIRE_HEALTH_SNAPSHOTS_DAYS', 0),
    tireWearDataPoints: intEnv('RETENTION_TIRE_WEAR_DATA_POINTS_DAYS', 0),
    batteryEvidence: intEnv('RETENTION_BATTERY_EVIDENCE_DAYS', 0),
    hvBatterySnapshots: intEnv('RETENTION_HV_BATTERY_SNAPSHOTS_DAYS', 0),
  },
}));
