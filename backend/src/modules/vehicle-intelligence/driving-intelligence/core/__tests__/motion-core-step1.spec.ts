import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  analyzeOneSecondLegs,
  countFrozenL3ShadowMismatches,
  detectPositionOutliers,
  detectTimingJitterSuspectLegs,
  MOTION_CORE_JITTER_NEIGHBOUR_OFFSETS_S,
  orderMotionCoreGrid,
  replayFrozenL3OnGrid,
  type MotionCorePositionBucket,
} from '../index';
import { motionCoreLegGolden as legGolden } from './fixtures/motion-core-leg-golden';
import {
  makeSyntheticMotionGrid,
  SyntheticSpeedProfile,
  syntheticLabel,
} from './fixtures/motion-core-synthetic.fixture';

const PHASE5C_ROOT =
  process.env.EXP021_PHASE5C_ROOT ??
  '/opt/cursor/artifacts/exp021-phase5c-tesla-reference-20261021';

const TESLA_TRIPS: Array<{ key: string; tripId: string }> = [
  { key: 'TRIP_1', tripId: '14c41c06-0a54-49d1-b5d2-f9d7373e638d' },
  { key: 'TRIP_2', tripId: '7a9d6a28-d91a-4919-98d8-d92fbea1573e' },
];

function loadTeslaGrid(tripKey: string): MotionCorePositionBucket[] | null {
  const gridPath = path.join(PHASE5C_ROOT, 'replay', `${tripKey}_position_grid.json`);
  if (!fs.existsSync(gridPath)) {
    return null;
  }
  const doc = JSON.parse(fs.readFileSync(gridPath, 'utf8')) as {
    tripId: string;
    buckets: MotionCorePositionBucket[];
  };
  return doc.buckets;
}

