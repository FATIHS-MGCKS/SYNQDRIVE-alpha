/**
 * EXP021 motion core TS step 2 — C4 evaluation + jitter reconciliation (offline).
 * cd backend && npx ts-node --transpile-only scripts/test/motion-core-ts-step2.harness.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

import {
  analyzeBaselineL3Exactness,
  commonSupportMetrics,
  computeC4AdaptiveL3,
  countFrozenL3ShadowMismatches,
  detectTimingJitterSuspectLegs,
  labelsWhereC4DiffersFromFrozenL3,
  replayFrozenL3OnGrid,
  sampleByLabel,
  speedMetrics,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/core';

const OUT = process.env.MOTION_CORE_TS_STEP2_OUT ?? '/opt/cursor/artifacts/exp021-motion-core-ts-step2';
const PHASE5C =
  process.env.EXP021_PHASE5C_ROOT ?? '/opt/cursor/artifacts/exp021-phase5c-tesla-reference-20261021';
const REF_PKG = path.join(PHASE5C, 'reference_package/Tesla_Referenz_20261021');
const PY_PROTO = '/opt/cursor/artifacts/exp021-motion-core-design/prototype';

const TRIPS = [
  { key: 'TRIP_1', tripId: '14c41c06-0a54-49d1-b5d2-f9d7373e638d', videoTrip: 1 },
  { key: 'TRIP_2', tripId: '7a9d6a28-d91a-4919-98d8-d92fbea1573e', videoTrip: 2 },
];

function loadGrid(tripKey: string) {
  return JSON.parse(fs.readFileSync(path.join(PHASE5C, 'replay', `${tripKey}_position_grid.json`), 'utf8'))
    .buckets as Array<Record<string, unknown>>;
}

function loadShadow(tripKey: string): Map<string, number | null> {
  const map = new Map<string, number | null>();
  const p = path.join(PHASE5C, 'telemetry/production_export/shadow', `${tripKey}_shadow_intervals.jsonl`);
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { intervalStart: string; estimatedSpeedKmh: number | null };
    map.set(new Date(row.intervalStart).toISOString().replace(/\.\d{3}Z$/, 'Z'), row.estimatedSpeedKmh);
  }
  return map;
}

function primaryDisplay(videoTrip: number): Map<string, number> {
  const rows = JSON.parse(fs.readFileSync(path.join(REF_PKG, 'REFERENCE_ROWS.json'), 'utf8')) as Array<
    Record<string, unknown>
  >;
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.trip !== videoTrip) continue;
    if (r.speed_status !== 'VISIBLE_DISPLAY_VALUE' || r.alternate_time_binding) continue;
    const sp = r.tesla_speed_kmh_primary;
    if (typeof sp === 'number') {
      out.set(String(r.utc_candidate_assuming_offset_plus_02), sp);
    }
  }
  return out;
}

function baselineSamples(grid: unknown[], shadow: Map<string, number | null>) {
  return replayFrozenL3OnGrid(grid as never).map((r) => ({
    label: r.bucketLabelUtc,
    valueKmh: shadow.get(r.bucketLabelUtc) ?? null,
    quality: shadow.get(r.bucketLabelUtc) != null ? 'OK' : 'NO_SUPPORT',
    supportLabels: [],
    supportSpanS: null,
    flags: [],
    estimator: 'B0_PUBLISHED_SHADOW',
  }));
}

function coverageReport(
  baseline: ReturnType<typeof sampleByLabel>,
  c4: ReturnType<typeof sampleByLabel>,
  display: Map<string, number>,
) {
  let kept = 0;
  let changed = 0;
  let added = 0;
  let removed = 0;
  for (const lab of display.keys()) {
    const b = baseline.get(lab)?.valueKmh ?? null;
    const c = c4.get(lab)?.valueKmh ?? null;
    if (b != null && c != null) {
      if (Math.abs(b - c) < 1e-9) kept += 1;
      else changed += 1;
    } else if (b == null && c != null) added += 1;
    else if (b != null && c == null) removed += 1;
  }
  const denom = display.size;
  return {
    displayDenominator: denom,
    keptOnDisplay: kept,
    changedOnDisplay: changed,
    addedOnDisplay: added,
    removedOnDisplay: removed,
    baselineCoverageDisplay: round3(
      [...display.keys()].filter((l) => baseline.get(l)?.valueKmh != null).length / denom,
    ),
    c4CoverageDisplay: round3([...display.keys()].filter((l) => c4.get(l)?.valueKmh != null).length / denom),
  };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

function pyForensicsRatioLegs(trip: number): string[] {
  const out = execSync(
    `python3 -c "import csv; print('|'.join([r['leg_from'] for r in csv.DictReader(open('../forensics/TIMING_JITTER_SUSPECT_LEGS.csv')) if int(r['trip'])==${trip}]))"`,
    { cwd: PY_PROTO, encoding: 'utf8' },
  ).trim();
  return out ? out.split('|') : [];
}

function pyJitterFn(trip: number): string[] {
  const out = execSync(
    `python3 -c "from speed_candidates import jitter_suspect_legs; from common import load_grid; import json; print(json.dumps(sorted(jitter_suspect_legs(load_grid(${trip})).keys())))"`,
    { cwd: PY_PROTO, encoding: 'utf8' },
  );
  return JSON.parse(out) as string[];
}

function main(): void {
  fs.mkdirSync(OUT, { recursive: true });
  const report: Record<string, unknown> = {
    generatedUtc: new Date().toISOString(),
    developmentDataOnly: true,
    utcBinding: 'UNVALIDATED (display local CEST = UTC+2 assumption for reference only)',
    trips: [] as unknown[],
  };

  const jitterDoc: string[] = [
    '# Jitter-Zählung — Abgleich (Entwicklungsresultat)',
    '',
    '| Ebene | Trip 1 | Trip 2 | Bedeutung |',
    '|-------|--------|--------|-----------|',
    '| Forensics `jitter_suspect_legs_ratio_ge_1_5` (Design „13+3“) | 13 | 3 | Alle 1-s-Legs mit Verhältnis ≥1,5 zum lokalen Median (ohne Spike-Pflicht) |',
    '| Forensics-CSV Zeilen | 14 | 3 | 12+2 `TIMING_JITTER_SUSPECT` + `LEG_OUTLIER_NO_GAP` (Trip 1) |',
    '| Algorithmus `jitter_suspect_legs` / TS `detectTimingJitterSuspectLegs` | 5 | 3 | Zusätzlich Spike-Muster (adjacent ROW_ABSENT oder short neighbour) |',
    '| C4-Ausgabelabels ≠ B0 (beide Werte ≠ null) | 5 | 3 | Korrektur nur wo Baseline-L3 und C4-Wert gemeinsam existieren |',
    '',
    'Die acht korrigierten **Ausgabelabels** aus dem Design (5+3 Legs mit Fallback) sind nicht identisch mit 13+3 Forensics-Legs: Forensics zählt ratio≥1,5 ohne Short-Neighbour-Pflicht; C4 korrigiert nur Center-Labels mit C1-Fallback.',
    '',
  ];

  for (const trip of TRIPS) {
    const grid = loadGrid(trip.key);
    const shadow = loadShadow(trip.key);
    const display = primaryDisplay(trip.videoTrip);
    const replay = replayFrozenL3OnGrid(grid as never);
    const exact = analyzeBaselineL3Exactness(replay, shadow, 0.05);
    const c4 = computeC4AdaptiveL3(grid as never);
    const b0Pub = baselineSamples(grid, shadow);
    const b0Raw = replayFrozenL3OnGrid(grid as never).map((r) => ({
      label: r.bucketLabelUtc,
      valueKmh: r.l3SpeedKmh,
      quality: r.l3SpeedKmh != null ? 'OK' : 'NO_SUPPORT',
      supportLabels: [],
      supportSpanS: null,
      flags: [],
      estimator: 'B0_FROZEN_L3_REPLAY',
    }));
    const c4m = sampleByLabel(c4);
    const bPub = sampleByLabel(b0Pub);
    const commonPub = commonSupportMetrics(b0Pub, c4, display);
    const commonRaw = commonSupportMetrics(b0Raw, c4, display);
    const addedOnly = speedMetrics(
      [...display.entries()]
        .filter(([lab]) => bPub.get(lab)?.valueKmh == null && c4m.get(lab)?.valueKmh != null)
        .map(([lab, ref]) => ({ referenceKmh: ref, estimateKmh: c4m.get(lab)!.valueKmh! })),
    );
    const changedLabels = labelsWhereC4DiffersFromFrozenL3(grid as never);
    const fnLegs = [...detectTimingJitterSuspectLegs(grid as never).keys()].sort();
    const csvLegs = pyForensicsRatioLegs(trip.videoTrip).filter((l) => l);
    const pyFn = pyJitterFn(trip.videoTrip);

    (report.trips as unknown[]).push({
      tripKey: trip.key,
      tripId: trip.tripId,
      baselineExactness: exact,
      shadowMismatchesGt005: countFrozenL3ShadowMismatches(replay, shadow, 0.05),
      commonSupportPublishedShadow: commonPub,
      commonSupportFrozenL3Replay: commonRaw,
      additionalSupportVsPublished: addedOnly,
      coverage: coverageReport(bPub, c4m, display),
      c4LabelsValueDiffFromL3Replay: changedLabels,
      jitterAlgorithmLegStarts: fnLegs,
      jitterForensicsCsvLegStarts: csvLegs,
      jitterPythonFnLegStarts: pyFn,
    });

    jitterDoc.push(`## ${trip.key}`);
    jitterDoc.push(`- Algorithmus-Legs: ${fnLegs.join(', ') || '—'}`);
    jitterDoc.push(`- Forensics-CSV leg_from: ${csvLegs.join(', ') || '—'}`);
    jitterDoc.push(`- C4 value≠L3 replay: ${changedLabels.join(', ') || '—'}`);
    jitterDoc.push('');
  }

  fs.writeFileSync(path.join(OUT, 'STEP2_REPORT.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, 'JITTER_RECONCILIATION.md'), jitterDoc.join('\n'));
  fs.writeFileSync(
    path.join(OUT, 'LOOKAHEAD.md'),
    fs.readFileSync('/opt/cursor/artifacts/exp021-motion-core-ts-step1/LOOKAHEAD.md', 'utf8') +
      '\n\n## C4 finalize horizon\n\nInput bucket labels **t−2 … t+2** required to finalize C4 at center **t** (inclusive leg endpoints). Offline/delayed-capable; not live-causal.\n',
  );
  console.log(JSON.stringify({ out: OUT }, null, 2));
}

main();
