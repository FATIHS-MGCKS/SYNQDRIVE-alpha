import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeC4AdaptiveL3,
  withImplausibleLegEndpointsQuarantined,
  detectMotionManoeuvreEvents,
  extractMotionFsmStopEpisodes,
  MOTION_CORE_EVENT_GUARDS_V0_1_DEV,
  MOTION_EVENT_V0_2_CANDIDATE_OPTIONS,
  MOTION_FSM_PARAMS_V0_2_DEV,
  MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
  runMotionFsm,
  type MotionCorePositionBucket,
} from '../index';

const FIXTURES = join(__dirname, 'fixtures');

function loadGrid(name: string): MotionCorePositionBucket[] {
  const raw = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as
    | MotionCorePositionBucket[]
    | { buckets: MotionCorePositionBucket[] };
  if (Array.isArray(raw)) {
    return raw;
  }
  return raw.buckets.map((b) => ({
    bucketLabelUtc: b.bucketLabelUtc ?? (b as { bucketLabel?: string }).bucketLabel!,
    availability: b.availability,
    latitude: b.latitude ?? null,
    longitude: b.longitude ?? null,
  }));
}

function eventsOf(c4: ReturnType<typeof computeC4AdaptiveL3>) {
  return detectMotionManoeuvreEvents(
    0,
    c4,
    'C4_ADAPTIVE_L3',
    MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
    MOTION_EVENT_V0_2_CANDIDATE_OPTIONS,
  );
}

describe('motion core Tiguan GPS leg gate + OBD point authority', () => {
  const grid22 = loadGrid('tiguan-20261022-position-grid.json');

  it('fixes persisted production absurd C4 at jump second (was ~1930 km/h OK)', () => {
    const persistedSpeedKmh = 1930.8268990688694;
    const kin = withImplausibleLegEndpointsQuarantined(grid22);
    const fixed = computeC4AdaptiveL3(kin).find((s) => s.label === '2026-10-22T18:49:18Z');
    expect(persistedSpeedKmh).toBeGreaterThan(500);
    expect(fixed?.valueKmh).toBeNull();
  });

  it('rejects implausible GPS jump speeds at 2026-10-22T18:49:18Z (no numeric C4)', () => {
    const kin = withImplausibleLegEndpointsQuarantined(grid22);
    const c4 = computeC4AdaptiveL3(kin);
    const jump = c4.find((s) => s.label === '2026-10-22T18:49:18Z');
    expect(jump).toBeDefined();
    expect(jump!.valueKmh).toBeNull();
    expect(['OUTLIER_REJECTED', 'NO_POSITION']).toContain(jump!.quality);
  });

  it('drops false ACCELERATION event across 18:49:12–18:49:18Z window', () => {
    const kin = withImplausibleLegEndpointsQuarantined(grid22);
    const c4 = computeC4AdaptiveL3(kin);
    const events = eventsOf(c4);
    const falseAccel = events.some(
      (e) =>
        e.kind === 'ACCELERATION' &&
        e.startLabel <= '2026-10-22T18:49:24Z' &&
        e.endLabel >= '2026-10-22T18:49:12Z',
    );
    expect(falseAccel).toBe(false);
    expect(events).toHaveLength(20);
  });

  it('preserves stop episode count on full 22 Oct grid (GPS leg gate only)', () => {
    const kin = withImplausibleLegEndpointsQuarantined(grid22);
    const c4 = computeC4AdaptiveL3(kin);
    const fsm = runMotionFsm(
      kin,
      c4,
      'RETROSPECTIVE',
      null,
      MOTION_FSM_PARAMS_V0_2_DEV,
      MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
    );
    const stops = extractMotionFsmStopEpisodes(0, fsm, 'RETROSPECTIVE');
    expect(stops.length).toBeGreaterThanOrEqual(11);
    expect(stops.length).toBeLessThanOrEqual(12);
  });

  it('does not promote STARTING from unbelegte OBD at 18:47:58Z when sparse lacks point authority', () => {
    const kin = withImplausibleLegEndpointsQuarantined(grid22);
    const c4 = computeC4AdaptiveL3(kin);
    const sparse = [
      {
        label: '2026-10-22T18:47:58Z',
        speedKmh: 84,
        fsmPointAuthority: false,
      },
    ];
    const fsm = runMotionFsm(
      kin,
      c4,
      'RETROSPECTIVE',
      sparse,
      MOTION_FSM_PARAMS_V0_2_DEV,
      MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
    );
    const row = fsm.find((l) => l.label === '2026-10-22T18:47:58Z');
    expect(row).toBeDefined();
    expect(row!.state).not.toBe('STARTING');
    expect(row!.flags).toContain('SPARSE_AGGREGATION_LABEL_NOT_POINT_AUTHORITY');
  });

  it('still allows DIRECT moving when sparse has measurement time authority', () => {
    const buckets: MotionCorePositionBucket[] = [
      {
        bucketLabelUtc: '2026-01-01T10:00:00Z',
        availability: 'PRESENT',
        latitude: 52.0,
        longitude: 9.0,
      },
      {
        bucketLabelUtc: '2026-01-01T10:00:01Z',
        availability: 'PRESENT',
        latitude: 52.0,
        longitude: 9.001,
      },
      {
        bucketLabelUtc: '2026-01-01T10:00:02Z',
        availability: 'PRESENT',
        latitude: 52.0,
        longitude: 9.002,
      },
    ];
    const c4 = computeC4AdaptiveL3(buckets);
    const fsm = runMotionFsm(
      buckets,
      c4,
      'RETROSPECTIVE',
      [{ label: '2026-01-01T10:00:01Z', speedKmh: 40, fsmPointAuthority: true }],
      MOTION_FSM_PARAMS_V0_2_DEV,
      MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
    );
    const row = fsm.find((l) => l.label === '2026-01-01T10:00:01Z');
    expect(row?.state).toBe('MOVING');
    expect(row?.evidenceQuality).toBe('DIRECT');
  });

  it('leaves older Tiguan 2026-10-19 C4 unchanged vs pre-gate baseline on that grid', () => {
    const grid19 = loadGrid('tiguan-20261019-position-grid.json');
    const c4 = computeC4AdaptiveL3(grid19);
    const numeric = c4.filter((s) => s.valueKmh != null).length;
    expect(numeric).toBeGreaterThan(100);
    expect(c4.every((s) => !s.flags.includes('IMPLAUSIBLE_1S_LEG_ENDPOINT_UNCERTAIN'))).toBe(true);
  });
});
