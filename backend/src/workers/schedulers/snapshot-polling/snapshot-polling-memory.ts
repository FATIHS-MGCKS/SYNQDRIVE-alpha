import type { SnapshotPollingTier } from './snapshot-polling-tier.types';

export interface VehiclePollingMemoryEntry {
  effectiveTier: SnapshotPollingTier;
  lastActiveDrivingAtMs: number | null;
}

/**
 * Drop hysteresis entries for vehicles no longer in the current scheduler
 * cohort so a churning fleet cannot grow process memory without bound.
 */
export function pruneVehiclePollingMemory(
  memory: Map<string, VehiclePollingMemoryEntry>,
  activeVehicleIds: ReadonlySet<string>,
): number {
  let removed = 0;
  for (const vehicleId of memory.keys()) {
    if (!activeVehicleIds.has(vehicleId)) {
      memory.delete(vehicleId);
      removed += 1;
    }
  }
  return removed;
}
