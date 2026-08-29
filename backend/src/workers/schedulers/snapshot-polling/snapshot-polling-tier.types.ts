/**
 * Activity-tier snapshot polling — canonical tier model (P1.2).
 *
 * Tiers are ordered from highest to lowest polling priority. OFFLINE and
 * HARD_OFFLINE vehicles are excluded from normal snapshot cadence.
 */
export const SnapshotPollingTier = {
  ACTIVE_DRIVING: 'ACTIVE_DRIVING',
  RECENTLY_ACTIVE: 'RECENTLY_ACTIVE',
  RESTING_STANDBY: 'RESTING_STANDBY',
  LONG_IDLE: 'LONG_IDLE',
  OFFLINE: 'OFFLINE',
  HARD_OFFLINE: 'HARD_OFFLINE',
} as const;

export type SnapshotPollingTier =
  (typeof SnapshotPollingTier)[keyof typeof SnapshotPollingTier];

export const SNAPSHOT_POLLING_TIERS = Object.values(SnapshotPollingTier);

/** Tiers that may receive periodic snapshot polls when due. */
export const SNAPSHOT_POLLABLE_TIERS: ReadonlySet<SnapshotPollingTier> = new Set([
  SnapshotPollingTier.ACTIVE_DRIVING,
  SnapshotPollingTier.RECENTLY_ACTIVE,
  SnapshotPollingTier.RESTING_STANDBY,
  SnapshotPollingTier.LONG_IDLE,
]);
