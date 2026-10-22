/**
 * EXP021 motion core TS — FSM V0.2 + C4 closure artifacts.
 * cd backend && npx ts-node --transpile-only scripts/test/motion-core-ts-fsm.harness.ts
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

import {
  computeC4AdaptiveL3,
  evaluateZeroRunsForTrip,
  extractMotionFsmStopEpisodes,
  isShadowSpeedGatedOut,
  reconcileShadowGating,
  replayFrozenL3OnGrid,
  runMotionFsmV02,
  type ReferenceRow,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/core';

const OUT = process.env.MOTION_CORE_TS_FSM_OUT ?? '/opt/cursor/artifacts/exp021-motion-core-ts-fsm';
const PHASE5C =
  process.env.EXP021_PHASE5C_ROOT ?? '/opt/cursor/artifacts/exp021-phase5c-tesla-reference-20261021';
const REF_PKG = path.join(PHASE5C, 'reference_package/Tesla_Referenz_20261021');
const PY_FSM = '/opt/cursor/artifacts/exp021-motion-core-design/prototype/motion_fsm.py';
const PY_PROTO = path.dirname(PY_FSM);
const DIMO_RO = '/opt/cursor/artifacts/exp021-motion-core-design/inputs/dimo_readonly';

function loadDimoSparse(videoTrip: number) {
  const p = path.join(DIMO_RO, `TRIP_${videoTrip}_dimo_speed_location_1s.json`);
  if (!fs.existsSync(p)) return [];
  const doc = JSON.parse(fs.readFileSync(p, 'utf8')) as {
    rows: Array<{ timestamp: string; speedAvg: number | null }>;
  };
  return doc.rows
    .filter((r) => r.speedAvg != null)
    .map((r) => ({ label: r.timestamp.replace('.000Z', 'Z'), speedKmh: r.speedAvg as number }));
}

const TRIPS = [
  { key: 'TRIP_1', videoTrip: 1 },
  { key: 'TRIP_2', videoTrip: 2 },
];

function loadGrid(tripKey: string) {
  return JSON.parse(fs.readFileSync(path.join(PHASE5C, 'replay', `${tripKey}_position_grid.json`), 'utf8'))
    .buckets;
}

function loadShadowRows(tripKey: string) {
  const map = new Map<string, { estimatedSpeedKmh: number | null; motionState?: string }>();
  const p = path.join(PHASE5C, 'telemetry/production_export/shadow', `${tripKey}_shadow_intervals.jsonl`);
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as {
      intervalStart: string;
      estimatedSpeedKmh: number | null;
      motionState?: string;
    };
    map.set(new Date(row.intervalStart).toISOString().replace(/\.\d{3}Z$/, 'Z'), row);
  }
  return map;
}

function sha256File(p: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function writeFsmSpec(fsmHash: string | null) {
  const md = `# FSM V0.2 — Spezifikation (Fable Prototyp)

**Ausführbare Quelle:** \`exp021-motion-core-design/prototype/motion_fsm.py\`  
**SHA256:** \`${fsmHash ?? 'n/a'}\`  
**TypeScript:** \`kinematics/motion-fsm.ts\` (\`MOTION_FSM_PARAMS_V0_2_DEV\`)

## Zustände
MOVING | STOP_CANDIDATE | STATIONARY | STARTING | UNKNOWN — siehe \`run_fsm\` / \`runMotionFsmV02\`.

## Schwellen (unverändert, nicht auf Tesla getunt)
- stationär ≤ 3 km/h, fahren ≥ 5 km/h (Hysterese 3–5 km/h)
- \`stop_confirm_s\`=3, \`gap_short_max_s\`=3, \`gap_long_max_s\`=60
- \`reappear_noise_m\`=3, \`lookahead_s\`=5 (nur RETROSPECTIVE)

## Evidenz
DIRECT | INFERRED | INDETERMINATE — getrennt vom Zustand.

## Modi
- **CAUSAL:** nur Vergangenheit/Gegenwart bis Label t
- **RETROSPECTIVE:** \`lookahead_reappear\` bis +5 s für Lückenentscheidungen

## Bekannte Grenze
Langsames Rollen (< 5 km/h) fällt in das stationäre Band — kein CREEPING-Zustand.

## C4-Kette
FSM konsumiert C4 offline; Entscheidungszeit ≠ C4-Verfügbarkeit (t+2…+3 für jitter-gekoppelte Fälle).
`;
  fs.writeFileSync(path.join(OUT, 'FSM_SPEC.md'), md);
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const fsmHash = fs.existsSync(PY_FSM) ? sha256File(PY_FSM) : null;
  writeFsmSpec(fsmHash);

  const parity: Record<string, unknown> = {};

  for (const { key } of TRIPS) {
    const grid = loadGrid(key);
    const tmpIn = `/tmp/mc-parity-${key}.json`;
    const tmpOut = `/tmp/mc-parity-${key}-out.json`;
    fs.writeFileSync(tmpIn, JSON.stringify(grid));
    execSync(
      `python3 -c "import json; from speed_candidates import c4_adaptive_l3; g=json.load(open('${tmpIn}')); o=[{'label':s.label,'value_kmh':s.value_kmh,'quality':s.quality,'support_labels':s.support_labels,'support_span_s':s.support_span_s,'flags':s.flags,'estimator':s.estimator} for s in c4_adaptive_l3(g)]; json.dump(o, open('${tmpOut}','w'))"`,
      { cwd: PY_PROTO, stdio: 'pipe' },
    );
    const py = JSON.parse(fs.readFileSync(tmpOut, 'utf8')) as Array<Record<string, unknown>>;
    const ts = computeC4AdaptiveL3(grid);
    let maxDelta = 0;
    let mism = 0;
    for (let i = 0; i < ts.length; i++) {
      const a = ts[i]!;
      const b = py[i] as Record<string, unknown>;
      if (a.quality !== b.quality || JSON.stringify(a.supportLabels) !== JSON.stringify(b.support_labels)) {
        mism += 1;
      }
      if (a.valueKmh != null && b.value_kmh != null) {
        maxDelta = Math.max(maxDelta, Math.abs(a.valueKmh - (b.value_kmh as number)));
      }
    }
    parity[key] = { labelCount: ts.length, qualityOrSupportMismatches: mism, maxAbsDeltaKmh: maxDelta, pass: mism === 0 && maxDelta <= 1e-6 };
  }

  const shadowGating: Record<string, unknown> = {};
  for (const { key } of TRIPS) {
    const grid = loadGrid(key);
    const rec = reconcileShadowGating(replayFrozenL3OnGrid(grid), computeC4AdaptiveL3(grid), loadShadowRows(key));
    const gated = rec.rows.filter((r) => r.category === 'SHADOW_NULL_L3_ONLY');
    shadowGating[key] = {
      ...rec.summary,
      gatedExplainedByMotionState: gated.filter((r) => isShadowSpeedGatedOut(r.shadowMotionState)).length,
      gatedTotal: gated.length,
      c4AddsCoverageLabels: rec.rows.filter((r) => r.c4AddsCoverage).length,
    };
  }

  const zeroRuns = JSON.parse(fs.readFileSync(path.join(REF_PKG, 'ZERO_DISPLAY_RUNS.json'), 'utf8'));
  const refs = JSON.parse(fs.readFileSync(path.join(REF_PKG, 'REFERENCE_ROWS.json'), 'utf8')) as ReferenceRow[];
  const refById = new Map<string, ReferenceRow>(refs.map((r) => [r.sample_id, r]));

  const zeroEval: unknown[] = [];
  for (const { key, videoTrip } of TRIPS) {
    const grid = loadGrid(key);
    const c4 = computeC4AdaptiveL3(grid);
    const sparse = loadDimoSparse(videoTrip);
    const causal = runMotionFsmV02(grid, c4, 'CAUSAL', sparse);
    const retro = runMotionFsmV02(grid, c4, 'RETROSPECTIVE', sparse);
    const epsC = extractMotionFsmStopEpisodes(videoTrip, causal, 'CAUSAL');
    const epsR = extractMotionFsmStopEpisodes(videoTrip, retro, 'RETROSPECTIVE');
    zeroEval.push(
      ...evaluateZeroRunsForTrip(
        videoTrip,
        zeroRuns,
        refById,
        loadShadowRows(key),
        causal,
        retro,
        epsC,
        epsR,
      ),
    );
  }

  const evaluable = zeroEval.filter(
    (z: { excludedReason: string | null }) => !z.excludedReason,
  ) as Array<{ causalC4MatchedEpisode: boolean; retrospectiveC4MatchedEpisode: boolean }>;
  const causalMatched = evaluable.filter((z) => z.causalC4MatchedEpisode).length;
  const retroMatched = evaluable.filter((z) => z.retrospectiveC4MatchedEpisode).length;

  const report = {
    generatedUtc: new Date().toISOString(),
    developmentDataOnly: true,
    fableModel: { version: 'MOTION_FSM_V0_2_DEV', motionFsmPySha256: fsmHash },
    c4PythonTsParity: parity,
    shadowGatingReconciliation: shadowGating,
    zeroDisplayRuns: {
      totalListed: zeroRuns.length,
      excludedNoBucket: zeroEval.filter((z: { excludedReason: string | null }) => z.excludedReason === 'NO_BUCKET')
        .length,
      evaluable: evaluable.length,
      causalC4Matched: causalMatched,
      retrospectiveC4Matched: retroMatched,
      rows: zeroEval,
    },
    twelveRunsList: zeroRuns.map((z: { trip: number; first_display_time: string; last_display_time: string }) => ({
      trip: z.trip,
      display: `${z.first_display_time}..${z.last_display_time}`,
    })),
  };

  fs.writeFileSync(path.join(OUT, 'FSM_STEP_REPORT.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out: OUT, causalMatched, retroMatched, evaluable: evaluable.length }, null, 2));
}

main();
