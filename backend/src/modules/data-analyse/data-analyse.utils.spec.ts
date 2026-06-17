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
