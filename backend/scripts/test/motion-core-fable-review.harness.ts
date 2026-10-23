/**
 * EXP021 motion core — Fable review round: baseline vs candidate comparison on Tesla TRIP_1/TRIP_2.
 * Implements the frozen rules in `<OUT>/EVALUATION_RULES.md` (written before any candidate run).
 *
 * cd backend && npx ts-node --transpile-only scripts/test/motion-core-fable-review.harness.ts
 *
 * Candidates: FSM K-A / K-B / K-C singly and combined (V0.3); event K3 (spike reversion).
 * C4 is unchanged for every FSM/event variant (K5 was measured separately and rejected —
 * see `<OUT>/C4_K5_COMPARE.txt`, reproducible at the reverted commit noted in REVIEW_REPORT.md).
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  computeC4AdaptiveL3,
  detectMotionManoeuvreEvents,
  extractMotionFsmStopEpisodes,
  MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S,
  MOTION_CORE_C4_INPUT_HORIZON_FORWARD_S,
  MOTION_CORE_EVENT_GUARDS_V0_1_DEV,
  MOTION_EVENT_FABLE_V0_1_OPTIONS,
  MOTION_EVENT_HF_THRESHOLDS_V1,
  MOTION_EVENT_V0_2_CANDIDATE_OPTIONS,
  MOTION_FSM_FABLE_V0_2_OPTIONS,
  MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
  motionFsmVersionId,
  runMotionFsm,
  type MotionCorePositionBucket,
  type MotionCoreSpeedSample,
  type MotionFsmCandidateOptions,
  type MotionFsmLabel,
  type MotionFsmMode,
  type MotionFsmStopEpisode,
  type MotionManoeuvreEvent,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/core';

const OUT = process.env.MOTION_CORE_REVIEW_OUT ?? '/opt/cursor/artifacts/exp021-motion-core-fable-review';
const PHASE5C =
  process.env.EXP021_PHASE5C_ROOT ?? '/opt/cursor/artifacts/exp021-phase5c-tesla-reference-20261021';
const REF_PKG = path.join(PHASE5C, 'reference_package/Tesla_Referenz_20261021');
const DIMO_RO =
  process.env.EXP021_DIMO_READONLY ?? '/opt/cursor/artifacts/exp021-motion-core-design/inputs/dimo_readonly';
const DISPLAY_MANOEUVRES_CSV =
  process.env.EXP021_DISPLAY_MANOEUVRES ??
  '/opt/cursor/artifacts/exp021-motion-core-design/results/EVENTS_VS_DISPLAY_MANOEUVRES.csv';

const OFFSETS = [-2, -1, 0, 1, 2];
const TRIPS = [
  { key: 'TRIP_1', n: 1 },
  { key: 'TRIP_2', n: 2 },
] as const;

const FSM_VARIANTS: Record<string, Readonly<MotionFsmCandidateOptions>> = {
  BASE: MOTION_FSM_FABLE_V0_2_OPTIONS,
  KA: {
    staleSpeedContextFix: true,
    startingTimeout: false,
    evidencePropagation: false,
    frozenLegacySparsePointAuthority: false,
  },
  KB: {
    staleSpeedContextFix: false,
    startingTimeout: true,
    evidencePropagation: false,
    frozenLegacySparsePointAuthority: false,
  },
  KC: {
    staleSpeedContextFix: false,
    startingTimeout: false,
    evidencePropagation: true,
    frozenLegacySparsePointAuthority: false,
  },
  V03: MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
};
const CONFIGS = [
  { id: 'cS', mode: 'CAUSAL' as MotionFsmMode, sparse: true },
  { id: 'c0', mode: 'CAUSAL' as MotionFsmMode, sparse: false },
  { id: 'rS', mode: 'RETROSPECTIVE' as MotionFsmMode, sparse: true },
  { id: 'r0', mode: 'RETROSPECTIVE' as MotionFsmMode, sparse: false },
];

const sec = (label: string) => Math.floor(Date.parse(label) / 1000);
const lab = (s: number) => new Date(s * 1000).toISOString().replace('.000Z', 'Z');
const plus = (label: string, s: number) => lab(sec(label) + s);
const round = (x: number | null, d = 2) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sha256 = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

function loadGrid(k: string): MotionCorePositionBucket[] {
  return JSON.parse(fs.readFileSync(path.join(PHASE5C, 'replay', `${k}_position_grid.json`), 'utf8')).buckets;
}
function loadSparse(n: number) {
  const p = path.join(DIMO_RO, `TRIP_${n}_dimo_speed_location_1s.json`);
  const doc = JSON.parse(fs.readFileSync(p, 'utf8')) as { rows: Array<{ timestamp: string; speedAvg: number | null }> };
  return doc.rows
    .filter((r) => r.speedAvg != null)
    .map((r) => ({ label: r.timestamp.replace('.000Z', 'Z'), speedKmh: r.speedAvg as number }));
}
interface RefRow {
  sample_id: string;
  trip: number;
  utc_candidate_assuming_offset_plus_02: string;
  tesla_speed_kmh_primary: number | null;
}
interface ZeroRun {
  trip: number;
  first_sample: string;
  last_sample: string;
  first_display_time: string;
  last_display_time: string;
  zero_sample_count: number;
  sample_time_span_s: number;
  boundary_censored: boolean;
}
interface DisplayManoeuvre {
  trip: number;
  kind: 'ACCELERATION' | 'DECELERATION';
  startLabel: string;
  endLabel: string;
  deltaKmh: number;
}
function loadDisplayManoeuvres(): DisplayManoeuvre[] {
  const lines = fs.readFileSync(DISPLAY_MANOEUVRES_CSV, 'utf8').trim().split('\n');
  const hdr = lines[0]!.split(',');
  const col = (name: string) => hdr.indexOf(name);
  return lines.slice(1).map((l) => {
    const c = l.split(',');
    return {
      trip: Number(c[col('trip')]),
      kind: c[col('kind')] as DisplayManoeuvre['kind'],
      startLabel: c[col('start_label')]!,
      endLabel: c[col('end_label')]!,
      deltaKmh: Number(c[col('delta_kmh')]),
    };
  });
}

const refs: RefRow[] = JSON.parse(fs.readFileSync(path.join(REF_PKG, 'REFERENCE_ROWS.json'), 'utf8'));
const zeroRuns: ZeroRun[] = JSON.parse(fs.readFileSync(path.join(REF_PKG, 'ZERO_DISPLAY_RUNS.json'), 'utf8'));
const refById = new Map(refs.map((r) => [r.sample_id, r]));
const displayManoeuvres = loadDisplayManoeuvres();

/** Reference display value at grid label `label` under global offset `off` (reference UTC = candidate + off). */
function makeRefLookup(trip: number) {
  const byCandidate = new Map<string, number | null>();
  for (const r of refs) {
    if (r.trip === trip) byCandidate.set(r.utc_candidate_assuming_offset_plus_02, r.tesla_speed_kmh_primary);
  }
  return {
    has: (label: string, off: number) => byCandidate.has(plus(label, -off)),
    get: (label: string, off: number) => byCandidate.get(plus(label, -off)) ?? null,
  };
}

