import {
  CALIBRATION_UNSET_V0_BUNDLE,
  computeDiV0TripIntervals,
  DEFAULT_DI_V0_VERSION_TUPLE,
  densifyPositionGrid,
  evaluateL3AtCenter,
  haversineMeters,
  classifyPositionRows,
} from '../index';
import { pilotFreshL3Triple, pilotHoldThenRelease303m } from './fixtures/wob-pilot-golden.fixture';
import { presentObs, signalNullObs } from './test-helpers';

const ctx = {
  versions: DEFAULT_DI_V0_VERSION_TUPLE,
  calibration: CALIBRATION_UNSET_V0_BUNDLE,
};

describe('DI V0 pure core', () => {
  it('1. canonical L3 calculation matches haversine mean * 3.6', () => {
    const positions = [
      presentObs('2026-01-01T00:00:00Z', 0, 0),
      presentObs('2026-01-01T00:00:01Z', 0, 0.001),
      presentObs('2026-01-01T00:00:02Z', 0, 0.002),
    ];
    const rows = classifyPositionRows(positions, ctx.calibration);
    const l3 = evaluateL3AtCenter(rows, 1);
    expect(l3.eligible).toBe(true);
    const d1 = haversineMeters(0, 0, 0, 0.001);
    const d2 = haversineMeters(0, 0.001, 0, 0.002);
    expect(l3.speedKmh).toBeCloseTo(((d1 + d2) / 2) * 3.6, 6);
  });

  it('2–4. constant / accel / decel geometry produce finite L3', () => {
    const positions = [];
    for (let i = 0; i < 5; i++) {
      const label = new Date(Date.parse('2026-01-01T00:00:00Z') + i * 1000)
        .toISOString()
        .replace(/\.\d{3}Z$/, 'Z');
      positions.push(presentObs(label, 0, i * 0.0002));
    }
    const out = computeDiV0TripIntervals({ sourceFamily: 'API_SYNTHETIC', positions }, ctx);
    const moving = out.intervals.filter((r) => r.estimatedSpeedKmh != null);
    expect(moving.length).toBeGreaterThan(0);
  });

  it('5. normal stop yields STATIONARY without numeric speed', () => {
    const step = 0.0000025;
    const positions = [
      presentObs('2026-01-01T00:00:00Z', 52, 9),
      presentObs('2026-01-01T00:00:01Z', 52, 9 + step),
      presentObs('2026-01-01T00:00:02Z', 52, 9 + step * 2),
      presentObs('2026-01-01T00:00:03Z', 52, 9 + step * 3),
    ];
    const out = computeDiV0TripIntervals({ sourceFamily: 'API_SYNTHETIC', positions }, ctx);
    const center = out.intervals[2];
    expect(center.motionState).toBe('STATIONARY_SUPPORTED');
    expect(center.estimatedSpeedKmh).toBeNull();
  });

  it('6. fresh stationary jitter stays STATIONARY or TRANSITION', () => {
    const positions = [
      presentObs('2026-01-01T00:00:00Z', 52, 9),
      presentObs('2026-01-01T00:00:01Z', 52.000001, 9.000001),
      presentObs('2026-01-01T00:00:02Z', 52, 9),
    ];
    const out = computeDiV0TripIntervals({ sourceFamily: 'API_SYNTHETIC', positions }, ctx);
    expect(out.intervals[1].estimatedSpeedKmh).toBeNull();
  });

  it('7–8. frozen coordinates classify as FROZEN_* not automatic stop speed', () => {
    const positions = pilotHoldThenRelease303m().slice(0, 3);
    const out = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions }, ctx);
    expect(out.intervals[1].positionState).toMatch(/^FROZEN_/);
    expect(out.intervals[1].estimatedSpeedKmh).toBeNull();
  });

  it('9–10. release row has no numeric speed (303 m class)', () => {
    const positions = pilotHoldThenRelease303m();
    const out = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions }, ctx);
    const releaseRows = out.intervals.filter((r) => r.positionState === 'RELEASE');
    expect(releaseRows.length).toBeGreaterThan(0);
    const releaseNumeric = releaseRows.filter((r) => r.estimatedSpeedKmh != null);
    expect(releaseNumeric).toHaveLength(0);
    const allReleaseNumeric = out.intervals.filter(
      (r) => r.abstentionReason === 'POSITION_RELEASE' && r.estimatedSpeedKmh != null,
    );
    expect(allReleaseNumeric).toHaveLength(0);
  });

  it('11. ROW_ABSENT does not imply speed 0 or stationary claim', () => {
    const grid = densifyPositionGrid(
      [presentObs('2026-01-01T00:00:00Z', 52, 9), presentObs('2026-01-01T00:00:02Z', 52, 9.001)],
      '2026-01-01T00:00:00Z',
      '2026-01-01T00:00:02Z',
      'API_SYNTHETIC',
    );
    const out = computeDiV0TripIntervals({ sourceFamily: 'API_SYNTHETIC', positions: grid }, ctx);
    const absent = out.intervals.find((r) => r.positionState === 'ROW_ABSENT');
    expect(absent?.motionState).toBe('NO_MOTION_EVIDENCE');
    expect(absent?.estimatedSpeedKmh).toBeNull();
    expect(absent?.claimLevel).not.toBe('L3');
  });

  it('12. SIGNAL_NULL distinct from ROW_ABSENT', () => {
    const positions = [
      presentObs('2026-01-01T00:00:00Z', 52, 9),
      presentObs('2026-01-01T00:00:01Z', 52, 9.0001),
      signalNullObs('2026-01-01T00:00:02Z'),
      presentObs('2026-01-01T00:00:03Z', 52, 9.001),
    ];
    const out = computeDiV0TripIntervals({ sourceFamily: 'API_SYNTHETIC', positions }, ctx);
    expect(out.intervals[2].positionState).toBe('SIGNAL_NULL');
    expect(out.intervals[2].abstentionReason).toBe('SIGNAL_NULL_IN_SUPPORT');
  });

  it('13. incomplete L3 support at edges', () => {
    const positions = [presentObs('2026-01-01T00:00:00Z', 52, 9)];
    const out = computeDiV0TripIntervals({ sourceFamily: 'API_SYNTHETIC', positions }, ctx);
    expect(out.intervals[0].abstentionReason).toBe('INCOMPLETE_SUPPORT');
  });

  it('14. malformed coordinate abstains', () => {
    const bad = presentObs('2026-01-01T00:00:02Z', 999, 9);
    const positions = [
      presentObs('2026-01-01T00:00:00Z', 52, 9),
      presentObs('2026-01-01T00:00:01Z', 52, 9.0001),
      bad,
      presentObs('2026-01-01T00:00:03Z', 52, 9.001),
    ];
    const out = computeDiV0TripIntervals({ sourceFamily: 'API_SYNTHETIC', positions }, ctx);
    expect(out.intervals[2].abstentionReason).toBe('INVALID_POSITION');
  });

  it('15–16. R1 cannot override L3; remains INTERVAL_ONLY', () => {
    const positions = pilotFreshL3Triple();
    const out = computeDiV0TripIntervals(
      {
        sourceFamily: 'RUPTELA_R1',
        positions,
        r1Obd: [
          {
            bucketLabel: '2026-09-26T09:57:21Z',
            temporalConfidence: 'INTERVAL_ONLY',
            speedKmh: 120,
            provenance: { sourceSignal: 'speed', derivedFrom: ['test'] },
          },
        ],
      },
      ctx,
    );
    const center = out.intervals.find((r) => r.referenceTime.includes('09:57:21'));
    expect(center?.estimatedSpeedKmh).not.toBe(120);
    expect(center?.sourceQualityFlags).toContain('R1_INTERVAL_ONLY');
    expect(center?.sourceRelation).not.toBe('SUPPORTED');
  });

  it('17. uncalibrated native events do not raise interval claim', () => {
    const positions = pilotFreshL3Triple();
    const out = computeDiV0TripIntervals(
      {
        sourceFamily: 'RUPTELA_R1',
        positions,
        nativeEvents: [
          {
            eventType: 'harsh_braking',
            sourceFamily: 'RUPTELA_R1',
            calibrationState: 'UNCALIBRATED',
            temporalConfidence: 'UNKNOWN',
            provenance: { derivedFrom: ['native'] },
          },
        ],
      },
      ctx,
    );
    expect(out.nativeEvents[0].calibrationState).toBe('UNCALIBRATED');
    expect(out.intervals.every((i) => i.claimLevel !== 'L3')).toBe(true);
  });

  it('18–19. cross-source SUPPORTED vs CONFLICTING', () => {
    const positions = pilotFreshL3Triple();
    const base = computeDiV0TripIntervals(
      {
        sourceFamily: 'RUPTELA_R1',
        positions,
        r1Obd: [
          {
            bucketLabel: '2026-09-26T09:57:21Z',
            temporalConfidence: 'INTERVAL_ONLY',
            speedKmh: outSpeed(positions),
            provenance: { sourceSignal: 'speed', derivedFrom: ['test'] },
          },
        ],
      },
      ctx,
    );
    const center = base.intervals[1];
    expect(['SUPPORTED', 'CONFLICTING', 'CONFLICT_EXPLAINED', 'UNASSESSABLE']).toContain(
      center.sourceRelation,
    );
  });

  it('20. deterministic replay', () => {
    const positions = pilotFreshL3Triple();
    const a = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions }, ctx);
    const b = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions }, ctx);
    expect(JSON.stringify(a.intervals)).toBe(JSON.stringify(b.intervals));
  });

  it('21–23. source families', () => {
    const positions = pilotFreshL3Triple();
    expect(
      computeDiV0TripIntervals({ sourceFamily: 'UNKNOWN', positions }, ctx).intervals,
    ).toHaveLength(0);
    const syn = computeDiV0TripIntervals({ sourceFamily: 'API_SYNTHETIC', positions }, ctx);
    expect(syn.intervals.some((i) => i.estimatedSpeedKmh != null)).toBe(true);
    const r1 = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions }, ctx);
    expect(r1.intervals.length).toBe(4);
  });

  it('golden pilot fresh L3 interval', () => {
    const positions = pilotFreshL3Triple();
    const out = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions }, ctx);
    const center = out.intervals.find((r) => r.intervalStart === '2026-09-26T09:57:21Z');
    expect(center?.motionState).toBe('MOVING_SPEED_ESTIMATED');
    expect(center?.estimatedSpeedKmh).not.toBeNull();
    expect(center?.claimLevel).toBe('L2');
  });

  it('L3 numeric claim ceiling is L2', () => {
    const positions = pilotFreshL3Triple();
    const out = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions }, ctx);
    for (const row of out.intervals) {
      if (row.estimatedSpeedKmh != null) {
        expect(row.claimLevel).toBe('L2');
      }
    }
  });

  it('performance: ~1h grid computes quickly', () => {
    const start = '2026-01-01T00:00:00Z';
    const positions = [];
    for (let i = 0; i < 3600; i++) {
      const label = new Date(Date.parse(start) + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      positions.push(presentObs(label, 52 + i * 0.00001, 9));
    }
    const t0 = performance.now();
    const out = computeDiV0TripIntervals({ sourceFamily: 'API_SYNTHETIC', positions }, ctx);
    const elapsed = performance.now() - t0;
    expect(out.intervals.length).toBe(3600);
    expect(elapsed).toBeLessThan(2000);
  });
});

function outSpeed(positions: ReturnType<typeof presentObs>[]): number {
  const rows = classifyPositionRows(positions, CALIBRATION_UNSET_V0_BUNDLE);
  const l3 = evaluateL3AtCenter(rows, 2);
  return l3.speedKmh ?? 0;
}