function loadTeslaShadowSpeedMap(tripKey: string): Map<string, number | null> {
  const shadowPath = path.join(PHASE5C_ROOT, 'telemetry/production_export/shadow', `${tripKey}_shadow_intervals.jsonl`);
  const map = new Map<string, number | null>();
  if (!fs.existsSync(shadowPath)) {
    return map;
  }
  for (const line of fs.readFileSync(shadowPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { intervalStart: string; estimatedSpeedKmh: number | null };
    const label = new Date(row.intervalStart).toISOString().replace(/\.\d{3}Z$/, 'Z');
    map.set(label, row.estimatedSpeedKmh);
  }
  return map;
}

function jitterLegStarts(buckets: MotionCorePositionBucket[]): string[] {
  return [...detectTimingJitterSuspectLegs(buckets).keys()].sort();
}

describe('EXP021 motion core step 1 (baseline L3 + leg consistency)', () => {
  describe('synthetic leg consistency (S1/S7/S8/S9 subset — FSM/event tests not ported)', () => {
    it('S1_constant: legs mostly PLAUSIBLE with finite speeds', () => {
      const prof = new SyntheticSpeedProfile([{ durationS: 60, vStartKmh: 50, vEndKmh: 50 }]);
      const grid = makeSyntheticMotionGrid(
        prof,
        Array.from({ length: 61 }, (_, t) => t),
        { noiseM: 0.3 },
      );
      const replay = replayFrozenL3OnGrid(grid);
      const inner = replay.filter((r) => {
        const sec = Number(r.bucketLabelUtc.slice(17, 19));
        return sec >= 3 && sec <= 57 && r.l3SpeedKmh != null;
      });
      expect(inner.length).toBeGreaterThan(40);
      for (const row of inner) {
        expect(row.l3SpeedKmh!).toBeGreaterThan(40);
        expect(row.l3SpeedKmh!).toBeLessThan(60);
      }
    });

    it('S7_gps_jump: chord outlier at jump label (Python parity)', () => {
      const prof = new SyntheticSpeedProfile([{ durationS: 60, vStartKmh: 50, vEndKmh: 50 }]);
      const grid = makeSyntheticMotionGrid(prof, Array.from({ length: 61 }, (_, t) => t), {
        noiseM: 0.3,
        jumps: { 30: 40 },
      });
      const outliers = [...detectPositionOutliers(grid).keys()].sort();
      expect(outliers).toEqual(legGolden.s7OutlierLabels);
    });

    it('S8_timing_jitter: spike signature leg start (Python parity)', () => {
      const prof = new SyntheticSpeedProfile([{ durationS: 60, vStartKmh: 45, vEndKmh: 45 }]);
      const times = Array.from({ length: 61 }, (_, t) => t).filter((t) => t !== 28);
      const grid = makeSyntheticMotionGrid(prof, times, { noiseM: 0.2, slips: { 29: -1 } });
      expect(jitterLegStarts(grid)).toEqual(legGolden.s8JitterLegStarts);
    });

    it('S9_real_manoeuvre: monotone ramp not flagged as jitter', () => {
      const prof = new SyntheticSpeedProfile([
        { durationS: 15, vStartKmh: 30, vEndKmh: 30 },
        { durationS: 4.17, vStartKmh: 30, vEndKmh: 60 },
        { durationS: 15, vStartKmh: 60, vEndKmh: 60 },
        { durationS: 4.44, vStartKmh: 60, vEndKmh: 20 },
        { durationS: 15, vStartKmh: 20, vEndKmh: 20 },
      ]);
      const grid = makeSyntheticMotionGrid(
        prof,
        Array.from({ length: Math.floor(prof.durationS) + 1 }, (_, t) => t),
        { noiseM: 0.3 },
      );
      expect(detectTimingJitterSuspectLegs(grid).size).toBe(legGolden.s9JitterLegCount);
    });

    it('S6_order_invariance: jitter map identical after shuffle + duplicate rows', () => {
      const prof = new SyntheticSpeedProfile([{ durationS: 60, vStartKmh: 40, vEndKmh: 40 }]);
      const grid = makeSyntheticMotionGrid(prof, Array.from({ length: 61 }, (_, t) => t), { noiseM: 0 });
      const shuffled = [...grid.slice(10), ...grid.slice(0, 10), grid[10]!, grid[20]!];
      expect(jitterLegStarts(grid)).toEqual(jitterLegStarts(shuffled));
      expect(jitterLegStarts(orderMotionCoreGrid(grid))).toEqual(jitterLegStarts(orderMotionCoreGrid(shuffled)));
    });

    it('S4_short_outage: no speed values on absent labels (replay)', () => {
      const prof = new SyntheticSpeedProfile([{ durationS: 60, vStartKmh: 60, vEndKmh: 60 }]);
      const times = Array.from({ length: 61 }, (_, t) => t).filter((t) => t !== 30 && t !== 31);
      const grid = makeSyntheticMotionGrid(prof, times, { noiseM: 0.3 });
      const absent = new Set([syntheticLabel(30), syntheticLabel(31)]);
      const replay = replayFrozenL3OnGrid(grid);
      for (const row of replay) {
        if (absent.has(row.bucketLabelUtc)) {
          expect(row.l3SpeedKmh).toBeNull();
        }
      }
    });
  });

  describe('lookahead / truncated inputs (centered leg diagnostic)', () => {
    it('requires neighbour legs within ±3 s before TIMING_JITTER_SIGNATURE is possible', () => {
      expect(MOTION_CORE_JITTER_NEIGHBOUR_OFFSETS_S).toEqual([-3, -2, -1, 1, 2, 3]);
      const prof = new SyntheticSpeedProfile([{ durationS: 60, vStartKmh: 45, vEndKmh: 45 }]);
      const times = Array.from({ length: 61 }, (_, t) => t).filter((t) => t !== 28);
      const full = makeSyntheticMotionGrid(prof, times, { noiseM: 0.2, slips: { 29: -1 } });
      const truncated = full.filter((b) => b.bucketLabelUtc <= syntheticLabel(26));
      const fullSig = detectTimingJitterSuspectLegs(full).get('2026-01-01T10:00:27Z');
      expect(fullSig).toBeDefined();
      const truncSig = detectTimingJitterSuspectLegs(truncated).get('2026-01-01T10:00:27Z');
      expect(truncSig).toBeUndefined();
      const truncLeg = analyzeOneSecondLegs(truncated).find((l) => l.legStartLabel === '2026-01-01T10:00:27Z');
      expect(truncLeg?.assessment).not.toBe('TIMING_JITTER_SIGNATURE');
    });
  });

  describe('Tesla replay baseline (artifact path; skipped when fixtures missing)', () => {
    for (const trip of TESLA_TRIPS) {
      it(`${trip.key} (${trip.tripId}) frozen L3 matches shadow export`, () => {
        const grid = loadTeslaGrid(trip.key);
        if (!grid) {
          expect(fs.existsSync(PHASE5C_ROOT)).toBe(false);
          return;
        }
        const meta = JSON.parse(
          fs.readFileSync(path.join(PHASE5C_ROOT, 'telemetry/production_export', `${trip.key}_trip_meta.json`), 'utf8'),
        ) as { tripId: string };
        expect(meta.tripId).toBe(trip.tripId);

        const shadow = loadTeslaShadowSpeedMap(trip.key);
        const replay = replayFrozenL3OnGrid(grid);
        const mism = countFrozenL3ShadowMismatches(replay, shadow, 0.05);
        expect(mism).toBe(0);

        const jitter = jitterLegStarts(grid);
        if (trip.key === 'TRIP_1') {
          expect(jitter).toEqual(legGolden.teslaTrip1JitterLegStarts);
        } else {
          expect(jitter).toEqual(legGolden.teslaTrip2JitterLegStarts);
        }
      });
    }

    it('documents forensics vs algorithm jitter leg sets (no special-casing)', () => {
      const grid1 = loadTeslaGrid('TRIP_1');
      const grid2 = loadTeslaGrid('TRIP_2');
      if (!grid1 || !grid2) {
        return;
      }
      const fn1 = new Set(jitterLegStarts(grid1));
      const fn2 = new Set(jitterLegStarts(grid2));
      const forensics1 = new Set<string>(legGolden.forensicsTimingJitterLegStartsTrip1);
      const forensics2 = new Set<string>(legGolden.forensicsTimingJitterLegStartsTrip2);
      expect([...fn1].every((x) => forensics1.has(x))).toBe(true);
      expect(forensics1.size).toBeGreaterThan(fn1.size);
      expect([...forensics2].every((x) => fn2.has(x))).toBe(true);
      expect(fn2.size).toBeGreaterThan(forensics2.size);
    });
  });

  describe('runtime wiring unchanged', () => {
    it('evaluateL3AtCenter import path still used by compute-trip-intervals', () => {
      const src = fs.readFileSync(
        path.join(__dirname, '../compute-trip-intervals.ts'),
        'utf8',
      );
      expect(src).toContain('evaluateL3AtCenter');
      expect(src).not.toContain('detectTimingJitterSuspectLegs');
      expect(src).not.toContain('replayFrozenL3OnGrid');
    });
  });
});
