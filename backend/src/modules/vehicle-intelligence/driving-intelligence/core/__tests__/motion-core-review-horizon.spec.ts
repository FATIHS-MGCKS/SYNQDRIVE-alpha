import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  computeC4AdaptiveL3,
  MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S,
  MOTION_CORE_C4_JITTER_COUPLED_HORIZON_FORWARD_S,
  type MotionCorePositionBucket,
} from '..';

/**
 * EXP021 review — C4 finalization horizon regression.
 * Bug (confirmed on both Tesla development grids): the documented jitter-coupled horizon t+3 was
 * insufficient; C4 quality at a label changed when t+4 arrived. Full horizon incl. outlier coupling: t+6.
 */

const PHASE5C = '/opt/cursor/artifacts/exp021-phase5c-tesla-reference-20261021';
const hasTesla = fs.existsSync(path.join(PHASE5C, 'replay/TRIP_1_position_grid.json'));

const T0 = Date.parse('2026-01-01T10:00:00Z');
const lab = (i: number) => new Date(T0 + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const LAT0 = 50.0;
const MLON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const MLAT = 111_320;

function gridFromXY(x: Array<number | null>, y: number[] = []): MotionCorePositionBucket[] {
  return x.map((d, i) => ({
    bucketLabelUtc: lab(i),
    availability: d == null ? 'ROW_ABSENT' : 'PRESENT',
    latitude: d == null ? null : LAT0 + (y[i] ?? 0) / MLAT,
    longitude: d == null ? null : d / MLON,
  }));
}

const sig = (s: { valueKmh: number | null; quality: string; flags: string[]; supportLabels: string[] }) =>
  `${s.valueKmh == null ? 'null' : s.valueKmh.toFixed(9)}|${s.quality}|${[...s.flags].sort().join(',')}|${s.supportLabels.join(',')}`;

/** Count samples at labels <= cut-H that differ between prefix [0..cut] and the full grid, over all cuts. */
function truncationDiffs(grid: MotionCorePositionBucket[], H: number): number {
  const full = computeC4AdaptiveL3(grid).map(sig);
  let diffs = 0;
  for (let c = 8; c < grid.length; c++) {
    const trunc = computeC4AdaptiveL3(grid.slice(0, c + 1)).map(sig);
    for (let i = 0; i <= c - H; i++) {
      if (trunc[i] !== full[i]) diffs += 1;
    }
  }
  return diffs;
}

/** Minimal forward horizon h such that C4 at t is unchanged for every prefix ending at >= t+h. */
function minimalHorizonAt(grid: MotionCorePositionBucket[], t: number): number {
  const full = sig(computeC4AdaptiveL3(grid)[t]!);
  let h = 0;
  for (let k = 0; t + k < grid.length; k++) {
    if (sig(computeC4AdaptiveL3(grid.slice(0, t + k + 1))[t]!) !== full) h = k + 1;
  }
  return h;
}

describe('EXP021 review — C4 finalization horizon (bug regression)', () => {
  it('synthetic: outgoing-leg jitter decision at t needs label t+4 (old constant 3 insufficient)', () => {
    const v = 10;
    const legs = new Array(10).fill(v);
    legs[6] = 1.4 * v;
    legs[8] = 0.5 * v;
    legs[9] = 0.5 * v;
    const x: Array<number | null> = [0];
    let p = 0;
    for (const l of legs) {
      p += l;
      x.push(p);
    }
    x[5] = null;
    const grid = gridFromXY(x);
    expect(minimalHorizonAt(grid, 6)).toBe(4);
    expect(MOTION_CORE_C4_JITTER_COUPLED_HORIZON_FORWARD_S).toBe(4);
  });

  it('synthetic: outlier coupling at t+2 changes the C4 value at t until label t+6', () => {
    // Deterministic grid found by randomized search (review round); the value at t=6 flips 44.06 → 48.08
    // when label 12 (= t+6) arrives because point 8 (= t+2) is only then classified as chord outlier.
    const x: Array<number | null> = [
      11.83, 23.66, null, 47.33, 59.16, null, 82.82, 94.65, 106.48, 118.32, 140.1, 151.94, 163.77, 175.6, 187.43,
      199.26, 211.09, 222.92, 234.76, 246.59,
    ];
    const y = [0, 0, 0, 0, -4.56, 0, -5.56, 0, 13.46, 0, 0, 14.38, 0, 0, 0, 0, 0, 0, 12.9, 0];
    const grid = gridFromXY(x, y);
    expect(minimalHorizonAt(grid, 6)).toBe(6);
    expect(MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S).toBe(6);
    expect(truncationDiffs(grid, MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S)).toBe(0);
    expect(truncationDiffs(grid, MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S - 1)).toBeGreaterThan(0);
  });

  (hasTesla ? it : it.skip)(
    'Tesla development grids: no finalized sample changes under the corrected horizons; t+3 was violated',
    () => {
      for (const key of ['TRIP_1', 'TRIP_2']) {
        const grid = JSON.parse(
          fs.readFileSync(path.join(PHASE5C, 'replay', `${key}_position_grid.json`), 'utf8'),
        ).buckets as MotionCorePositionBucket[];
        expect(truncationDiffs(grid, 3)).toBeGreaterThan(0);
        expect(truncationDiffs(grid, MOTION_CORE_C4_JITTER_COUPLED_HORIZON_FORWARD_S)).toBe(0);
        expect(truncationDiffs(grid, MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S)).toBe(0);
      }
    },
  );
});
