import {
  classifyIntervalStatus,
  computeIntervalStats,
  deriveHfAvailability,
  describeEnrichmentSkip,
  filterConnectedVehicles,
  resolveHfMirrorStatus,
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

  describe('deriveHfAvailability', () => {
    it('HF points present but no waypoints => HF available, snapshot-only false', () => {
      const d = deriveHfAvailability({
        waypointCount: 0,
        hfPointCount24h: 1200,
        hasSubSecondCadence: false,
      });
      expect(d.available).toBe(true);
      expect(d.snapshotOnly).toBe(false);
      expect(d.hasHfPoints).toBe(true);
      expect(d.hasWaypoints).toBe(false);
    });

    it('waypoints present but no HF points => available, waypoints flagged separately', () => {
      const d = deriveHfAvailability({
        waypointCount: 50,
        hfPointCount24h: 0,
        hasSubSecondCadence: false,
      });
      expect(d.available).toBe(true);
      expect(d.snapshotOnly).toBe(false);
      expect(d.hasWaypoints).toBe(true);
      expect(d.hasHfPoints).toBe(false);
    });

    it('only ~30s snapshots (no HF/waypoints, no sub-2s cadence) => snapshot_only', () => {
      const d = deriveHfAvailability({
        waypointCount: 0,
        hfPointCount24h: 0,
        hasSubSecondCadence: false,
      });
      expect(d.available).toBe(false);
      expect(d.snapshotOnly).toBe(true);
    });

    it('sub-2s cadence alone makes the vehicle HF-capable (not snapshot-only)', () => {
      const d = deriveHfAvailability({
        waypointCount: null,
        hfPointCount24h: null,
        hasSubSecondCadence: true,
      });
      expect(d.available).toBe(true);
      expect(d.snapshotOnly).toBe(false);
    });

    describe('aggregated hfAvailabilityStatus', () => {
      it('sub-2s cadence => hf_available', () => {
        expect(
          deriveHfAvailability({
            waypointCount: null,
            hfPointCount24h: null,
            hasSubSecondCadence: true,
          }).status,
        ).toBe('hf_available');
      });

      it('healthy HF-point volume => hf_available', () => {
        expect(
          deriveHfAvailability({
            waypointCount: 0,
            hfPointCount24h: 1200,
            hasSubSecondCadence: false,
          }).status,
        ).toBe('hf_available');
      });

      it('thin HF/waypoint volume below threshold => sparse', () => {
        expect(
          deriveHfAvailability({
            waypointCount: 3,
            hfPointCount24h: 2,
            hasSubSecondCadence: false,
          }).status,
        ).toBe('sparse');
      });

      it('no HF but snapshot samples present => snapshot_only', () => {
        expect(
          deriveHfAvailability({
            waypointCount: 0,
            hfPointCount24h: 0,
            hasSubSecondCadence: false,
            snapshotSampleCount24h: 480,
          }).status,
        ).toBe('snapshot_only');
      });

      it('counts known and all zero, no snapshots => missing', () => {
        expect(
          deriveHfAvailability({
            waypointCount: 0,
            hfPointCount24h: 0,
            hasSubSecondCadence: false,
            snapshotSampleCount24h: 0,
          }).status,
        ).toBe('missing');
      });

      it('nothing queried (all null) => unknown', () => {
        expect(
          deriveHfAvailability({
            waypointCount: null,
            hfPointCount24h: null,
            hasSubSecondCadence: false,
          }).status,
        ).toBe('unknown');
      });
    });
  });

  describe('describeEnrichmentSkip', () => {
    it('maps granular enrichment skip reasons to explanations', () => {
      expect(describeEnrichmentSkip('capability')).toContain('missing DIMO token');
      expect(describeEnrichmentSkip('insufficient_points')).toContain('too sparse');
      expect(describeEnrichmentSkip('no_hf_data')).toContain('not eligible');
    });

    it('falls back to a generic explanation for unknown/legacy values', () => {
      expect(describeEnrichmentSkip(null)).toContain('cloud/snapshot-only');
      expect(describeEnrichmentSkip(undefined)).toContain('cloud/snapshot-only');
      expect(describeEnrichmentSkip('legacy_reason')).toContain('cloud/snapshot-only');
    });
  });

  describe('resolveHfMirrorStatus', () => {
    it('maps env flag to a status', () => {
      expect(resolveHfMirrorStatus('true')).toBe('enabled');
      expect(resolveHfMirrorStatus('false')).toBe('disabled');
      expect(resolveHfMirrorStatus(undefined)).toBe('disabled');
      expect(resolveHfMirrorStatus('')).toBe('disabled');
      expect(resolveHfMirrorStatus('weird')).toBe('unknown');
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
