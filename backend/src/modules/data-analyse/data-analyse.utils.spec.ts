import {
  classifyIntervalStatus,
  computeIntervalStats,
  filterConnectedVehicles,
  assessLaunchFeasibility,
} from './data-analyse.utils';

describe('data-analyse.utils', () => {
  describe('computeIntervalStats', () => {
    it('returns null averages for empty input', () => {
      expect(computeIntervalStats([])).toEqual({
        averageMs: null,
        medianMs: null,
        p95Ms: null,
        fastestMs: null,
        slowestMs: null,
        dropoutCount: 0,
        longestGapMs: null,
      });
    });

    it('computes interval stats', () => {
      const stats = computeIntervalStats([30_000, 60_000, 45_000]);
      expect(stats.averageMs).toBe(45_000);
      expect(stats.fastestMs).toBe(30_000);
      expect(stats.slowestMs).toBe(60_000);
    });

    it('caps implausible offline gaps out of cadence KPIs but keeps the true longest gap', () => {
      // One ~40,000,000s outlier (the historical "40505646.6s" bug) must not
      // pollute the cadence stats, yet must still be reported as the longest gap.
      const offlineGapMs = 40_505_646_600;
      const stats = computeIntervalStats([30_000, 31_000, 29_000, offlineGapMs]);

      // Cadence KPIs ignore the offline outlier.
      expect(stats.slowestMs).toBe(31_000);
      expect(stats.averageMs).toBe(30_000);
      expect(stats.medianMs).toBeLessThanOrEqual(31_000);

      // Gap metrics still surface the real outlier.
      expect(stats.longestGapMs).toBe(offlineGapMs);
      expect(stats.dropoutCount).toBe(1);
    });

    it('falls back to the full set when every interval exceeds the cadence cap', () => {
      const big = 10 * 60 * 60 * 1000; // 10h — above the 6h cap
      const stats = computeIntervalStats([big, big]);
      expect(stats.slowestMs).toBe(big);
      expect(stats.averageMs).toBe(big);
    });
  });

  describe('classifyIntervalStatus', () => {
    it('marks missing when no value', () => {
      expect(classifyIntervalStatus(30_000, 30_000, false)).toBe('Missing');
    });

    it('marks OK within tolerance', () => {
      expect(classifyIntervalStatus(40_000, 30_000, true)).toBe('OK');
    });

    it('marks sparse for large gaps', () => {
      expect(classifyIntervalStatus(120_000, 30_000, true)).toBe('Sparse');
    });
  });

  describe('filterConnectedVehicles', () => {
    it('keeps online and standby only', () => {
      const result = filterConnectedVehicles([
        { connectionStatus: 'online' },
        { connectionStatus: 'offline' },
        { connectionStatus: 'standby' },
        { connectionStatus: 'not_connected' },
      ]);
      expect(result).toHaveLength(2);
    });
  });

  describe('assessLaunchFeasibility', () => {
    it('returns not enough data without intervals or waypoints', () => {
      const res = assessLaunchFeasibility({
        availableSignalNames: ['speed'],
        speedIntervalMs: null,
        hasWaypointStream: false,
        snapshotOnly: true,
      });
      expect(res.feasibility).toBe('Not enough data');
    });

    it('returns not reliable for snapshot-only sparse data', () => {
      const res = assessLaunchFeasibility({
        availableSignalNames: ['speed', 'ignition'],
        speedIntervalMs: 30_000,
        hasWaypointStream: false,
        snapshotOnly: true,
      });
      expect(res.feasibility).toBe('Not reliable');
    });
  });
});