type TripData = {
  key: string;
  n: number;
  grid: MotionCorePositionBucket[];
  gridLabels: Set<string>;
  present: Set<string>;
  c4: MotionCoreSpeedSample[];
  c4By: Map<string, MotionCoreSpeedSample>;
  sparse: Array<{ label: string; speedKmh: number }>;
  sparseLabels: Set<string>;
  ref: ReturnType<typeof makeRefLookup>;
};

const trips: TripData[] = TRIPS.map(({ key, n }) => {
  const grid = loadGrid(key);
  const c4 = computeC4AdaptiveL3(grid);
  const sparse = loadSparse(n);
  return {
    key,
    n,
    grid,
    gridLabels: new Set(grid.map((b) => b.bucketLabelUtc)),
    present: new Set(grid.filter((b) => b.availability === 'PRESENT').map((b) => b.bucketLabelUtc)),
    c4,
    c4By: new Map(c4.map((s) => [s.label, s])),
    sparse,
    sparseLabels: new Set(sparse.map((s) => s.label)),
    ref: makeRefLookup(n),
  };
});

// ---------------------------------------------------------------------------------------------
// 1. Stop / start evaluation
// ---------------------------------------------------------------------------------------------

interface StopRunRow {
  variant: string;
  config: string;
  offset: number;
  trip: number;
  run: string;
  zFirst: string;
  zLast: string;
  zSpanS: number;
  censored: boolean;
  supportLabels: number;
  classification: 'MATCHED' | 'MISSED_WITH_SUPPORT' | 'NOT_ASSESSABLE' | 'OUTSIDE_GRID';
  lenientMatched: boolean;
  matchFraction: number | null;
  episodeStartLatest: string | null;
  episodeEnd: string | null;
  startErrS: number | null;
  endErrS: number | null;
  durErrS: number | null;
  episodeObservedFraction: number | null;
  episodeGapLabels: number | null;
  firstStationarySource: string | null;
  evidenceQuality: string | null;
  decisionLabel: string | null;
  decisionHorizonEmpiricalS: number | null;
  decisionHorizonWorstCaseS: number | null;
  creepStates: string;
}

interface ExtraEpisodeRow {
  variant: string;
  config: string;
  offset: number;
  trip: number;
  startEarliest: string;
  end: string;
  minDurationS: number;
  evidenceQuality: string;
  displayInEpisode: string;
}

function episodeRange(e: MotionFsmStopEpisode): [number, number] {
  const end = e.endLatest ?? e.endEarliest ?? e.startLatest;
  return [sec(e.startEarliest), sec(end)];
}

