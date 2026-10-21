import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

import {
  analyzeBaselineL3Exactness,
  computeC4AdaptiveL3,
  labelsWhereC4DiffersFromFrozenL3,
  MOTION_CORE_C4_INPUT_HORIZON_FORWARD_S,
  replayFrozenL3OnGrid,
  robustPathSlopeC1,
  sampleByLabel,
} from '../index';
import {
  makeSyntheticMotionGrid,
  SyntheticSpeedProfile,
  syntheticLabel,
} from './fixtures/motion-core-synthetic.fixture';

const PHASE5C =
  process.env.EXP021_PHASE5C_ROOT ?? '/opt/cursor/artifacts/exp021-phase5c-tesla-reference-20261021';
const PY_PROTO = '/opt/cursor/artifacts/exp021-motion-core-design/prototype';
const NUM_TOL_KMH = 1e-6;

function loadGrid(tripKey: string) {
  const p = path.join(PHASE5C, 'replay', `${tripKey}_position_grid.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')).buckets;
}

function loadShadow(tripKey: string): Map<string, number | null> {
  const p = path.join(PHASE5C, 'telemetry/production_export/shadow', `${tripKey}_shadow_intervals.jsonl`);
  const m = new Map<string, number | null>();
  if (!fs.existsSync(p)) return m;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { intervalStart: string; estimatedSpeedKmh: number | null };
    m.set(new Date(row.intervalStart).toISOString().replace(/\.\d{3}Z$/, 'Z'), row.estimatedSpeedKmh);
  }
  return m;
}

function pyC4Json(grid: unknown[]): unknown[] {
  const tmpIn = '/tmp/mc-grid-in.json';
  const tmpOut = '/tmp/mc-c4-out.json';
  fs.writeFileSync(tmpIn, JSON.stringify(grid));
  execSync(
    `python3 -c "import json; from speed_candidates import c4_adaptive_l3; g=json.load(open('${tmpIn}')); o=[{'label':s.label,'value_kmh':s.value_kmh,'quality':s.quality,'support_labels':s.support_labels,'support_span_s':s.support_span_s,'flags':s.flags,'estimator':s.estimator} for s in c4_adaptive_l3(g)]; json.dump(o, open('${tmpOut}','w'))"`,
    { cwd: PY_PROTO, stdio: 'pipe' },
  );
  return JSON.parse(fs.readFileSync(tmpOut, 'utf8')) as unknown[];
}

function assertParity(ts: ReturnType<typeof computeC4AdaptiveL3>, py: Array<Record<string, unknown>>) {
  expect(ts.length).toBe(py.length);
  for (let i = 0; i < ts.length; i++) {
    const a = ts[i]!;
    const b = py[i] as Record<string, unknown>;
    expect(a.label).toBe(b.label);
    expect(a.quality).toBe(b.quality);
    expect(a.supportLabels).toEqual(b.support_labels);
    expect(a.supportSpanS).toBe(b.support_span_s);
    expect(a.flags).toEqual(b.flags);
    if (a.valueKmh == null) {
      expect(b.value_kmh).toBeNull();
    } else {
      expect(Math.abs(a.valueKmh - (b.value_kmh as number))).toBeLessThanOrEqual(NUM_TOL_KMH);
    }
  }
}

describe('EXP021 motion core step 2 (C4 adaptive L3)', () => {
  it('baseline exactness report on Tesla TRIP_1', () => {
    const grid = loadGrid('TRIP_1');
    if (!grid) return;
    const replay = replayFrozenL3OnGrid(grid);
    const shadow = loadShadow('TRIP_1');
    const report = analyzeBaselineL3Exactness(replay, shadow, 0.05);
    expect(report.mismatchesAboveTolerance).toBe(0);
    expect(report.maxAbsDeltaKmh).toBeLessThanOrEqual(0.05);
    expect(report.comparedPairs).toBeGreaterThan(60);
  });

  it('unchanged L3-direct C4 values match replayFrozenL3 exactly', () => {
    const grid = loadGrid('TRIP_1');
    if (!grid) return;
    const l3 = replayFrozenL3OnGrid(grid);
    const c4 = computeC4AdaptiveL3(grid);
    const l3m = new Map(l3.map((r) => [r.bucketLabelUtc, r.l3SpeedKmh]));
    for (const s of c4) {
      if (s.flags.includes('L3_DIRECT') && s.valueKmh != null) {
        expect(s.valueKmh).toBe(l3m.get(s.label));
      }
    }
  });

  it('C4 Python parity on synthetic S8 jitter grid', () => {
    const prof = new SyntheticSpeedProfile([{ durationS: 60, vStartKmh: 45, vEndKmh: 45 }]);
    const times = Array.from({ length: 61 }, (_, t) => t).filter((t) => t !== 28);
    const grid = makeSyntheticMotionGrid(prof, times, { noiseM: 0.2, slips: { 29: -1 } });
    if (!fs.existsSync(PY_PROTO)) return;
    const py = pyC4Json(grid) as Array<Record<string, unknown>>;
    assertParity(computeC4AdaptiveL3(grid), py);
  });

  it('C4 Python parity on Tesla TRIP_1 when artifacts present', () => {
    const grid = loadGrid('TRIP_1');
    if (!grid || !fs.existsSync(PY_PROTO)) return;
    const py = pyC4Json(grid) as Array<Record<string, unknown>>;
    assertParity(computeC4AdaptiveL3(grid), py);
  });

  it('C4 differs from frozen L3 only on jitter-fallback labels (8 on combined trips)', () => {
    const g1 = loadGrid('TRIP_1');
    const g2 = loadGrid('TRIP_2');
    if (!g1 || !g2) return;
    const changed = [...labelsWhereC4DiffersFromFrozenL3(g1), ...labelsWhereC4DiffersFromFrozenL3(g2)];
    expect(changed.length).toBe(8);
    const c4g1 = sampleByLabel(computeC4AdaptiveL3(g1));
    const c4g2 = sampleByLabel(computeC4AdaptiveL3(g2));
    for (const lab of changed) {
      const s = c4g1.get(lab) ?? c4g2.get(lab);
      expect(s?.flags.some((f) => f.includes('FALLBACK'))).toBe(true);
    }
  });

  it('truncated grid does not retroactively change finalized C4 when horizon respected', () => {
    const prof = new SyntheticSpeedProfile([{ durationS: 60, vStartKmh: 45, vEndKmh: 45 }]);
    const times = Array.from({ length: 61 }, (_, t) => t).filter((t) => t !== 28);
    const full = makeSyntheticMotionGrid(prof, times, { noiseM: 0.2, slips: { 29: -1 } });
    const cutLabel = syntheticLabel(30 - MOTION_CORE_C4_INPUT_HORIZON_FORWARD_S);
    const truncated = full.filter((b) => b.bucketLabelUtc <= cutLabel);
    const fullC4 = sampleByLabel(computeC4AdaptiveL3(full));
    const truncC4 = sampleByLabel(computeC4AdaptiveL3(truncated));
    const frozenLabel = syntheticLabel(20);
    expect(fullC4.get(frozenLabel)?.valueKmh).toBeDefined();
    expect(truncC4.get(frozenLabel)?.valueKmh).toBe(fullC4.get(frozenLabel)?.valueKmh);
    expect(truncC4.get(frozenLabel)?.quality).toBe(fullC4.get(frozenLabel)?.quality);
  });

  it('no speed on absent labels (C1/C4)', () => {
    const prof = new SyntheticSpeedProfile([{ durationS: 60, vStartKmh: 60, vEndKmh: 60 }]);
    const times = Array.from({ length: 61 }, (_, t) => t).filter((t) => t !== 30 && t !== 31);
    const grid = makeSyntheticMotionGrid(prof, times, { noiseM: 0.3 });
    const absent = new Set([syntheticLabel(30), syntheticLabel(31)]);
    for (const s of computeC4AdaptiveL3(grid)) {
      if (absent.has(s.label)) expect(s.valueKmh).toBeNull();
    }
    for (const s of robustPathSlopeC1(grid)) {
      if (absent.has(s.label)) expect(s.valueKmh).toBeNull();
    }
  });
});
