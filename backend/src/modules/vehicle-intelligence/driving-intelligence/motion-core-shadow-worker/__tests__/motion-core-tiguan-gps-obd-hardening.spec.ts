import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseDiV0S4EvidenceContainer } from '../../s4a-foundation/di-v0-s4a-evidence-container-parse';
import { adaptMotionCoreShadowEvidenceFromParsedContainer } from '../di-v0-motion-core-shadow-evidence.adapter';
import { processDiV0MotionCoreShadowFromEvidenceAdaptation } from '../di-v0-motion-core-shadow-processor';
import {
  computeC4AdaptiveL3,
  withImplausibleLegEndpointsQuarantined,
  detectMotionManoeuvreEvents,
  extractMotionFsmStopEpisodes,
  MOTION_CORE_EVENT_GUARDS_V0_1_DEV,
  MOTION_EVENT_V0_2_CANDIDATE_OPTIONS,
  MOTION_FSM_PARAMS_V0_2_DEV,
  MOTION_FSM_FROZEN_LEGACY_SPARSE_OPTIONS,
  MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
  runMotionFsm,
  type MotionCorePositionBucket,
  type MotionFsmStopEpisode,
  type SparseVehicleSpeedSample,
} from '../../core/index';

const FIXTURES = join(__dirname, '../../core/__tests__/fixtures');
const REPO_ROOT = join(__dirname, '../../../../../../..');
const TIGUAN_EVIDENCE_BIN = join(
  REPO_ROOT,
  'research/driving-intelligence/audits/ds4-motion-tiguan-20261022-compact/DS4_Motion_Tiguan_CURSOR_COMPACT/evaluation/snapshots/di_v0_s4_evidence_container.bin',
);
const TIGUAN_VIDEO_REF_CSV = join(
  REPO_ROOT,
  'research/driving-intelligence/audits/ds4-motion-tiguan-20261022-compact/DS4_Motion_Tiguan_CURSOR_COMPACT/evaluation/reference/TIGUAN_2026-10-22_1Hz.csv',
);

function loadVideoSpeedDisplayKmhByUtc(): Map<string, number> {
  if (!existsSync(TIGUAN_VIDEO_REF_CSV)) {
    throw new Error(`Required video reference CSV missing: ${TIGUAN_VIDEO_REF_CSV}`);
  }
  const lines = readFileSync(TIGUAN_VIDEO_REF_CSV, 'utf8').trim().split('\n');
  const header = lines[0]!.split(',');
  const utcIdx = header.indexOf('time_utc_estimated');
  const speedIdx = header.indexOf('speed_display_kmh');
  const map = new Map<string, number>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',');
    const utc = cols[utcIdx];
    const speed = Number(cols[speedIdx]);
    if (utc && Number.isFinite(speed)) {
      map.set(utc, speed);
    }
  }
  return map;
}

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

type Variant = 'baseline' | 'gps_only' | 'obd_only' | 'combined';

function replayTiguan22(
  grid: MotionCorePositionBucket[],
  sparse: SparseVehicleSpeedSample[] | null,
  variant: Variant,
) {
  const legGate = variant === 'gps_only' || variant === 'combined';
  const kin = legGate ? withImplausibleLegEndpointsQuarantined(grid) : grid;
  const c4 = computeC4AdaptiveL3(grid, { enabled: legGate });
  let sparseArg: SparseVehicleSpeedSample[] | null = null;
  if (sparse != null && sparse.length > 0) {
    const legacySparse = sparse.map((s) => ({ label: s.label, speedKmh: s.speedKmh }));
    if (variant === 'baseline' || variant === 'gps_only') {
      sparseArg = legacySparse;
    } else {
      sparseArg = sparse;
    }
  }
  const fsmOptions =
    variant === 'baseline' || variant === 'gps_only'
      ? MOTION_FSM_FROZEN_LEGACY_SPARSE_OPTIONS
      : MOTION_FSM_V0_3_CANDIDATE_OPTIONS;
  const fsm = runMotionFsm(
    kin,
    c4,
    'RETROSPECTIVE',
    sparseArg,
    MOTION_FSM_PARAMS_V0_2_DEV,
    fsmOptions,
  );
  const stops = extractMotionFsmStopEpisodes(0, fsm, 'RETROSPECTIVE');
  const events = eventsOf(c4);
  return { c4, fsm, stops, events };
}

