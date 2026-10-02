import {
  CALIBRATION_UNSET_V0_BUNDLE,
  computeDiV0TripIntervals,
  DEFAULT_DI_V0_VERSION_TUPLE,
  evaluateL3AtCenter,
  classifyPositionRows,
  maxClaimForUncalibratedNative,
} from '../index';
import { pilotFreshL3Triple, pilotHoldThenRelease303m } from './fixtures/wob-pilot-golden.fixture';
import { presentObs, signalNullObs } from './test-helpers';
import type { NormalizedPositionObservation } from '../types';

const ctx = {
  versions: DEFAULT_DI_V0_VERSION_TUPLE,
  calibration: CALIBRATION_UNSET_V0_BUNDLE,
};

function labelAt(baseIso: string, offsetSeconds: number): string {
  return new Date(Date.parse(baseIso) + offsetSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function assertNoNumericL3(out: ReturnType<typeof computeDiV0TripIntervals>): void {
  const numeric = out.intervals.filter((r) => r.estimatedSpeedKmh != null);
  expect(numeric).toHaveLength(0);
}

function assertAllNumericFinite(out: ReturnType<typeof computeDiV0TripIntervals>): void {
  for (const row of out.intervals) {
    if (row.estimatedSpeedKmh != null) {
      expect(Number.isFinite(row.estimatedSpeedKmh)).toBe(true);
    }
  }
}

describe('DI V0 C1D.5B closure — malformed input fail-safe', () => {
  const base = '2026-01-01T10:00:00Z';

  const malformedCases: { name: string; positions: NormalizedPositionObservation[] }[] = [
    {
      name: 'NaN latitude',
      positions: [
        presentObs(labelAt(base, 0), 52, 9),
        presentObs(labelAt(base, 1), 52, 9.0001),
        presentObs(labelAt(base, 2), Number.NaN, 9),
        presentObs(labelAt(base, 3), 52, 9.0003),
      ],
    },
    {
      name: 'NaN longitude',
      positions: [
        presentObs(labelAt(base, 0), 52, 9),
        presentObs(labelAt(base, 1), 52, 9.0001),
        presentObs(labelAt(base, 2), 52, Number.NaN),
        presentObs(labelAt(base, 3), 52, 9.0003),
      ],
    },
    {
      name: 'Infinity latitude',
      positions: [
        presentObs(labelAt(base, 0), 52, 9),
        presentObs(labelAt(base, 1), 52, 9.0001),
        presentObs(labelAt(base, 2), Infinity, 9),
        presentObs(labelAt(base, 3), 52, 9.0003),
      ],
    },
    {
      name: 'lat > 90',
      positions: [
        presentObs(labelAt(base, 0), 52, 9),
        presentObs(labelAt(base, 1), 52, 9.0001),
        presentObs(labelAt(base, 2), 91, 9),
        presentObs(labelAt(base, 3), 52, 9.0003),
      ],
    },
    {
      name: 'lon > 180',
      positions: [
        presentObs(labelAt(base, 0), 52, 9),
        presentObs(labelAt(base, 1), 52, 9.0001),
        presentObs(labelAt(base, 2), 52, 181),
        presentObs(labelAt(base, 3), 52, 9.0003),
      ],
    },
    {
      name: 'missing latitude',
      positions: [
        presentObs(labelAt(base, 0), 52, 9),
        presentObs(labelAt(base, 1), 52, 9.0001),
        { ...presentObs(labelAt(base, 2), 52, 9.0002), latitude: undefined },
        presentObs(labelAt(base, 3), 52, 9.0003),
      ],
    },
    {
      name: 'empty input',
      positions: [],
    },
    {
      name: 'single observation',
      positions: [presentObs(labelAt(base, 0), 52, 9)],
    },
    {
      name: 'two observations',
      positions: [presentObs(labelAt(base, 0), 52, 9), presentObs(labelAt(base, 1), 52, 9.0001)],
    },
  ];

  it.each(malformedCases)('$name: no numeric speed at invalid support center', ({ positions }) => {
    const out = computeDiV0TripIntervals({ sourceFamily: 'API_SYNTHETIC', positions }, ctx);
    assertAllNumericFinite(out);
    const invalidCenter = out.intervals.find(
      (r) =>
        r.abstentionReason === 'INVALID_POSITION' ||
        r.abstentionReason === 'INCOMPLETE_SUPPORT' ||
        r.abstentionReason === 'TEMPORAL_SEMANTICS_INSUFFICIENT',
    );
    if (positions.length >= 3) {
      expect(out.intervals.some((r) => r.estimatedSpeedKmh == null)).toBe(true);
    }
    if (positions.length === 0) {
      expect(out.intervals).toHaveLength(0);
    }
    expect(invalidCenter != null || positions.length < 3).toBe(true);
  });

  it('duplicate bucketLabel left/center: DUPLICATE_BUCKET_LABEL_NUMERIC_L3=0', () => {
    const t0 = '2026-01-01T10:00:00Z';
    const t1 = '2026-01-01T10:00:01Z';
    const positions = [
      presentObs(t0, 52, 9),
      presentObs(t1, 52, 9.5),
      presentObs(t1, 52, 9.0001),
      presentObs('2026-01-01T10:00:02Z', 52, 9.0002),
    ];
    const out = computeDiV0TripIntervals({ sourceFamily: 'API_SYNTHETIC', positions }, ctx);
    assertNoNumericL3(out);
    assertAllNumericFinite(out);
  });

  it('duplicate bucketLabel permutations produce no numeric L3', () => {
    const permutations = [
      [
        presentObs('2026-01-01T10:00:00Z', 52, 9),
        presentObs('2026-01-01T10:00:01Z', 52, 9.0001),
        presentObs('2026-01-01T10:00:01Z', 52, 9.5),
        presentObs('2026-01-01T10:00:02Z', 52, 9.0002),
      ],
      [
        presentObs('2026-01-01T10:00:00Z', 52, 9),
        presentObs('2026-01-01T10:00:00Z', 52, 9.5),
        presentObs('2026-01-01T10:00:01Z', 52, 9.0001),
        presentObs('2026-01-01T10:00:02Z', 52, 9.0002),
      ],
    ];
    for (const positions of permutations) {
      const out = computeDiV0TripIntervals({ sourceFamily: 'API_SYNTHETIC', positions }, ctx);
      assertNoNumericL3(out);
    }
  });
});

describe('DI V0 C1D.5B closure — irregular temporal spacing (calendar ±1s, else abstain)', () => {
  const base = '2026-01-01T00:00:00Z';

  it('1s/1s/1s spacing allows L3 when FRESH', () => {
    const positions = [0, 1, 2, 3].map((s) => presentObs(labelAt(base, s), 52, 9 + s * 0.0001));
    const out = computeDiV0TripIntervals({ sourceFamily: 'API_SYNTHETIC', positions }, ctx);
    expect(out.intervals.some((r) => r.estimatedSpeedKmh != null)).toBe(true);
  });

  it('2s/2s grid abstains (missing calendar support labels)', () => {
    const positions = [
      presentObs(labelAt(base, 0), 52, 9),
      presentObs(labelAt(base, 2), 52, 9.0002),
      presentObs(labelAt(base, 4), 52, 9.0004),
    ];
    const rows = classifyPositionRows(positions, ctx.calibration);
    for (let i = 0; i < rows.length; i++) {
      const l3 = evaluateL3AtCenter(rows, i);
      expect(l3.eligible).toBe(false);
      expect(l3.speedKmh).toBeNull();
    }
  });

  it('1s then 2s gap to center abstains at misaligned center', () => {
    const positions = [
      presentObs(labelAt(base, 0), 52, 9),
      presentObs(labelAt(base, 1), 52, 9.0001),
      presentObs(labelAt(base, 3), 52, 9.0003),
    ];
    const out = computeDiV0TripIntervals({ sourceFamily: 'API_SYNTHETIC', positions }, ctx);
    const center = out.intervals.find((r) => r.referenceTime.includes('00:00:01'));
    expect(center?.estimatedSpeedKmh).toBeNull();
    const at3 = out.intervals.find((r) => r.intervalStart === labelAt(base, 3));
    expect(at3?.estimatedSpeedKmh).toBeNull();
  });

  it('sub-second labels abstain when calendar ±1s support missing', () => {
    const positions = [
      presentObs('2026-01-01T00:00:00.000Z', 52, 9),
      presentObs('2026-01-01T00:00:00.500Z', 52, 9.00005),
      presentObs('2026-01-01T00:00:02.000Z', 52, 9.0002),
    ];
    const out = computeDiV0TripIntervals({ sourceFamily: 'API_SYNTHETIC', positions }, ctx);
    assertNoNumericL3(out);
  });
});

describe('DI V0 C1D.5B closure — post-release L3 resume', () => {
  function buildPostReleaseSequence(holdSeconds: number, releaseDisplacementM: number) {
    const lat = 51.3353783;
    const lon = 9.506005;
    const rows: ReturnType<typeof presentObs>[] = [];
    for (let s = 0; s < holdSeconds; s++) {
      rows.push(presentObs(labelAt('2026-01-01T10:00:00Z', s), lat, lon));
    }
    const releaseLat = lat + releaseDisplacementM / 111_320;
    rows.push(presentObs(labelAt('2026-01-01T10:00:00Z', holdSeconds), releaseLat, lon));
    for (let s = 1; s <= 4; s++) {
      rows.push(
        presentObs(labelAt('2026-01-01T10:00:00Z', holdSeconds + s), releaseLat + s * 0.00005, lon),
      );
    }
    return rows;
  }

  it('short hold: no L3 on hold/release; resume only with full FRESH support', () => {
    const positions = buildPostReleaseSequence(3, 35);
    const out = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions }, ctx);
    const releaseNumeric = out.intervals.filter(
      (r) => r.positionState === 'RELEASE' && r.estimatedSpeedKmh != null,
    );
    expect(releaseNumeric).toHaveLength(0);
    const frozenNumeric = out.intervals.filter(
      (r) => r.positionState.startsWith('FROZEN') && r.estimatedSpeedKmh != null,
    );
    expect(frozenNumeric).toHaveLength(0);
    const premature = out.intervals.filter(
      (r) =>
        r.estimatedSpeedKmh != null &&
        (r.sourceQualityFlags.includes('L3_SUPPORT_CROSSES_RELEASE') ||
          r.sourceQualityFlags.includes('L3_SUPPORT_CROSSES_HOLD') ||
          r.abstentionReason === 'POSITION_RELEASE'),
    );
    expect(premature).toHaveLength(0);
    const postFreshNumeric = out.intervals.filter(
      (r) => r.positionState === 'FRESH' && r.estimatedSpeedKmh != null,
    );
    expect(postFreshNumeric.length).toBeGreaterThan(0);
  });

  it('long hold / 303m release: RELEASE_JUMP_NUMERIC_SPEED_COUNT=0 and valid resume', () => {
    const positions = pilotHoldThenRelease303m();
    const releaseLat = 51.3353783 + 303 / 111_320;
    const extended = [
      ...positions,
      presentObs('2026-01-01T10:00:08Z', releaseLat + 0.00015, 9.506005),
      presentObs('2026-01-01T10:00:09Z', releaseLat + 0.0002, 9.506005),
      presentObs('2026-01-01T10:00:10Z', releaseLat + 0.00025, 9.506005),
    ];
    const out = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions: extended }, ctx);
    expect(
      out.intervals.filter((r) => r.positionState === 'RELEASE' && r.estimatedSpeedKmh != null),
    ).toHaveLength(0);
    const resume = out.intervals.filter((r) => r.estimatedSpeedKmh != null && r.positionState === 'FRESH');
    expect(resume.length).toBeGreaterThan(0);
  });
});

