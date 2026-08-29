import {
  buildAuditMixedFleetDistribution,
  simulateSnapshotPollingLoad,
} from './simulate-snapshot-polling-load';
import { DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG } from './snapshot-polling-tier.config';

const FLEET_SIZES = [100, 250, 500, 1000, 2500] as const;

describe('simulateSnapshotPollingLoad', () => {
  const config = DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG;

  it.each(FLEET_SIZES)(
    'N=%i mixed fleet is far below legacy ~2N jobs/min',
    (fleetSize) => {
      const distribution = buildAuditMixedFleetDistribution(fleetSize);
      const result = simulateSnapshotPollingLoad({
        fleetSize,
        distribution,
        config,
      });

      expect(result.legacyEnqueuesPerMinute).toBe(fleetSize * 2);
      expect(result.enqueuesPerMinute).toBeLessThan(result.legacyEnqueuesPerMinute * 0.5);

      if (fleetSize === 1000) {
        expect(result.enqueuesPerMinute).toBeLessThan(500);
        expect(result.enqueuesPerMinute).not.toBeCloseTo(2000, -1);
      }
    },
  );

  it('records modeled rates for audit distribution at N=1000', () => {
    const fleetSize = 1000;
    const result = simulateSnapshotPollingLoad({
      fleetSize,
      distribution: buildAuditMixedFleetDistribution(fleetSize),
      config,
    });

    // Steady-state modeled rate (jobs/min) for audit report
    expect(result.enqueuesPerMinute).toBeCloseTo(376.67, 0);
    expect(result.reductionFactor).toBeGreaterThan(5);
    expect(result.enqueuesPerMinute).toBeLessThan(500);
  });

  it('6-vehicle all-active fleet remains compatible with legacy rate', () => {
    const result = simulateSnapshotPollingLoad({
      fleetSize: 6,
      distribution: {
        ACTIVE_DRIVING: 6,
        RECENTLY_ACTIVE: 0,
        RESTING_STANDBY: 0,
        LONG_IDLE: 0,
      },
      config,
    });
    expect(result.enqueuesPerMinute).toBe(12);
    expect(result.legacyEnqueuesPerMinute).toBe(12);
  });
});
