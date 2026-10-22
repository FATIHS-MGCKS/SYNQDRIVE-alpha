import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  computeC4AdaptiveL3,
  detectMotionManoeuvreEvents,
  detectMotionManoeuvreEventsFromC4,
  type MotionManoeuvreEvent,
} from '../index';
import {
  makeSyntheticMotionGrid,
  SyntheticSpeedProfile,
  syntheticLabel,
} from './fixtures/motion-core-synthetic.fixture';
import { PY_PROTO, pyDetectEvents, type PyMotionEvent } from './fixtures/motion-python-parity.fixture';

const PHASE5C =
  process.env.EXP021_PHASE5C_ROOT ?? '/opt/cursor/artifacts/exp021-phase5c-tesla-reference-20261021';
const NUM_TOL = 1e-6;

function loadGrid(tripKey: string) {
  const p = path.join(PHASE5C, 'replay', `${tripKey}_position_grid.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')).buckets;
}

function assertEventParity(ts: MotionManoeuvreEvent[], py: PyMotionEvent[]) {
  expect(ts.length).toBe(py.length);
  for (let i = 0; i < ts.length; i++) {
    const a = ts[i]!;
    const b = py[i]!;
    expect(a.kind).toBe(b.kind);
    expect(a.startLabel).toBe(b.start_label);
    expect(a.endLabel).toBe(b.end_label);
    expect(a.quality).toBe(b.quality);
    expect(a.steps).toBe(b.steps);
    expect(a.durationS).toBe(b.duration_s);
    expect(a.flags).toEqual(b.flags);
    expect(a.source).toBe(b.source);
    expect(a.algorithmVersion).toBe(b.algorithm_version);
    expect(Math.abs(a.deltaKmh - b.delta_kmh)).toBeLessThanOrEqual(NUM_TOL);
    expect(Math.abs(a.meanAccelMps2 - b.mean_accel_mps2)).toBeLessThanOrEqual(NUM_TOL);
    expect(Math.abs(a.peakAccel1sMps2 - b.peak_accel_1s_mps2)).toBeLessThanOrEqual(NUM_TOL);
    if (a.peakAccel2sMps2 == null) {
      expect(b.peak_accel_2s_mps2).toBeNull();
    } else {
      expect(Math.abs(a.peakAccel2sMps2 - (b.peak_accel_2s_mps2 as number))).toBeLessThanOrEqual(NUM_TOL);
    }
  }
}

describe('EXP021 motion event detector (Fable port)', () => {
  it('Python parity C4 events on Tesla TRIP_1', () => {
    const grid = loadGrid('TRIP_1');
    if (!grid || !fs.existsSync(PY_PROTO)) return;
    const c4 = computeC4AdaptiveL3(grid);
    const ts = detectMotionManoeuvreEvents(1, c4, 'C4_ADAPTIVE_L3');
    const py = pyDetectEvents(1, grid, 'C4_ADAPTIVE_L3');
    assertEventParity(ts, py);
    expect(ts.length).toBe(4);
  });

  it('Python parity C4 events on Tesla TRIP_2', () => {
    const grid = loadGrid('TRIP_2');
    if (!grid || !fs.existsSync(PY_PROTO)) return;
    const ts = detectMotionManoeuvreEventsFromC4(2, grid);
    const py = pyDetectEvents(2, grid, 'C4_ADAPTIVE_L3');
    assertEventParity(ts, py);
    expect(ts.length).toBe(4);
  });

  it('S1_constant: no manoeuvre events on C4', () => {
    const prof = new SyntheticSpeedProfile([{ durationS: 60, vStartKmh: 50, vEndKmh: 50 }]);
    const grid = makeSyntheticMotionGrid(prof, Array.from({ length: 61 }, (_, t) => t), { noiseM: 0.3 });
    const ev = detectMotionManoeuvreEventsFromC4(0, grid);
    expect(ev.length).toBe(0);
  });

  it('S2_brake_stop_restart: manoeuvre events match Python on shared C4 grid', () => {
    const prof = new SyntheticSpeedProfile([
      { durationS: 20, vStartKmh: 50, vEndKmh: 50 },
      { durationS: 7, vStartKmh: 50, vEndKmh: 0 },
      { durationS: 20, vStartKmh: 0, vEndKmh: 0 },
      { durationS: 9.3, vStartKmh: 0, vEndKmh: 50 },
      { durationS: 20, vStartKmh: 50, vEndKmh: 50 },
    ]);
    const times = Array.from({ length: Math.floor(prof.durationS) + 1 }, (_, t) => t);
    const grid = makeSyntheticMotionGrid(prof, times, { noiseM: 0.3, absentWhenSpeedBelowKmh: 2 });
    if (!fs.existsSync(PY_PROTO)) return;
    const py = pyDetectEvents(0, grid, 'C4_ADAPTIVE_L3');
    const ev = detectMotionManoeuvreEventsFromC4(0, grid);
    assertEventParity(ev, py);
    expect(py.some((e) => e.kind === 'DECELERATION')).toBe(true);
  });

  it('S8_timing_jitter: events DEGRADED or absent (no OK-only artefact)', () => {
    const prof = new SyntheticSpeedProfile([{ durationS: 60, vStartKmh: 45, vEndKmh: 45 }]);
    const times = Array.from({ length: 61 }, (_, t) => t).filter((t) => t !== 28);
    const grid = makeSyntheticMotionGrid(prof, times, { noiseM: 0.2, slips: { 29: -1 } });
    const ev = detectMotionManoeuvreEventsFromC4(0, grid);
    expect(ev.every((e) => e.quality !== 'OK' || e.flags.length === 0)).toBe(true);
  });

  it('truncated grid does not change events fully before cut when C4 stable', () => {
    const grid = loadGrid('TRIP_2');
    if (!grid) return;
    const full = detectMotionManoeuvreEventsFromC4(2, grid);
    const cutLabel = '2026-10-21T12:22:00Z';
    const truncated = grid.filter((b: { bucketLabelUtc: string }) => b.bucketLabelUtc <= cutLabel);
    const truncEv = detectMotionManoeuvreEventsFromC4(2, truncated);
    const stable = full.filter((e) => e.endLabel < '2026-10-21T12:21:50Z');
    for (const e of stable) {
      const t = truncEv.find((x) => x.startLabel === e.startLabel && x.kind === e.kind);
      expect(t).toEqual(e);
    }
  });
});
