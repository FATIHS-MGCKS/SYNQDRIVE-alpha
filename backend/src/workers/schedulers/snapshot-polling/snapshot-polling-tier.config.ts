import { SnapshotPollingTier } from './snapshot-polling-tier.types';

export interface SnapshotPollingTierConfig {
  /** When true, use activity-tier scheduling; when false, legacy fixed 30s for all. */
  activityTierPollingEnabled: boolean;
  /** Rollback: force legacy O(N) every-tick enqueue regardless of activityTierPollingEnabled. */
  legacyFixedCadence: boolean;
  intervalMsByTier: Record<
    | typeof SnapshotPollingTier.ACTIVE_DRIVING
    | typeof SnapshotPollingTier.RECENTLY_ACTIVE
    | typeof SnapshotPollingTier.RESTING_STANDBY
    | typeof SnapshotPollingTier.LONG_IDLE,
    number
  >;
  /**
   * After ACTIVE_DRIVING ends, hold at least RECENTLY_ACTIVE cadence for this
   * duration to avoid tier flapping on a single quiet snapshot.
   */
  activeDrivingDemotionHoldMs: number;
  /** Movement threshold (km/h) that promotes to RECENTLY_ACTIVE. */
  movementSpeedKmh: number;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === '') return fallback;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

/**
 * Centralized snapshot polling tier configuration.
 *
 * Defaults preserve ACTIVE_DRIVING at 30s and progressively slower tiers for
 * inactive vehicles. Set `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=true` to roll
 * back to pre-P1.2 fleet-wide 30s enqueue without code deploy.
 */
export function loadSnapshotPollingTierConfig(
  env: NodeJS.ProcessEnv = process.env,
): SnapshotPollingTierConfig {
  const legacyFixedCadence = parseBool(env.WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE, false);
  const activityTierPollingEnabled = legacyFixedCadence
    ? false
    : parseBool(env.WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED, true);

  return {
    activityTierPollingEnabled,
    legacyFixedCadence,
    intervalMsByTier: {
      [SnapshotPollingTier.ACTIVE_DRIVING]: parsePositiveInt(
        env.WORKER_SNAPSHOT_TIER_ACTIVE_DRIVING_MS,
        30_000,
      ),
      [SnapshotPollingTier.RECENTLY_ACTIVE]: parsePositiveInt(
        env.WORKER_SNAPSHOT_TIER_RECENTLY_ACTIVE_MS,
        60_000,
      ),
      [SnapshotPollingTier.RESTING_STANDBY]: parsePositiveInt(
        env.WORKER_SNAPSHOT_TIER_RESTING_STANDBY_MS,
        5 * 60_000,
      ),
      [SnapshotPollingTier.LONG_IDLE]: parsePositiveInt(
        env.WORKER_SNAPSHOT_TIER_LONG_IDLE_MS,
        30 * 60_000,
      ),
    },
    activeDrivingDemotionHoldMs: parsePositiveInt(
      env.WORKER_SNAPSHOT_ACTIVE_DRIVING_DEMOTION_HOLD_MS,
      90_000,
    ),
    movementSpeedKmh: parsePositiveInt(env.WORKER_SNAPSHOT_MOVEMENT_SPEED_KMH, 3),
  };
}

/** Default config snapshot for tests and documentation. */
export const DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG = loadSnapshotPollingTierConfig({});