describe('DI V0 C1D.5B closure — golden pilot regression', () => {
  it('fresh L3, hold, release, R1 unchanged', () => {
    const fresh = computeDiV0TripIntervals(
      { sourceFamily: 'RUPTELA_R1', positions: pilotFreshL3Triple() },
      ctx,
    );
    const center = fresh.intervals.find((r) => r.intervalStart === '2026-09-26T09:57:21Z');
    expect(center?.motionState).toBe('MOVING_SPEED_ESTIMATED');
    expect(center?.claimLevel).toBe('L2');

    const hold = computeDiV0TripIntervals(
      { sourceFamily: 'RUPTELA_R1', positions: pilotHoldThenRelease303m() },
      ctx,
    );
    expect(hold.intervals.filter((r) => r.positionState === 'RELEASE' && r.estimatedSpeedKmh != null)).toHaveLength(
      0,
    );
  });
});

describe('DI V0 C1D.5B closure — authority regression', () => {
  it('deterministic replay 100×', () => {
    const positions = pilotFreshL3Triple();
    const first = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions }, ctx);
    const baseline = JSON.stringify(first);
    for (let i = 0; i < 100; i++) {
      const shuffled = [...positions].sort(() => (i % 2 === 0 ? 1 : -1));
      const out = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions: shuffled }, ctx);
      expect(JSON.stringify(out)).toBe(baseline);
    }
  });

  it('native calibration ceilings (frozen helpers)', () => {
    expect(maxClaimForUncalibratedNative('UNCALIBRATED')).toBe('L1');
    expect(maxClaimForUncalibratedNative('PILOT_SUPPORTED')).toBe('L1');
    expect(maxClaimForUncalibratedNative('VALIDATED')).toBe('L2');
  });

  it('claim monotonicity under conflicting R1', () => {
    const positions = pilotFreshL3Triple();
    const alone = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions }, ctx);
    const conflict = computeDiV0TripIntervals(
      {
        sourceFamily: 'RUPTELA_R1',
        positions,
        r1Obd: [
          {
            bucketLabel: '2026-09-26T09:57:21Z',
            temporalConfidence: 'INTERVAL_ONLY',
            speedKmh: 5,
            provenance: { sourceSignal: 'speed', derivedFrom: ['test'] },
          },
        ],
      },
      ctx,
    );
    const c1 = alone.intervals.find((r) => r.intervalStart === '2026-09-26T09:57:21Z')!;
    const c2 = conflict.intervals.find((r) => r.intervalStart === '2026-09-26T09:57:21Z')!;
    const order = { L0: 0, L1: 1, L2: 2, L3: 3 };
    const vc = { UNAVAILABLE: 0, LOW: 1, MODERATE: 2, HIGH: 3 };
    expect(order[c2.claimLevel]).toBeLessThanOrEqual(order[c1.claimLevel]);
    expect(vc[c2.valueConfidence]).toBeLessThanOrEqual(vc[c1.valueConfidence]);
  });
});
