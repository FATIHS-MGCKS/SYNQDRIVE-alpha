/**
 * Activity-tier snapshot polling — canonical tier model (P1.2).
 *
 * Pollable tiers apply only to the scheduler cohort:
 *   AVAILABLE/RENTED + dimoVehicle.tokenId + connectionStatus CONNECTED
 *
 * OFFLINE and HARD_OFFLINE are eligibility-boundary labels returned by
 * `deriveSnapshotPollingTier()` when inputs fall outside that cohort.
 * They are never pollable via DimoSnapshotScheduler — connection recovery
 * is owned by DimoVehicleSync (24h identity), device-connection webhooks,
 * and device-connection episode reconciliation.
 */
export const SnapshotPollingTier = {
  ACTIVE_DRIVING: 'ACTIVE_DRIVING',
  RECENTLY_ACTIVE: 'RECENTLY_ACTIVE',
  RESTING_STANDBY: 'RESTING_STANDBY',
  LONG_IDLE: 'LONG_IDLE',
  /** Non-CONNECTED dimoVehicle — excluded at scheduler eligibility, not polled. */
  OFFLINE: 'OFFLINE',
  /** Missing tokenId — excluded at scheduler eligibility, not polled. */
  HARD_OFFLINE: 'HARD_OFFLINE',
} as const;

export type SnapshotPollingTier =
  (typeof SnapshotPollingTier)[keyof typeof SnapshotPollingTier];

export const SNAPSHOT_POLLING_TIERS = Object.values(SnapshotPollingTier);

/** Pollable tiers ordered fastest → slowest for promotion comparisons. */
export const SNAPSHOT_POLLING_TIER_RANK: Record<SnapshotPollingTier, number> = {
  [SnapshotPollingTier.ACTIVE_DRIVING]: 0,
  [SnapshotPollingTier.RECENTLY_ACTIVE]: 1,
  [SnapshotPollingTier.RESTING_STANDBY]: 2,
  [SnapshotPollingTier.LONG_IDLE]: 3,
  [SnapshotPollingTier.OFFLINE]: 4,
  [SnapshotPollingTier.HARD_OFFLINE]: 5,
};

/** Tiers the CONNECTED scheduler cohort may enqueue when due. */
export const SNAPSHOT_POLLABLE_TIERS: ReadonlySet<SnapshotPollingTier> = new Set([
  SnapshotPollingTier.ACTIVE_DRIVING,
  SnapshotPollingTier.RECENTLY_ACTIVE,
  SnapshotPollingTier.RESTING_STANDBY,
  SnapshotPollingTier.LONG_IDLE,
]);

/** True when `newTier` is strictly faster than `previousTier`. */
export function isFasterSnapshotPollingTier(
  newTier: SnapshotPollingTier,
  previousTier: SnapshotPollingTier | null,
): boolean {
  if (previousTier == null) return false;
  return (
    SNAPSHOT_POLLING_TIER_RANK[newTier] < SNAPSHOT_POLLING_TIER_RANK[previousTier]
  );
}
