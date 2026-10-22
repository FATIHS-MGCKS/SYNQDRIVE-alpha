import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  analyzeBaselineL3Exactness,
  computeC4AdaptiveL3,
  isShadowSpeedGatedOut,
  labelsWhereC4DiffersFromFrozenL3,
  MOTION_CORE_C4_INPUT_HORIZON_FORWARD_S,
  MOTION_CORE_C4_JITTER_COUPLED_HORIZON_FORWARD_S,
  reconcileShadowGating,
  replayFrozenL3OnGrid,
  robustPathSlopeC1,
  sampleByLabel,
} from '../index';
import {
  makeSyntheticMotionGrid,
  SyntheticSpeedProfile,
  syntheticLabel,
} from './fixtures/motion-core-synthetic.fixture';
import { PY_PROTO, pyC4Json } from './fixtures/motion-python-parity.fixture';

const PHASE5C =
  process.env.EXP021_PHASE5C_ROOT ?? '/opt/cursor/artifacts/exp021-phase5c-tesla-reference-20261021';
const NUM_TOL_KMH = 1e-6;

function loadGrid(tripKey: string) {
  const p = path.join(PHASE5C, 'replay', `${tripKey}_position_grid.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')).buckets;
}

function loadShadowRows(tripKey: string) {
  const p = path.join(PHASE5C, 'telemetry/production_export/shadow', `${tripKey}_shadow_intervals.jsonl`);
  const m = new Map<
    string,
    { estimatedSpeedKmh: number | null; motionState?: string; speedEvidenceState?: string }
  >();
  if (!fs.existsSync(p)) return m;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as {
      intervalStart: string;
      estimatedSpeedKmh: number | null;
      motionState?: string;
      speedEvidenceState?: string;
    };
    const lab = new Date(row.intervalStart).toISOString().replace(/\.\d{3}Z$/, 'Z');
    m.set(lab, row);
  }
  return m;
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
    const shadowRows = loadShadowRows('TRIP_1');
    const shadow = new Map([...shadowRows.entries()].map(([k, v]) => [k, v.estimatedSpeedKmh]));
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

  it('C4 Python parity on Tesla TRIP_2 when artifacts present', () => {
    const grid = loadGrid('TRIP_2');
    if (!grid || !fs.existsSync(PY_PROTO)) return;
    const py = pyC4Json(grid) as Array<Record<string, unknown>>;
    assertParity(computeC4AdaptiveL3(grid), py);
  });

  it('shadow gating explains SHADOW_NULL_L3_ONLY on both Tesla trips', () => {
    for (const tripKey of ['TRIP_1', 'TRIP_2'] as const) {
      const grid = loadGrid(tripKey);
      if (!grid) continue;
      const replay = replayFrozenL3OnGrid(grid);
      const c4 = computeC4AdaptiveL3(grid);
      const shadowRows = loadShadowRows(tripKey);
      const rec = reconcileShadowGating(replay, c4, shadowRows);
      const gated = rec.rows.filter((r) => r.category === 'SHADOW_NULL_L3_ONLY');
      expect(gated.length).toBeGreaterThan(0);
      const explained = gated.filter((r) => isShadowSpeedGatedOut(r.shadowMotionState)).length;
      expect(explained).toBe(gated.length);
    }
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

  it('truncated grid stable for C4 when jitter-coupled forward horizon respected', () => {
    const prof = new SyntheticSpeedProfile([{ durationS: 60, vStartKmh: 45, vEndKmh: 45 }]);
    const times = Array.from({ length: 61 }, (_, t) => t).filter((t) => t !== 28);
    const full = makeSyntheticMotionGrid(prof, times, { noiseM: 0.2, slips: { 29: -1 } });
    const frozenLabel = syntheticLabel(27);
    const cutSec = 27 + MOTION_CORE_C4_JITTER_COUPLED_HORIZON_FORWARD_S;
    const cutLabel = syntheticLabel(cutSec);
    const truncated = full.filter((b) => b.bucketLabelUtc <= cutLabel);
    const fullC4 = sampleByLabel(computeC4AdaptiveL3(full));
    const truncC4 = sampleByLabel(computeC4AdaptiveL3(truncated));
    expect(truncC4.get(frozenLabel)?.valueKmh).toBe(fullC4.get(frozenLabel)?.valueKmh);
    expect(truncC4.get(frozenLabel)?.quality).toBe(fullC4.get(frozenLabel)?.quality);
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

