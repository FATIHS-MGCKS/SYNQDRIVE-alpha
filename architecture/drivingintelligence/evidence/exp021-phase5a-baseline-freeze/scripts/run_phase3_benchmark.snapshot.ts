/**
 * EXP021 Phase 3 — real-drive benchmark (4 physical drives incl. one unseen), oscillation metrics,
 * switch classification, calibration, cross-run reproducibility vs Phase-2 per-bucket outputs.
 *
 * cd /workspace/.worktrees/di-master-architecture-research-20261021/backend && \
 *   node --expose-gc -r ts-node/register/transpile-only /opt/cursor/artifacts/exp021-scientific-audit-phase3/scripts/run_phase3_benchmark.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  ART, MODEL_DESCRIPTIONS, baselineHeadings, calibrationRows, computeMetrics, guardedHeadings, haversine, inputStationaryLabels,
  loadTeslaLdi10d, loadTesla, loadTiguan, oscillationMetrics, parseCsv, runModel, toCsv,
  type Bucket, type DriveContext, type GtMap, type Match, type ModelId, type ModelRun,
} from './phase3_lib';

const OUT = path.join(ART, 'exp021-scientific-audit-phase3/results');
const MODELS: ModelId[] = ['M1', 'M1P1', 'M2', 'M4', 'M5', 'M5ABST', 'M7A', 'M7', 'M7C', 'M7ABST', 'M8'];

type SwitchClass = { model: string; drive: string; switches: number; subMetre: number; lowSpeedLt10: number; returnWithin5s: number; gtLegit: number; gtWrong: number; gtNone: number; gtOldStillValid: number };

function classifySwitches(ctx: DriveContext, m: Match[], gt: GtMap | null): SwitchClass {
  const b = ctx.buckets;
  const r: SwitchClass = { model: '', drive: ctx.name, switches: 0, subMetre: 0, lowSpeedLt10: 0, returnWithin5s: 0, gtLegit: 0, gtWrong: 0, gtNone: 0, gtOldStillValid: 0 };
  for (let i = 1; i < b.length; i++) {
    const p = b[i - 1], c = b[i];
    if (p.availability !== 'PRESENT' || c.availability !== 'PRESENT' || p.latitude == null || c.latitude == null) continue;
    const a = m[i - 1].osmWayId, w = m[i].osmWayId;
    if (a == null || w == null || a === w) continue;
    r.switches++;
    if (haversine(p.latitude, p.longitude!, c.latitude, c.longitude!) < 2) r.subMetre++;
    if (c.l3SpeedKmh != null && c.l3SpeedKmh < 10) r.lowSpeedLt10++;
    for (let k = i + 1; k <= Math.min(b.length - 1, i + 5); k++) {
      if (b[k].availability !== 'PRESENT') break;
      const wk = m[k].osmWayId;
      if (wk === a) { r.returnWithin5s++; break; }
      if (wk !== w) break;
    }
    const ref = gt?.get(c.bucketLabelUtc);
    if (!ref || !ref.size) r.gtNone++;
    else if (!ref.has(w)) r.gtWrong++;
    else if (ref.has(a)) r.gtOldStillValid++; // both old and new in the GT list of this second (segment-boundary ambiguity)
    else r.gtLegit++;
  }
  return r;
}

function headingOnIdenticalFixes(buckets: Bucket[], headings: (number | null)[]): number {
  let n = 0;
  for (let i = 1; i < buckets.length; i++) {
    const p = buckets[i - 1], c = buckets[i];
    if (p.availability !== 'PRESENT' || c.availability !== 'PRESENT' || p.latitude == null || c.latitude == null) continue;
    if (p.latitude === c.latitude && p.longitude === c.longitude && headings[i] != null) n++;
  }
  return n;
}

function perBucketHash(m: Match[]): string {
  return crypto.createHash('sha256').update(m.map((x) => `${x.bucketLabelUtc}|${x.osmWayId ?? ''}|${x.outcome}`).join('\n')).digest('hex');
}

function main() {
  const metricsRows: any[] = [];
  const oscRows: any[] = [];
  const switchRows: any[] = [];
  const calibRows: any[] = [];
  const perBucket: Record<string, any[]> = {};
  const repro: any = {};
  const summary: any = { generatedAtUtc: new Date().toISOString(), models: Object.fromEntries(MODELS.map((m) => [m, MODEL_DESCRIPTIONS[m]])), drives: {} };

  const tig = loadTiguan();
  const t1 = loadTesla('TRIP_1');
  const t2 = loadTesla('TRIP_2');
  const ldi = loadTeslaLdi10d();
  const drives: { ctx: DriveContext; gt: GtMap | null; role: string; extraStationary?: Set<string>; sha: any }[] = [
    { ctx: tig.ctx, gt: tig.gt, role: 'DEVELOPMENT_SET (used to design M7A/M7 in Phase 2; video GT PROXY_ONLY)', sha: tig.sha },
    { ctx: t1.ctx, gt: null, role: 'SEEN_IN_PHASE2_NO_GT (driver-reported anchors only)', sha: t1.sha },
    { ctx: t2.ctx, gt: null, role: 'SEEN_IN_PHASE2_NO_GT', sha: t2.sha },
    { ctx: ldi.ctx, gt: null, role: 'UNSEEN_PHYSICAL_DRIVE_NO_ROAD_GT (PHYS-TESLA-20261016; tacho video = stop evidence only)', sha: ldi.sha, extraStationary: new Set([...ldi.tacho.entries()].filter(([, v]) => v === 0).map(([k]) => k)) },
  ];

  for (const d of drives) {
    const { ctx } = d;
    const h = baselineHeadings(ctx.buckets);
    const statInput = inputStationaryLabels(ctx.buckets);
    const stat = new Set<string>([...statInput, ...(d.extraStationary ?? [])]);
    const presentStationaryTacho = d.extraStationary ? ctx.buckets.filter((b) => b.availability === 'PRESENT' && d.extraStationary!.has(b.bucketLabelUtc)).length : null;
    console.log(`\n=== ${ctx.name} (${d.role}) present=${ctx.buckets.filter((b) => b.availability === 'PRESENT').length} stationaryInput=${statInput.size} tachoZeroPresent=${presentStationaryTacho}`);
    const runs: ModelRun[] = [];
    const rows: any[] = [];
    for (const m of MODELS) {
      const r = runModel(ctx, m, h);
      runs.push(r);
      const met = computeMetrics(ctx, r, d.gt, stat);
      const osc = oscillationMetrics(ctx, r.matches, stat);
      const usedHeadings = m === 'M7A' || m === 'M7' || m === 'M8' || m === 'M7ABST' ? guardedHeadings(ctx.buckets, h) : m === 'M7C' ? guardedHeadings(ctx.buckets, h, 1.5, null) : h;
      const hid = headingOnIdenticalFixes(ctx.buckets, usedHeadings);
      const confirmedCorrect = met.confirmedRecallOfGt != null ? Math.round(met.confirmedRecallOfGt * met.gtComparable) : null;
      const row = {
        suite: 'REAL_DRIVE', drive: ctx.name, role: d.role.split(' ')[0], model: m, variant: 'PINNED', sigma_m: 0, seed: '',
        gt_comparable: met.gtComparable, gt_correct: met.gtCorrect, gt_conflict: met.gtConflict, gt_abstained: met.gtAbstained,
        accuracy_among_decided: met.accuracyAmongDecided == null ? '' : met.accuracyAmongDecided.toFixed(4),
        false_confirmed: met.falseConfirmed, confirmed_correct: confirmedCorrect ?? '', confirmed_precision: met.confirmedPrecision == null ? '' : met.confirmedPrecision.toFixed(4),
        confirmed: met.confirmed, ambiguous: met.ambiguous, unknown: met.unknown, decided: met.decided, present: met.bucketsPresent,
        coverage_confirmed: (met.confirmed / met.bucketsPresent).toFixed(4), coverage_decided: (met.decided / met.bucketsPresent).toFixed(4),
        way_changes: met.wayChanges, directed_unsupported: met.transitionsDirectedUnsupported, direction_forbidden: met.transitionsDirectionForbidden,
        route_not_found: met.transitionsRouteNotFound, time_implausible: met.transitionsTimeImplausible, across_null: met.wayChangesAcrossNull, across_null_bad: met.acrossNullUnsupportedOrImplausible,
        impossible_sum: met.transitionsDirectedUnsupported + met.transitionsTimeImplausible + met.acrossNullUnsupportedOrImplausible,
        way_changes_stationary: met.wayChangesDuringStationary, heading_on_identical_fixes: hid,
        path_km: osc.pathKm, switches_per_km: osc.switchesPerKm ?? '', stationary_seconds: osc.stationarySeconds, switches_stationary: osc.switchesStationary,
        switches_per_stationary_min: osc.switchesPerStationaryMinute ?? '', switches_low_speed: osc.switchesLowSpeed, returns_within_5s: osc.returnsWithin5s,
        switches_submetre_disp: osc.switchesSubMetreDisp, mean_run_length_s: osc.meanRunLengthS ?? '', null_episodes: osc.nullEpisodes,
        cpu_ms: met.cpuMs, heap_delta_mb: met.heapDeltaMb,
        evidence_class: d.gt ? 'VIDEO_SEGMENT_GT_DEVELOPMENT_SET' : 'NO_ROAD_GT_BEHAVIOURAL_ONLY',
      };
      metricsRows.push(row);
      rows.push(row);
      oscRows.push({ drive: ctx.name, model: m, ...osc });
      switchRows.push({ ...classifySwitches(ctx, r.matches, d.gt), model: m });
      if (d.gt) calibRows.push(...calibrationRows(ctx, r, d.gt, 'PINNED'));
      console.log(`${m.padEnd(7)} GT ${met.gtCorrect}/${met.gtConflict}/${met.gtAbstained} fC ${met.falseConfirmed} C/A/U ${met.confirmed}/${met.ambiguous}/${met.unknown} chg ${met.wayChanges} imp ${row.impossible_sum} statChg ${met.wayChangesDuringStationary} sw/km ${osc.switchesPerKm} sw/statmin ${osc.switchesPerStationaryMinute} ret5 ${osc.returnsWithin5s} sub ${osc.switchesSubMetreDisp} hid ${hid} cpu ${met.cpuMs}`);
    }
    // per-bucket
    const pb: any[] = [];
    for (let i = 0; i < ctx.buckets.length; i++) {
      const b = ctx.buckets[i];
      const row: any = { bucket: b.bucketLabelUtc, gps: b.availability, l3: b.l3SpeedKmh ?? '', heading: h[i] == null ? '' : h[i]!.toFixed(1), stationary: stat.has(b.bucketLabelUtc) ? 1 : 0, gtWays: d.gt ? [...(d.gt.get(b.bucketLabelUtc) ?? [])].join('|') : '' };
      for (const r of runs) { row[`${r.model}_way`] = r.matches[i].osmWayId ?? ''; row[`${r.model}_out`] = r.matches[i].outcome; }
      const m7 = runs.find((r) => r.model === 'M7')!, m8 = runs.find((r) => r.model === 'M8')!;
      row.M7_margin = m7.matches[i].pathMargin == null ? '' : m7.matches[i].pathMargin === Infinity ? 'inf' : m7.matches[i].pathMargin!.toFixed(1);
      row.M8_pmax = m8.matches[i].posteriorMax == null ? '' : m8.matches[i].posteriorMax!.toFixed(3);
      pb.push(row);
    }
    perBucket[ctx.name] = pb;
    fs.writeFileSync(path.join(OUT, `${ctx.name.toLowerCase()}_per_bucket_models.csv`), toCsv(pb));
    // reproducibility: hashes + comparison with Phase-2 per-bucket outputs
    const hashes = Object.fromEntries(runs.map((r) => [r.model, perBucketHash(r.matches)]));
    let phase2Compare: any = null;
    const p2name = ctx.name === 'TIGUAN_20261019' ? 'tiguan_per_bucket_models.csv' : ctx.name === 'TESLA_TRIP_1' ? 'tesla_trip_1_per_bucket_models.csv' : ctx.name === 'TESLA_TRIP_2' ? 'tesla_trip_2_per_bucket_models.csv' : null;
    if (p2name) {
      const p2 = parseCsv(fs.readFileSync(path.join(ART, 'exp021-scientific-audit-phase2/results', p2name), 'utf8'));
      phase2Compare = {};
      for (const m of ['M1', 'M1P1', 'M2', 'M4', 'M5', 'M7A', 'M7', 'M8'] as const) {
        const r = runs.find((x) => x.model === m)!;
        let diffWay = 0, diffOut = 0;
        for (let i = 0; i < ctx.buckets.length; i++) {
          const w = r.matches[i].osmWayId == null ? '' : String(r.matches[i].osmWayId);
          if (p2[i][`${m}_way`] !== w) diffWay++;
          if (p2[i][`${m}_out`] !== r.matches[i].outcome) diffOut++;
        }
        phase2Compare[m] = { diffWay, diffOut, identical: diffWay === 0 && diffOut === 0 };
      }
    }
    repro[ctx.name] = { perBucketSha256: hashes, phase2PerBucketComparison: phase2Compare, inputSha: d.sha };
    summary.drives[ctx.name] = { role: d.role, present: ctx.buckets.filter((b) => b.availability === 'PRESENT').length, ways: ctx.ways.length, stationaryInput: statInput.size, tachoZeroPresent: presentStationaryTacho, rows };
  }

  // Second in-process execution of Tiguan for determinism (G6)
  {
    const ctx = tig.ctx;
    const h = baselineHeadings(ctx.buckets);
    const second: any = {};
    for (const m of ['M5', 'M7A', 'M7', 'M8'] as const) second[m] = perBucketHash(runModel(ctx, m, h).matches);
    repro.TIGUAN_20261019.secondExecutionIdentical = Object.entries(second).every(([m, hsh]) => repro.TIGUAN_20261019.perBucketSha256[m] === hsh);
    repro.TIGUAN_20261019.secondExecutionSha256 = second;
  }

  fs.writeFileSync(path.join(OUT, 'real_drive_metrics.csv'), toCsv(metricsRows));
  fs.writeFileSync(path.join(OUT, 'oscillation_metrics.csv'), toCsv(oscRows));
  fs.writeFileSync(path.join(OUT, 'switch_classification.csv'), toCsv(switchRows));
  fs.writeFileSync(path.join(OUT, 'calibration_tiguan_pinned.csv'), toCsv(calibRows));
  fs.writeFileSync(path.join(OUT, 'reproducibility.json'), JSON.stringify(repro, null, 2));
  fs.writeFileSync(path.join(OUT, 'real_drive_summary.json'), JSON.stringify(summary, null, 2));
  console.log('\nREPRO', JSON.stringify(Object.fromEntries(Object.entries(repro).map(([k, v]: any) => [k, { phase2: v.phase2PerBucketComparison, second: v.secondExecutionIdentical }])), null, 1));
  console.table(switchRows);
}
main();