function evaluateStops(
  variant: string,
  cfg: (typeof CONFIGS)[number],
  off: number,
  t: TripData,
  labels: MotionFsmLabel[],
  eps: MotionFsmStopEpisode[],
): { rows: StopRunRow[]; extras: ExtraEpisodeRow[] } {
  const byLabel = new Map(labels.map((l) => [l.label, l]));
  const rows: StopRunRow[] = [];
  const matchedEpisodes = new Set<MotionFsmStopEpisode>();
  for (const z of zeroRuns.filter((z) => z.trip === t.n)) {
    const z0 = plus(refById.get(z.first_sample)!.utc_candidate_assuming_offset_plus_02, off);
    const z1 = plus(refById.get(z.last_sample)!.utc_candidate_assuming_offset_plus_02, off);
    const zLabels: string[] = [];
    for (let s = sec(z0); s <= sec(z1); s++) zLabels.push(lab(s));
    const inGrid = zLabels.filter((l) => t.gridLabels.has(l));
    const base: Omit<StopRunRow, 'classification' | 'supportLabels'> = {
      variant,
      config: cfg.id,
      offset: off,
      trip: t.n,
      run: `${z.first_display_time.slice(11)}..${z.last_display_time.slice(11)}`,
      zFirst: z0,
      zLast: z1,
      zSpanS: z.sample_time_span_s,
      censored: z.boundary_censored,
      lenientMatched: false,
      matchFraction: null,
      episodeStartLatest: null,
      episodeEnd: null,
      startErrS: null,
      endErrS: null,
      durErrS: null,
      episodeObservedFraction: null,
      episodeGapLabels: null,
      firstStationarySource: null,
      evidenceQuality: null,
      decisionLabel: null,
      decisionHorizonEmpiricalS: null,
      decisionHorizonWorstCaseS: null,
      creepStates: '',
    };
    let support = 0;
    for (let s = sec(z0) - 3; s <= sec(z1) + 3; s++) {
      const l = lab(s);
      if (t.present.has(l) || (cfg.sparse && t.sparseLabels.has(l))) support++;
    }
    // creep distribution: reference labels with display 1..5 in Z ± 5 s
    const creep: Record<string, number> = {};
    for (let s = sec(z0) - 5; s <= sec(z1) + 5; s++) {
      const l = lab(s);
      const d = t.ref.get(l, off);
      if (d != null && d >= 1 && d <= 5) {
        const st = byLabel.get(l)?.state ?? 'NO_BUCKET';
        creep[st] = (creep[st] ?? 0) + 1;
      }
    }
    const creepStates = Object.entries(creep)
      .sort()
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    if (inGrid.length === 0) {
      rows.push({ ...base, supportLabels: support, classification: 'OUTSIDE_GRID', creepStates });
      continue;
    }
    let best: { e: MotionFsmStopEpisode; frac: number } | null = null;
    let lenient = false;
    for (const e of eps) {
      const [a, b] = episodeRange(e);
      const inside = zLabels.filter((l) => sec(l) >= a && sec(l) <= b).length;
      const frac = inside / zLabels.length;
      if (frac > (best?.frac ?? 0)) best = { e, frac };
      if (a <= sec(z1) + 3 && b >= sec(z0) - 3) lenient = true;
    }
    if (best && best.frac >= 0.5) {
      const e = best.e;
      matchedEpisodes.add(e);
      const src = e.firstStationarySource;
      const empirical = src === 'SPARSE_VEHICLE_SPEED' ? null : MOTION_CORE_C4_INPUT_HORIZON_FORWARD_S;
      const worst = src === 'SPARSE_VEHICLE_SPEED' ? null : MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S;
      rows.push({
        ...base,
        supportLabels: support,
        classification: 'MATCHED',
        lenientMatched: lenient,
        matchFraction: round(best.frac, 3),
        episodeStartLatest: e.startLatest,
        episodeEnd: e.endEarliest,
        startErrS: z.boundary_censored ? null : sec(e.startLatest) - sec(z0),
        endErrS: z.boundary_censored || e.endEarliest == null ? null : sec(e.endEarliest) - sec(z1),
        durErrS: z.boundary_censored ? null : e.minDurationS - z.sample_time_span_s,
        episodeObservedFraction: round(e.observedLabels / e.labels, 3),
        episodeGapLabels: e.gapLabels,
        firstStationarySource: src,
        evidenceQuality: e.evidenceQuality,
        decisionLabel: cfg.mode === 'CAUSAL' ? e.startLatest : null,
        decisionHorizonEmpiricalS: cfg.mode === 'CAUSAL' ? empirical : null,
        decisionHorizonWorstCaseS: cfg.mode === 'CAUSAL' ? worst : null,
        creepStates,
      });
    } else {
      rows.push({
        ...base,
        supportLabels: support,
        classification: support >= 3 ? 'MISSED_WITH_SUPPORT' : 'NOT_ASSESSABLE',
        lenientMatched: lenient,
        matchFraction: best ? round(best.frac, 3) : 0,
        creepStates,
      });
    }
  }
  // Extra episodes: no zero-run match, inside video coverage, and no display-0 label in E ± 3 s
  const extras: ExtraEpisodeRow[] = [];
  for (const e of eps) {
    if (matchedEpisodes.has(e)) continue;
    const [a, b] = episodeRange(e);
    const display: string[] = [];
    let anyRef = false;
    let anyZero = false;
    for (let s = a - 3; s <= b + 3; s++) {
      const l = lab(s);
      if (!t.ref.has(l, off)) continue;
      const d = t.ref.get(l, off);
      if (s >= a && s <= b) {
        anyRef = true;
        display.push(`${d ?? '-'}`);
      }
      if (d === 0) anyZero = true;
    }
    if (anyRef && !anyZero) {
      extras.push({
        variant,
        config: cfg.id,
        offset: off,
        trip: t.n,
        startEarliest: e.startEarliest,
        end: e.endEarliest ?? 'OPEN',
        minDurationS: e.minDurationS,
        evidenceQuality: e.evidenceQuality,
        displayInEpisode: display.join('/'),
      });
    }
  }
  return { rows, extras };
}

