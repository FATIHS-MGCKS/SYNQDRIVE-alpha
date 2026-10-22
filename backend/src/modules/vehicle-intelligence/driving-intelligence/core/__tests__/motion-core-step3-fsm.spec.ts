import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  computeC4AdaptiveL3,
  extractMotionFsmStopEpisodes,
  MOTION_CORE_C4_JITTER_COUPLED_HORIZON_FORWARD_S,
  MOTION_FSM_PARAMS_V0_2_DEV,
  runMotionFsmV02,
  sampleByLabel,
  type MotionFsmLabel,
} from '../index';
import {
  makeSyntheticMotionGrid,
  SyntheticSpeedProfile,
  syntheticLabel,
} from './fixtures/motion-core-synthetic.fixture';
import {
  loadDimoSparseSpeedForTrip,
  PY_PROTO,
  pyFsmJson,
  type PyFsmLabel,
} from './fixtures/motion-python-parity.fixture';

const PHASE5C =
  process.env.EXP021_PHASE5C_ROOT ?? '/opt/cursor/artifacts/exp021-phase5c-tesla-reference-20261021';

function loadGrid(tripKey: string) {
  const p = path.join(PHASE5C, 'replay', `${tripKey}_position_grid.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')).buckets;
}

function assertFsmParity(ts: MotionFsmLabel[], py: PyFsmLabel[]) {
  expect(ts.length).toBe(py.length);
  for (let i = 0; i < ts.length; i++) {
    const a = ts[i]!;
    const b = py[i]!;
    expect(a.label).toBe(b.label);
    expect(a.state).toBe(b.state);
    expect(a.evidenceQuality).toBe(b.evidence_quality);
    expect(a.reason).toBe(b.reason);
    expect(a.positionPresent).toBe(b.position_present);
    expect(a.mode).toBe(b.mode);
    expect(a.flags).toEqual(b.flags);
    if (a.speedKmh == null) {
      expect(b.speed_kmh).toBeNull();
    } else {
      expect(Math.abs(a.speedKmh - (b.speed_kmh as number))).toBeLessThanOrEqual(1e-6);
    }
  }
}

function runC4Fsm(grid: unknown[], mode: 'CAUSAL' | 'RETROSPECTIVE', sparse?: Array<{ label: string; speedKmh: number }>) {
  const buckets = grid as Parameters<typeof computeC4AdaptiveL3>[0];
  const c4 = computeC4AdaptiveL3(buckets);
  return runMotionFsmV02(
    buckets,
    c4,
    mode,
    sparse?.map((s) => ({ label: s.label, speedKmh: s.speedKmh })) ?? null,
  );
}

describe('EXP021 motion FSM V0.2 (Fable port)', () => {
  it('Python parity CAUSAL+RETROSPECTIVE on Tesla TRIP_1 C4 (+ DIMO sparse speed)', () => {
    const grid = loadGrid('TRIP_1');
    if (!grid || !fs.existsSync(PY_PROTO)) return;
    const sparse = loadDimoSparseSpeedForTrip(1);
    const c4 = computeC4AdaptiveL3(grid);
    for (const mode of ['CAUSAL', 'RETROSPECTIVE'] as const) {
      const ts = runMotionFsmV02(
        grid,
        c4,
        mode,
        sparse.map((s) => ({ label: s.label, speedKmh: s.speed_kmh })),
      );
      const py = pyFsmJson(grid, mode, sparse);
      assertFsmParity(ts, py);
    }
  });

  it('Python parity CAUSAL+RETROSPECTIVE on Tesla TRIP_2 C4 (+ DIMO sparse speed)', () => {
    const grid = loadGrid('TRIP_2');
    if (!grid || !fs.existsSync(PY_PROTO)) return;
    const sparse = loadDimoSparseSpeedForTrip(2);
    const c4 = computeC4AdaptiveL3(grid);
    for (const mode of ['CAUSAL', 'RETROSPECTIVE'] as const) {
      const ts = runMotionFsmV02(
        grid,
        c4,
        mode,
        sparse.map((s) => ({ label: s.label, speedKmh: s.speed_kmh })),
      );
      const py = pyFsmJson(grid, mode, sparse);
      assertFsmParity(ts, py);
    }
  });

  it('S1_constant: all MOVING inner, no stop episodes', () => {
    const prof = new SyntheticSpeedProfile([{ durationS: 60, vStartKmh: 50, vEndKmh: 50 }]);
    const grid = makeSyntheticMotionGrid(prof, Array.from({ length: 61 }, (_, t) => t), { noiseM: 0.3 });
    const inner = new Set(Array.from({ length: 55 }, (_, i) => syntheticLabel(i + 3)));
    const fsm = runC4Fsm(grid, 'CAUSAL');
    expect(fsm.filter((l) => inner.has(l.label)).every((l) => l.state === 'MOVING')).toBe(true);
    expect(extractMotionFsmStopEpisodes(0, fsm, 'CAUSAL').length).toBe(0);
    if (fs.existsSync(PY_PROTO)) {
      assertFsmParity(fsm, pyFsmJson(grid, 'CAUSAL'));
    }
  });

  it('S2_brake_stop_restart: one stop episode, causal latency bounds', () => {
    const prof = new SyntheticSpeedProfile([
      { durationS: 20, vStartKmh: 50, vEndKmh: 50 },
      { durationS: 7, vStartKmh: 50, vEndKmh: 0 },
      { durationS: 20, vStartKmh: 0, vEndKmh: 0 },
      { durationS: 9.3, vStartKmh: 0, vEndKmh: 50 },
      { durationS: 20, vStartKmh: 50, vEndKmh: 50 },
    ]);
    const times = Array.from({ length: Math.floor(prof.durationS) + 1 }, (_, t) => t);
    const grid = makeSyntheticMotionGrid(prof, times, { noiseM: 0.3, absentWhenSpeedBelowKmh: 2 });
    const fsm = runC4Fsm(grid, 'CAUSAL');
    const eps = extractMotionFsmStopEpisodes(0, fsm, 'CAUSAL');
    expect(eps.length).toBe(1);
    if (fs.existsSync(PY_PROTO)) {
      assertFsmParity(fsm, pyFsmJson(grid, 'CAUSAL'));
    }
  });

  it('S3_slow_roll: never MOVING during 2 km/h roll (creep in stationary band)', () => {
    const prof = new SyntheticSpeedProfile([
      { durationS: 10, vStartKmh: 30, vEndKmh: 30 },
      { durationS: 5, vStartKmh: 30, vEndKmh: 2 },
      { durationS: 30, vStartKmh: 2, vEndKmh: 2 },
      { durationS: 5, vStartKmh: 2, vEndKmh: 30 },
      { durationS: 10, vStartKmh: 30, vEndKmh: 30 },
    ]);
    const grid = makeSyntheticMotionGrid(
      prof,
      Array.from({ length: Math.floor(prof.durationS) + 1 }, (_, t) => t),
      { noiseM: 0.3 },
    );
    const roll = new Set(Array.from({ length: 26 }, (_, i) => syntheticLabel(i + 18)));
    const fsm = runC4Fsm(grid, 'CAUSAL');
    const states = new Set(fsm.filter((l) => roll.has(l.label)).map((l) => l.state));
    expect(states.has('MOVING')).toBe(false);
    expect(fsm.some((l) => roll.has(l.label) && l.state === 'STATIONARY')).toBe(true);
  });

  it('S4_short_outage: MOVING through 2s gap', () => {
    const prof = new SyntheticSpeedProfile([{ durationS: 60, vStartKmh: 60, vEndKmh: 60 }]);
    const times = Array.from({ length: 61 }, (_, t) => t).filter((t) => t !== 30 && t !== 31);
    const grid = makeSyntheticMotionGrid(prof, times, { noiseM: 0.3 });
    const gap = new Set([syntheticLabel(30), syntheticLabel(31)]);
    const fsm = runC4Fsm(grid, 'CAUSAL');
    expect(fsm.filter((l) => gap.has(l.label)).every((l) => l.state === 'MOVING')).toBe(true);
    expect(extractMotionFsmStopEpisodes(0, fsm, 'CAUSAL').length).toBe(0);
  });

  it('S5_long_outage: UNKNOWN deep in gap, MOVING after resume', () => {
    const prof = new SyntheticSpeedProfile([{ durationS: 200, vStartKmh: 60, vEndKmh: 60 }]);
    const times = Array.from({ length: 201 }, (_, t) => t).filter((t) => t < 40 || t >= 160);
    const grid = makeSyntheticMotionGrid(prof, times, { noiseM: 0.3 });
    const deep = new Set(Array.from({ length: 50 }, (_, i) => syntheticLabel(i + 110)));
    const after = new Set(Array.from({ length: 30 }, (_, i) => syntheticLabel(i + 165)));
    const fsm = runC4Fsm(grid, 'CAUSAL');
    expect(fsm.filter((l) => deep.has(l.label)).every((l) => l.state === 'UNKNOWN')).toBe(true);
    expect(fsm.filter((l) => after.has(l.label)).every((l) => l.state === 'MOVING')).toBe(true);
  });

  it('S6_frozen_fix: no STATIONARY from frozen coordinates', () => {
    const prof = new SyntheticSpeedProfile([{ durationS: 60, vStartKmh: 40, vEndKmh: 40 }]);
    const grid = makeSyntheticMotionGrid(prof, Array.from({ length: 61 }, (_, t) => t), {
      noiseM: 0,
      frozen: [25, 30],
    });
    const frozen = new Set(Array.from({ length: 6 }, (_, i) => syntheticLabel(i + 25)));
    const fsm = runC4Fsm(grid, 'CAUSAL');
    expect(fsm.some((l) => frozen.has(l.label) && l.state === 'STATIONARY')).toBe(false);
  });

  it('S8_timing_jitter: FSM stays MOVING', () => {
    const prof = new SyntheticSpeedProfile([{ durationS: 60, vStartKmh: 45, vEndKmh: 45 }]);
    const times = Array.from({ length: 61 }, (_, t) => t).filter((t) => t !== 28);
    const grid = makeSyntheticMotionGrid(prof, times, { noiseM: 0.2, slips: { 29: -1 } });
    const fsm = runC4Fsm(grid, 'CAUSAL');
    const inner = fsm.filter((l) => l.label >= syntheticLabel(3) && l.label <= syntheticLabel(57));
    expect(inner.every((l) => l.state === 'MOVING')).toBe(true);
  });

  it('S10_sparse_vehicle_speed: STATIONARY with sparse zero during parked gap', () => {
    const prof = new SyntheticSpeedProfile([
      { durationS: 120, vStartKmh: 0, vEndKmh: 0 },
      { durationS: 10, vStartKmh: 0, vEndKmh: 50 },
      { durationS: 30, vStartKmh: 50, vEndKmh: 50 },
    ]);
    const n = Math.floor(prof.durationS);
    const grid = makeSyntheticMotionGrid(
      prof,
      Array.from({ length: n + 1 }, (_, t) => t),
      { noiseM: 0.3, absentWhenSpeedBelowKmh: 2 },
    );
    const sparse = Array.from({ length: 161 }, (_, s) => s)
      .filter((s) => s % 20 === 0)
      .map((s) => ({
        label: syntheticLabel(s),
        speedKmh: s < 120 ? 0 : prof.speedKmh(s),
      }));
    const fsm = runC4Fsm(grid, 'CAUSAL', sparse);
    const parked = new Set(Array.from({ length: 98 }, (_, i) => syntheticLabel(i + 20)).filter((l) => l < syntheticLabel(118)));
    expect(fsm.filter((l) => parked.has(l.label)).every((l) => l.state === 'STATIONARY')).toBe(true);
    const eps = extractMotionFsmStopEpisodes(0, fsm, 'CAUSAL');
    expect(eps.length).toBe(1);
    expect(eps[0]!.evidenceQuality).toBe('DIRECT');
    const fsmNoSparse = runC4Fsm(grid, 'CAUSAL');
    const beforeReappear = fsmNoSparse.filter(
      (l) => l.label >= syntheticLabel(5) && l.label < syntheticLabel(118),
    );
    expect(beforeReappear.every((l) => l.state === 'UNKNOWN')).toBe(true);
  });

  it('causal prefix equals full causal up to same index', () => {
    const grid = loadGrid('TRIP_1');
    if (!grid) return;
    const c4Full = computeC4AdaptiveL3(grid);
    const full = runMotionFsmV02(grid, c4Full, 'CAUSAL');
    const cut = 200;
    const gridCut = grid.slice(0, cut);
    const c4Cut = computeC4AdaptiveL3(gridCut);
    const prefix = runMotionFsmV02(gridCut, c4Cut, 'CAUSAL');
    for (let i = 0; i < prefix.length - 1; i++) {
      expect(prefix[i]).toEqual(full[i]);
    }
  });
});