function stopTimeEvidenceSignature(stops: MotionFsmStopEpisode[]): string {
  return JSON.stringify(
    stops.map((s) => ({
      start: s.startLatest,
      end: s.endEarliest,
      observedMinDurationS: s.observedMinDurationS,
      firstStationarySource: s.firstStationarySource,
      lastEvidenceLabel: s.lastEvidenceLabel,
    })),
  );
}

function fsmStateSignature(fsm: ReturnType<typeof runMotionFsm>): string {
  return fsm.map((l) => `${l.label}:${l.state}`).join('|');
}

describe('motion core Tiguan GPS leg gate + OBD point authority (shadow adapter)', () => {
  const grid22 = loadGrid('tiguan-20261022-position-grid.json');
  let sparse22: SparseVehicleSpeedSample[];

  beforeAll(() => {
    if (!existsSync(TIGUAN_EVIDENCE_BIN)) {
      throw new Error(`Required Tiguan evidence fixture missing: ${TIGUAN_EVIDENCE_BIN}`);
    }
    const raw = readFileSync(TIGUAN_EVIDENCE_BIN, 'utf8');
    const parsed = parseDiV0S4EvidenceContainer(raw);
    const adapted = adaptMotionCoreShadowEvidenceFromParsedContainer(parsed, 'RUPTELA_R1');
    sparse22 = adapted.sparseSpeed;
    if (sparse22.length === 0) {
      throw new Error('Tiguan evidence bin produced empty sparse speed channel');
    }
  });

  it('fixes persisted production absurd C4 at jump second (was ~1930 km/h OK)', () => {
    const persistedSpeedKmh = 1930.8268990688694;
    const fixed = computeC4AdaptiveL3(grid22, { enabled: true }).find(
      (s) => s.label === '2026-10-22T18:49:18Z',
    );
    expect(persistedSpeedKmh).toBeGreaterThan(500);
    expect(fixed?.valueKmh).toBeNull();
    expect(fixed?.quality).toBe('OUTLIER_REJECTED');
    expect(fixed?.flags).toContain('IMPLAUSIBLE_1S_LEG_ENDPOINT_UNCERTAIN');
  });

  it('drops false ACCELERATION event across 18:49:12–18:49:18Z window (processor path)', () => {
    withImplausibleLegEndpointsQuarantined(grid22);
    const c4 = computeC4AdaptiveL3(grid22, { enabled: true });
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

  it('frozen true baseline without leg gate matches dea2555bb Tiguan 22 Oct (21 events, 1916 C4)', () => {
    const c4 = computeC4AdaptiveL3(grid22, { enabled: false });
    expect(eventsOf(c4)).toHaveLength(21);
    expect(c4.filter((s) => s.valueKmh != null)).toHaveLength(1916);
  });

  it('combined hardened path: 20 events and 1908 numeric C4 (jump quarantine, no false 18:49 ACCEL)', () => {
    const combined = replayTiguan22(grid22, sparse22, 'combined');
    expect(combined.events).toHaveLength(20);
    expect(combined.c4.filter((s) => s.valueKmh != null)).toHaveLength(1908);
    expect(combined.stops).toHaveLength(11);
  });

  it('stop episode counts per variant on full 22 Oct grid', () => {
    expect(sparse22.every((s) => s.fsmPointAuthority === false)).toBe(true);
    const baseline = replayTiguan22(grid22, sparse22, 'baseline');
    const gpsOnly = replayTiguan22(grid22, sparse22, 'gps_only');
    const obdOnly = replayTiguan22(grid22, sparse22, 'obd_only');
    const combined = replayTiguan22(grid22, sparse22, 'combined');
    expect(baseline.stops).toHaveLength(12);
    expect(gpsOnly.stops).toHaveLength(12);
    expect(obdOnly.stops).toHaveLength(11);
    expect(combined.stops).toHaveLength(11);
  });

  it('combined: excluded OBD (no point authority) matches removed OBD for FSM and stop time evidence', () => {
    const withObd = replayTiguan22(grid22, sparse22, 'combined');
    const kin = withImplausibleLegEndpointsQuarantined(grid22);
    const c4 = computeC4AdaptiveL3(grid22, { enabled: true });
    const withoutObd = runMotionFsm(
      kin,
      c4,
      'RETROSPECTIVE',
      null,
      MOTION_FSM_PARAMS_V0_2_DEV,
      MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
    );
    const stopsWithout = extractMotionFsmStopEpisodes(0, withoutObd, 'RETROSPECTIVE');
    expect(fsmStateSignature(withObd.fsm)).toBe(fsmStateSignature(withoutObd));
    expect(stopTimeEvidenceSignature(withObd.stops)).toBe(stopTimeEvidenceSignature(stopsWithout));
  });

  it('documents six STATIONARY creep seconds with video display reference (separate from OBD)', () => {
    const videoKmh = loadVideoSpeedDisplayKmhByUtc();
    const { fsm, c4 } = replayTiguan22(grid22, sparse22, 'combined');
    const creepSeconds: Array<{ label: string; videoDisplayKmh: number }> = [
      { label: '2026-10-22T18:44:07Z', videoDisplayKmh: 4 },
      { label: '2026-10-22T18:44:08Z', videoDisplayKmh: 5 },
      { label: '2026-10-22T18:44:09Z', videoDisplayKmh: 2 },
      { label: '2026-10-22T18:58:52Z', videoDisplayKmh: 1 },
      { label: '2026-10-22T19:00:04Z', videoDisplayKmh: 1 },
      { label: '2026-10-22T19:02:57Z', videoDisplayKmh: 1 },
    ];
    for (const { label, videoDisplayKmh } of creepSeconds) {
      const row = fsm.find((l) => l.label === label);
      const obdRow = sparse22.find((s) => s.label === label);
      const c4Row = c4.find((s) => s.label === label);
      expect(row?.state).toBe('STATIONARY');
      expect(videoKmh.get(label)).toBe(videoDisplayKmh);
      expect(row?.sparseFsmPointAuthority).toBe(false);
      expect(c4Row).toBeDefined();
      expect(row?.evidenceQuality).toBeDefined();
      expect(row?.reason).toBeDefined();
    }
  });

  it('adapter path: pinned Tiguan R1 has no FSM point authority', () => {
    const raw = readFileSync(TIGUAN_EVIDENCE_BIN, 'utf8');
    const parsed = parseDiV0S4EvidenceContainer(raw);
    const adapted = adaptMotionCoreShadowEvidenceFromParsedContainer(parsed, 'RUPTELA_R1');
    expect(adapted.sparseSpeed.length).toBe(560);
    expect(adapted.sparsePersisted.every((s) => s.measurementTimeUtc == null)).toBe(true);
    expect(adapted.sparseSpeed.every((s) => s.fsmPointAuthority === false)).toBe(true);
    expect(adapted.limitations).toContain('SPARSE_R1_BUCKET_ONLY_NO_FSM_POINT_AUTHORITY');
  });

  it('real processor path on pinned evidence (combined leg gate + sparse without point authority)', () => {
    const raw = readFileSync(TIGUAN_EVIDENCE_BIN, 'utf8');
    const parsed = parseDiV0S4EvidenceContainer(raw);
    const adapted = adaptMotionCoreShadowEvidenceFromParsedContainer(parsed, 'RUPTELA_R1');
    const out = processDiV0MotionCoreShadowFromEvidenceAdaptation(adapted, {
      pinnedSnapshotHash: 'tiguan-20261022-hardening',
      combinedInputIdentity: 'motion-core-tiguan-gps-obd-hardening.spec',
    });
    expect(out.payload.contract.algorithmVersions.bundle).toContain('LEG_GATE_OBD_POINT_AUTH_V4');
    expect(out.payload.summary.eventAcceptedCount).toBe(20);
    expect(out.payload.summary.stopEpisodeCount).toBe(11);
    const jump = out.payload.speeds.find((s) => s.bucketLabelUtc === '2026-10-22T18:49:18Z');
    expect(jump?.speedKmh).toBeNull();
    expect(jump?.quality).toBe('OUTLIER_REJECTED');
  });

  it('does not promote STARTING from unbelegte OBD at 18:47:58Z when sparse lacks point authority', () => {
    const kin = withImplausibleLegEndpointsQuarantined(grid22);
    const c4 = computeC4AdaptiveL3(grid22, { enabled: true });
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

  it('matches frozen C4 baseline on Tiguan 2026-10-19 grid label-for-label', () => {
    const grid19 = loadGrid('tiguan-20261019-position-grid.json');
    const baseline = JSON.parse(
      readFileSync(join(FIXTURES, 'tiguan-20261019-c4-baseline.json'), 'utf8'),
    ) as Array<{ label: string; valueKmh: number | null; quality: string }>;
    const c4 = computeC4AdaptiveL3(grid19);
    expect(c4.length).toBe(baseline.length);
    for (let i = 0; i < baseline.length; i++) {
      expect(c4[i]!.label).toBe(baseline[i]!.label);
      expect(c4[i]!.valueKmh).toBe(baseline[i]!.valueKmh);
      expect(c4[i]!.quality).toBe(baseline[i]!.quality);
    }
  });
});