// ---------------------------------------------------------------------------------------------
// 2. Event evaluation
// ---------------------------------------------------------------------------------------------

interface EventRow {
  variant: string;
  offset: number;
  trip: number;
  kind: string;
  startLabel: string;
  endLabel: string;
  deltaKmh: number;
  quality: string;
  classification: 'MATCHED' | 'EXTRA_ARTEFACT' | 'EXTRA_UNASSESSABLE' | 'EXTRA_REAL_UNDER_REF_THRESHOLD';
  displayDeltaInWindow: number | null;
  matchedDisplay: string | null;
}
interface MissedDisplayRow {
  variant: string;
  offset: number;
  trip: number;
  kind: string;
  displayStart: string;
  displayEnd: string;
  displayDeltaKmh: number;
  classification: 'MISSED_WITH_SUPPORT' | 'MISSED_NO_SUPPORT';
}

function evaluateEvents(variant: string, off: number, t: TripData, events: MotionManoeuvreEvent[]) {
  const rows: EventRow[] = [];
  const missed: MissedDisplayRow[] = [];
  const disp = displayManoeuvres.filter((d) => d.trip === t.n);
  const matchedDisp = new Set<DisplayManoeuvre>();
  for (const ev of events) {
    const a = sec(ev.startLabel);
    const b = sec(ev.endLabel);
    const m = disp.find(
      (d) => d.kind === ev.kind && a <= sec(d.endLabel) + off + 3 && sec(d.startLabel) + off - 3 <= b,
    );
    if (m) {
      matchedDisp.add(m);
      rows.push({
        variant,
        offset: off,
        trip: t.n,
        kind: ev.kind,
        startLabel: ev.startLabel,
        endLabel: ev.endLabel,
        deltaKmh: ev.deltaKmh,
        quality: ev.quality,
        classification: 'MATCHED',
        displayDeltaInWindow: null,
        matchedDisplay: `${m.startLabel.slice(11, 19)}..${m.endLabel.slice(11, 19)} dv=${m.deltaKmh}`,
      });
      continue;
    }
    const sign = ev.kind === 'ACCELERATION' ? 1 : -1;
    const vals: number[] = [];
    for (let s = a - 2; s <= b + 2; s++) {
      const d = t.ref.get(lab(s), off);
      if (d != null) vals.push(d);
    }
    let dvDisp: number | null = null;
    if (vals.length >= 2) {
      dvDisp = 0;
      for (let i = 0; i < vals.length; i++)
        for (let j = i + 1; j < vals.length; j++) dvDisp = Math.max(dvDisp, sign * (vals[j]! - vals[i]!));
    }
    const minDelta = MOTION_EVENT_HF_THRESHOLDS_V1.minDeltaKmh[ev.kind];
    const cls: EventRow['classification'] =
      dvDisp == null ? 'EXTRA_UNASSESSABLE' : dvDisp < minDelta ? 'EXTRA_ARTEFACT' : 'EXTRA_REAL_UNDER_REF_THRESHOLD';
    rows.push({
      variant,
      offset: off,
      trip: t.n,
      kind: ev.kind,
      startLabel: ev.startLabel,
      endLabel: ev.endLabel,
      deltaKmh: ev.deltaKmh,
      quality: ev.quality,
      classification: cls,
      displayDeltaInWindow: dvDisp,
      matchedDisplay: null,
    });
  }
  for (const d of disp) {
    if (matchedDisp.has(d)) continue;
    const s0 = t.c4By.get(plus(d.startLabel, off))?.valueKmh;
    const s1 = t.c4By.get(plus(d.endLabel, off))?.valueKmh;
    missed.push({
      variant,
      offset: off,
      trip: t.n,
      kind: d.kind,
      displayStart: d.startLabel,
      displayEnd: d.endLabel,
      displayDeltaKmh: d.deltaKmh,
      classification: s0 != null && s1 != null ? 'MISSED_WITH_SUPPORT' : 'MISSED_NO_SUPPORT',
    });
  }
  return { rows, missed };
}

