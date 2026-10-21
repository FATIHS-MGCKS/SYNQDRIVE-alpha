import { pruneVehiclePollingMemory } from './snapshot-polling-memory';
import { SnapshotPollingTier } from './snapshot-polling-tier.types';

describe('pruneVehiclePollingMemory', () => {
  it('removes entries not in the current scheduler cohort', () => {
    const memory = new Map([
      ['veh-active', { effectiveTier: SnapshotPollingTier.LONG_IDLE, lastActiveDrivingAtMs: null }],
      ['veh-removed', { effectiveTier: SnapshotPollingTier.RESTING_STANDBY, lastActiveDrivingAtMs: null }],
    ]);

    const removed = pruneVehiclePollingMemory(memory, new Set(['veh-active']));

    expect(removed).toBe(1);
    expect(memory.has('veh-removed')).toBe(false);
    expect(memory.has('veh-active')).toBe(true);
  });
});