// ---------------------------------------------------------------------------------------------
// 3. Speed baseline metrics (C4 unchanged across recommended candidates)
// ---------------------------------------------------------------------------------------------

function speedBaselineMetrics() {
  const out: Record<string, unknown> = {};
  for (const t of trips) {
    const perOffset: Record<string, unknown> = {};
    for (const off of OFFSETS) {
      const byQ: Record<string, number[]> = {};
      for (const s of t.c4) {
        if (s.valueKmh == null) continue;
        const d = t.ref.get(s.label, off);
        if (d == null) continue;
        (byQ[s.quality] ??= []).push(Math.abs(s.valueKmh - d));
      }
      perOffset[String(off)] = Object.fromEntries(
        Object.entries(byQ).map(([q, errs]) => {
          const sorted = [...errs].sort((a, b) => a - b);
          return [q, { n: errs.length, mae: round(mean(errs)), medianAe: round(sorted[Math.floor(sorted.length / 2)] ?? null) }];
        }),
      );
    }
    const numeric = t.c4.filter((s) => s.valueKmh != null).length;
    // preservation of real speed changes: C4 dv / display dv on display manoeuvres with support at both ends
    const pres: Array<{ display: number; c4: number | null }> = [];
    for (const d of displayManoeuvres.filter((d) => d.trip === t.n)) {
      const a = t.c4By.get(d.startLabel)?.valueKmh;
      const b = t.c4By.get(d.endLabel)?.valueKmh;
      pres.push({ display: d.deltaKmh, c4: a != null && b != null ? round(b - a, 1) : null });
    }
    const withSupport = pres.filter((p) => p.c4 != null);
    out[t.key] = {
      presentLabels: t.present.size,
      numericLabels: numeric,
      coverage: round(numeric / t.present.size, 3),
      qualityCounts: t.c4.reduce<Record<string, number>>((acc, s) => ((acc[s.quality] = (acc[s.quality] ?? 0) + 1), acc), {}),
      commonSupportErrorByQuality: perOffset,
      preservation: {
        displayManoeuvres: pres.length,
        withSupportBothEnds: withSupport.length,
        sumAbsDisplayDv: withSupport.reduce((a, p) => a + Math.abs(p.display), 0),
        sumAbsC4Dv: round(withSupport.reduce((a, p) => a + Math.abs(p.c4!), 0), 1),
      },
      finalizationHorizon: {
        valueSupportS: MOTION_CORE_C4_INPUT_HORIZON_FORWARD_S,
        fullS: MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S,
        note: 'BUG-1 fix: outgoing-leg jitter t+4, C1-window jitter flag t+5, chord-outlier coupling t+6 (see HORIZON_BRUTE_FORCE.json)',
      },
    };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------

function toCsv<T extends object>(rows: T[]): string {
  if (rows.length === 0) return '';
  const hdr = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [hdr.join(','), ...rows.map((r) => hdr.map((h) => esc((r as Record<string, unknown>)[h])).join(','))].join('\n') + '\n';
}

fs.mkdirSync(OUT, { recursive: true });

const stopRows: StopRunRow[] = [];
const extraRows: ExtraEpisodeRow[] = [];
const labelDiffRows: Array<Record<string, unknown>> = [];
const episodeRows: Array<Record<string, unknown>> = [];

for (const t of trips) {
  for (const cfg of CONFIGS) {
    const baseLabels = runMotionFsm(t.grid, t.c4, cfg.mode, cfg.sparse ? t.sparse : null, undefined, FSM_VARIANTS.BASE!);
    for (const [variant, opts] of Object.entries(FSM_VARIANTS)) {
      const labels = runMotionFsm(t.grid, t.c4, cfg.mode, cfg.sparse ? t.sparse : null, undefined, opts);
      const again = runMotionFsm(t.grid, t.c4, cfg.mode, cfg.sparse ? t.sparse : null, undefined, opts);
      if (JSON.stringify(again) !== JSON.stringify(labels)) throw new Error(`idempotency violated ${t.key} ${cfg.id} ${variant}`);
      const eps = extractMotionFsmStopEpisodes(t.n, labels, cfg.mode);
      let stateDiff = 0;
      let qualityDiff = 0;
      const flagCounts: Record<string, number> = {};
      for (let i = 0; i < labels.length; i++) {
        if (labels[i]!.state !== baseLabels[i]!.state) stateDiff++;
        if (labels[i]!.evidenceQuality !== baseLabels[i]!.evidenceQuality) qualityDiff++;
        for (const f of labels[i]!.flags) {
          const k = f.split('=')[0]!;
          if (k === 'OPEN_END_GRID_BOUNDARY' || k === 'implied_mean_speed_kmh') continue;
          flagCounts[k] = (flagCounts[k] ?? 0) + 1;
        }
      }
      labelDiffRows.push({
        trip: t.n,
        config: cfg.id,
        variant,
        versionId: motionFsmVersionId(opts),
        labels: labels.length,
        stateDiffVsBase: stateDiff,
        qualityDiffVsBase: qualityDiff,
        episodes: eps.length,
        directLabels: labels.filter((l) => l.evidenceQuality === 'DIRECT').length,
        inferredLabels: labels.filter((l) => l.evidenceQuality === 'INFERRED').length,
        indeterminateLabels: labels.filter((l) => l.evidenceQuality === 'INDETERMINATE').length,
        flags: Object.entries(flagCounts)
          .sort()
          .map(([k, v]) => `${k}:${v}`)
          .join(' '),
      });
      for (const e of eps) {
        episodeRows.push({
          trip: t.n,
          config: cfg.id,
          variant,
          startEarliest: e.startEarliest,
          startLatest: e.startLatest,
          endEarliest: e.endEarliest,
          endLatest: e.endLatest,
          minDurationS: e.minDurationS,
          observedMinDurationS: e.observedMinDurationS,
          maxDurationS: e.maxDurationS,
          labels: e.labels,
          observedLabels: e.observedLabels,
          gapLabels: e.gapLabels,
          direct: e.directLabels,
          inferred: e.inferredLabels,
          indeterminate: e.indeterminateLabels,
          hysteresisBandLabels: e.hysteresisBandLabels,
          evidenceQuality: e.evidenceQuality,
          firstStationarySource: e.firstStationarySource,
          firstStationaryC4Quality: e.firstStationaryC4Quality,
          openEnd: e.openEnd,
        });
      }
      for (const off of OFFSETS) {
        const r = evaluateStops(variant, cfg, off, t, labels, eps);
        stopRows.push(...r.rows);
        extraRows.push(...r.extras);
      }
    }
  }
}

const eventRows: EventRow[] = [];
const missedRows: MissedDisplayRow[] = [];
const EVENT_VARIANTS = { BASE: MOTION_EVENT_FABLE_V0_1_OPTIONS, K3: MOTION_EVENT_V0_2_CANDIDATE_OPTIONS } as const;
for (const t of trips) {
  for (const [variant, opts] of Object.entries(EVENT_VARIANTS)) {
    const events = detectMotionManoeuvreEvents(t.n, t.c4, 'C4_ADAPTIVE_L3', MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities, opts);
    for (const off of OFFSETS) {
      const r = evaluateEvents(variant, off, t, events);
      eventRows.push(...r.rows);
      missedRows.push(...r.missed);
    }
  }
}

// ---- summaries ------------------------------------------------------------------------------

function summarizeStops() {
  const out: Array<Record<string, unknown>> = [];
  for (const variant of Object.keys(FSM_VARIANTS)) {
    for (const cfg of CONFIGS) {
      for (const off of OFFSETS) {
        const rs = stopRows.filter((r) => r.variant === variant && r.config === cfg.id && r.offset === off);
        const m = rs.filter((r) => r.classification === 'MATCHED');
        const startErrs = m.map((r) => r.startErrS).filter((x): x is number => x != null);
        const endErrs = m.map((r) => r.endErrS).filter((x): x is number => x != null);
        const durErrs = m.map((r) => r.durErrS).filter((x): x is number => x != null);
        const ex = extraRows.filter((r) => r.variant === variant && r.config === cfg.id && r.offset === off);
        out.push({
          variant,
          config: cfg.id,
          offset: off,
          runs: rs.length,
          matched: m.length,
          missedWithSupport: rs.filter((r) => r.classification === 'MISSED_WITH_SUPPORT').length,
          notAssessable: rs.filter((r) => r.classification === 'NOT_ASSESSABLE').length,
          outsideGrid: rs.filter((r) => r.classification === 'OUTSIDE_GRID').length,
          lenientMatched: rs.filter((r) => r.lenientMatched).length,
          extraEpisodes: ex.length,
          extraEpisodeSeconds: ex.reduce((a, e) => a + e.minDurationS, 0),
          meanStartErrS: round(mean(startErrs)),
          meanAbsStartErrS: round(mean(startErrs.map(Math.abs))),
          meanEndErrS: round(mean(endErrs)),
          meanAbsEndErrS: round(mean(endErrs.map(Math.abs))),
          meanAbsDurErrS: round(mean(durErrs.map(Math.abs))),
          boundaryN: startErrs.length,
          meanObservedFraction: round(mean(m.map((r) => r.episodeObservedFraction!).filter((x) => x != null))),
          matchedDirect: m.filter((r) => r.evidenceQuality === 'DIRECT').length,
          matchedInferred: m.filter((r) => r.evidenceQuality === 'INFERRED').length,
          sourceSparse: m.filter((r) => r.firstStationarySource === 'SPARSE_VEHICLE_SPEED').length,
          sourceC4Ok: m.filter((r) => r.firstStationarySource === 'C4_OK').length,
          sourceC4Degraded: m.filter((r) => r.firstStationarySource === 'C4_DEGRADED').length,
          sourceGap: m.filter((r) => r.firstStationarySource === 'GAP_OR_POSITION_INFERENCE').length,
        });
      }
    }
  }
  return out;
}

function summarizeEvents() {
  const out: Array<Record<string, unknown>> = [];
  for (const variant of Object.keys(EVENT_VARIANTS)) {
    for (const off of OFFSETS) {
      const rs = eventRows.filter((r) => r.variant === variant && r.offset === off);
      const ms = missedRows.filter((r) => r.variant === variant && r.offset === off);
      const cnt = (c: EventRow['classification']) => rs.filter((r) => r.classification === c).length;
      const suspect = rs.filter((r) => r.quality === 'ARTEFACT_SUSPECT');
      out.push({
        variant,
        offset: off,
        events: rs.length,
        matched: cnt('MATCHED'),
        extraArtefact: cnt('EXTRA_ARTEFACT'),
        extraUnassessable: cnt('EXTRA_UNASSESSABLE'),
        extraRealUnderRefThreshold: cnt('EXTRA_REAL_UNDER_REF_THRESHOLD'),
        missedWithSupport: ms.filter((r) => r.classification === 'MISSED_WITH_SUPPORT').length,
        missedNoSupport: ms.filter((r) => r.classification === 'MISSED_NO_SUPPORT').length,
        qualityOk: rs.filter((r) => r.quality === 'OK').length,
        qualityDegraded: rs.filter((r) => r.quality === 'DEGRADED').length,
        qualityLimited: rs.filter((r) => r.quality === 'LIMITED').length,
        artefactSuspect: suspect.length,
        artefactSuspectOnExtraArtefact: suspect.filter((r) => r.classification === 'EXTRA_ARTEFACT').length,
        artefactSuspectOnMatched: suspect.filter((r) => r.classification === 'MATCHED').length,
        effectiveMatched: rs.filter((r) => r.classification === 'MATCHED' && r.quality !== 'ARTEFACT_SUSPECT').length,
        effectiveExtraArtefact: rs.filter((r) => r.classification === 'EXTRA_ARTEFACT' && r.quality !== 'ARTEFACT_SUSPECT').length,
      });
    }
  }
  return out;
}

const stopSummary = summarizeStops();
const eventSummary = summarizeEvents();
const speed = speedBaselineMetrics();

fs.writeFileSync(path.join(OUT, 'STOP_RUN_EVALUATION.csv'), toCsv(stopRows));
fs.writeFileSync(path.join(OUT, 'STOP_RUN_SUMMARY.csv'), toCsv(stopSummary));
fs.writeFileSync(path.join(OUT, 'STOP_EXTRA_EPISODES.csv'), toCsv(extraRows));
fs.writeFileSync(path.join(OUT, 'STOP_EPISODES_BY_VARIANT.csv'), toCsv(episodeRows));
fs.writeFileSync(path.join(OUT, 'FSM_LABEL_DIFF_BY_VARIANT.csv'), toCsv(labelDiffRows));
fs.writeFileSync(path.join(OUT, 'EVENTS_EVALUATION.csv'), toCsv(eventRows));
fs.writeFileSync(path.join(OUT, 'EVENTS_MISSED_DISPLAY.csv'), toCsv(missedRows));
fs.writeFileSync(path.join(OUT, 'EVENTS_SUMMARY.csv'), toCsv(eventSummary));
fs.writeFileSync(path.join(OUT, 'SPEED_BASELINE_METRICS.json'), JSON.stringify(speed, null, 2));

// ---- BEFORE/AFTER table -----------------------------------------------------------------------
const md: string[] = [];
md.push('# BEFORE / AFTER — Fable baseline vs Kandidaten (Tesla TRIP_1 + TRIP_2, Regeln: EVALUATION_RULES.md)');
md.push('');
md.push(`Erzeugt: ${new Date().toISOString()} — Harness: backend/scripts/test/motion-core-fable-review.harness.ts`);
md.push('');
md.push('## FSM-Label-Unterschiede je Variante (gegen BASE, gleicher C4-Input)');
md.push('');
md.push('| Trip | Konfig | Variante | Version | Zustand ≠ BASE | Evidenz ≠ BASE | Episoden | DIRECT / INFERRED / INDET | Flags |');
md.push('|---|---|---|---|---|---|---|---|---|');
for (const r of labelDiffRows) {
  md.push(`| ${r.trip} | ${r.config} | ${r.variant} | \`${r.versionId}\` | ${r.stateDiffVsBase} | ${r.qualityDiffVsBase} | ${r.episodes} | ${r.directLabels} / ${r.inferredLabels} / ${r.indeterminateLabels} | ${r.flags || '—'} |`);
}
md.push('');
md.push('## Stillstand / Anfahren — Zusammenfassung (Offset 0 und Spanne über −2..+2)');
md.push('');
md.push('| Variante | Konfig | matched@0 | missed+support@0 | n/a@0 | extra@0 (s) | lenient@0 | matched −2..+2 | missed −2..+2 | extra −2..+2 | Ø startErr@0 | Ø|startErr|@0 | Ø endErr@0 | Ø|endErr|@0 | Ø beobachtet | Quelle Sparse/C4ok/C4deg/Gap@0 |');
md.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const variant of Object.keys(FSM_VARIANTS)) {
  for (const cfg of CONFIGS) {
    const at = (off: number) => stopSummary.find((s) => s.variant === variant && s.config === cfg.id && s.offset === off)!;
    const s0 = at(0);
    const span = (k: string) => OFFSETS.map((o) => at(o)[k]).join('/');
    md.push(
      `| ${variant} | ${cfg.id} | ${s0.matched} | ${s0.missedWithSupport} | ${s0.notAssessable}+${s0.outsideGrid}og | ${s0.extraEpisodes} (${s0.extraEpisodeSeconds}) | ${s0.lenientMatched} | ${span('matched')} | ${span('missedWithSupport')} | ${span('extraEpisodes')} | ${s0.meanStartErrS ?? '—'} | ${s0.meanAbsStartErrS ?? '—'} | ${s0.meanEndErrS ?? '—'} | ${s0.meanAbsEndErrS ?? '—'} | ${s0.meanObservedFraction ?? '—'} | ${s0.sourceSparse}/${s0.sourceC4Ok}/${s0.sourceC4Degraded}/${s0.sourceGap} |`,
    );
  }
}
md.push('');
md.push('## Manöver — Zusammenfassung (Offset 0 und Spanne über −2..+2)');
md.push('');
md.push('| Variante | Events | MATCHED@0 | EXTRA_ARTEFACT@0 | EXTRA_UNASSESSABLE@0 | EXTRA_REAL_UNDER_REF@0 | MISSED+support@0 | MISSED no support@0 | OK/DEGRADED/LIMITED/ARTEFACT_SUSPECT | suspect∧artefact / suspect∧matched | eff. MATCHED −2..+2 | eff. EXTRA_ARTEFACT −2..+2 |');
md.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const variant of Object.keys(EVENT_VARIANTS)) {
  const at = (off: number) => eventSummary.find((s) => s.variant === variant && s.offset === off)!;
  const s0 = at(0);
  const span = (k: string) => OFFSETS.map((o) => at(o)[k]).join('/');
  md.push(
    `| ${variant} | ${s0.events} | ${s0.matched} | ${s0.extraArtefact} | ${s0.extraUnassessable} | ${s0.extraRealUnderRefThreshold} | ${s0.missedWithSupport} | ${s0.missedNoSupport} | ${s0.qualityOk}/${s0.qualityDegraded}/${s0.qualityLimited}/${s0.artefactSuspect} | ${s0.artefactSuspectOnExtraArtefact} / ${s0.artefactSuspectOnMatched} | ${span('effectiveMatched')} | ${span('effectiveExtraArtefact')} |`,
  );
}
md.push('');
md.push('## Geschwindigkeit (C4 unverändert in allen empfohlenen Varianten)');
md.push('');
md.push('```json');
md.push(JSON.stringify(speed, null, 2));
md.push('```');
md.push('');
md.push('K5 / K5b (C1 jitter-aware pair exclusion) wurden gemessen und verworfen — siehe `C4_K5_COMPARE.txt`, `C4_K5B_COMPARE.txt`.');
fs.writeFileSync(path.join(OUT, 'BEFORE_AFTER.md'), md.join('\n') + '\n');

const inputs = {
  grids: Object.fromEntries(TRIPS.map((t) => [t.key, sha256(path.join(PHASE5C, 'replay', `${t.key}_position_grid.json`))])),
  sparse: Object.fromEntries(TRIPS.map((t) => [t.key, sha256(path.join(DIMO_RO, `TRIP_${t.n}_dimo_speed_location_1s.json`))])),
  zeroRuns: sha256(path.join(REF_PKG, 'ZERO_DISPLAY_RUNS.json')),
  referenceRows: sha256(path.join(REF_PKG, 'REFERENCE_ROWS.json')),
  displayManoeuvres: sha256(DISPLAY_MANOEUVRES_CSV),
};
fs.writeFileSync(path.join(OUT, 'HARNESS_INPUT_HASHES.json'), JSON.stringify(inputs, null, 2));
console.log(fs.readFileSync(path.join(OUT, 'BEFORE_AFTER.md'), 'utf8'));
