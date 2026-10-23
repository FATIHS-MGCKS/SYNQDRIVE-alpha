#!/usr/bin/env node
'use strict';
/**
 * Offline C5 PTQ V0 vs production-parity C4 regression (pinned DI @ 579ee8b2 worktree HEAD).
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const L = require('../../ds4-speed-video-reference-20261023/scripts/eval_lib.cjs');
const E = require('../../ds4-accel-brake-video-reference-20261023/scripts/event_eval_lib.cjs');
const R = require('../../ds4-accel-brake-video-reference-20261023/scripts/replay_event_eval.cjs');
const C5 = require('./c5-ptq-v0.cjs');

const evalRoot = path.resolve(__dirname, '..');
const thisRepo = path.resolve(evalRoot, '../../../..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const codeRoot = path.resolve(opt('--code-root', thisRepo));
const expectSha = opt('--expect-sha', '579ee8b2fed06593d7d2aa57cffb6036dbf53a24');
const outDir = path.join(evalRoot, 'outputs');
fs.mkdirSync(outDir, { recursive: true });

const DI = 'backend/src/modules/vehicle-intelligence/driving-intelligence';
const codeSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: codeRoot }).toString().trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--', DI], { cwd: codeRoot }).toString().trim();
if (dirty) throw new Error(`DI not clean in ${codeRoot}`);
if (!codeSha.startsWith(expectSha.slice(0, 7)) && codeSha !== expectSha) {
  console.warn(`WARN: code SHA ${codeSha} != expected prefix ${expectSha.slice(0, 12)}`);
}

const core = C5.loadCore(codeRoot);
const PROD_PIN = expectSha;

function gridHas(buckets, sec) {
  return buckets.some((b) => L.secOf(b.bucketLabelUtc) === sec);
}

function seriesFromSamples(samples) {
  const m = new Map(samples.map((s) => [L.secOf(s.label), s]));
  return (sec) => m.get(sec) ?? null;
}

function coverageLossReason(sample) {
  if (!sample) return 'NO_ROW';
  if (sample.quality === 'NO_POSITION') return 'NO_POSITION';
  if (sample.quality === 'OUTLIER_REJECTED') {
    if (sample.flags.some((f) => f.includes('IMPLAUSIBLE'))) return 'HARD_TELEPORT_QUARANTINE';
    if (sample.flags.some((f) => f.includes('OUTLIER'))) return 'POSITION_OUTLIER_QUARANTINE';
    return 'OUTLIER_REJECTED';
  }
  if (sample.quality === 'FROZEN_POSITION') return 'FROZEN_POSITION';
  if (sample.quality === 'NO_SUPPORT') {
    if (sample.flags.some((f) => f.includes('INSUFFICIENT'))) return 'PTQ_INSUFFICIENT_SUPPORT';
    if (sample.attribution === 'INCONSISTENT_UNATTRIBUTED') return 'PTQ_INCONSISTENT_UNATTRIBUTED';
    return 'PTQ_NO_SUPPORT';
  }
  if (sample.valueKmh == null) return 'NULL_VALUE';
  return 'OTHER';
}

function compareAlgorithms(drive) {
  const c4 = core.computeC4AdaptiveL3(drive.buckets);
  const { samples: c5, meta: c5Meta } = C5.computeC5PtqV0(drive.buckets, undefined, codeRoot);
  const c4By = seriesFromSamples(c4);
  const c5By = seriesFromSamples(c5);
  const refRows = drive.refRows.map((r) => ({ ...r, phase: L.phaseOf(new Map(drive.refRows.map((x) => [x.sec, x.ref])), r.sec) }));
  const grid = (sec) => gridHas(drive.buckets, sec);

  const c4Eval = L.speedEvaluation(refRows, (s) => c4By(s)?.valueKmh ?? null, grid);
  const c5Eval = L.speedEvaluation(refRows, (s) => c5By(s)?.valueKmh ?? null, grid);
  const common = L.commonSupport(refRows, (s) => c4By(s)?.valueKmh ?? null, (s) => c5By(s)?.valueKmh ?? null);

  const readableSecs = refRows.filter((r) => r.ref != null && grid(r.sec));
  const c4Paired = new Set(c4Eval.pairedSecs);
  const c5Paired = new Set(c5Eval.pairedSecs);
  const gained = [];
  const lost = [];
  for (const r of readableSecs) {
    const c4n = c4By(r.sec)?.valueKmh != null;
    const c5n = c5By(r.sec)?.valueKmh != null;
    if (c5n && !c4n) gained.push({ sec: r.sec, label: L.labelOf(r.sec * 1000), ref: r.ref, c5: c5By(r.sec).valueKmh, reason: 'C5_NUMERIC_C4_NULL' });
    if (c4n && !c5n) {
      lost.push({
        sec: r.sec,
        label: L.labelOf(r.sec * 1000),
        ref: r.ref,
        c4: c4By(r.sec).valueKmh,
        reason: coverageLossReason(c5By(r.sec)),
        attribution: c5By(r.sec)?.attribution,
        flags: c5By(r.sec)?.flags,
      });
    }
  }

  const quarantineC4 = new Set(c4.filter((s) => s.quality === 'OUTLIER_REJECTED').map((s) => s.label));
  const quarantineC5 = new Set(c5.filter((s) => s.quality === 'OUTLIER_REJECTED').map((s) => s.label));
  const quarantineParity = quarantineC4.size === quarantineC5.size && [...quarantineC4].every((l) => quarantineC5.has(l));

  const unknownShare = readableSecs.length
    ? c5.filter((s) => {
        const sec = L.secOf(s.label);
        return grid(sec) && readableSecs.some((r) => r.sec === sec) && (s.valueKmh == null || s.quality === 'NO_SUPPORT');
      }).length / readableSecs.length
    : 0;

  const attributionHist = {};
  for (const s of c5) {
    const a = s.attribution || 'NA';
    attributionHist[a] = (attributionHist[a] || 0) + 1;
  }

  const eventsC4 = core.detectMotionManoeuvreEvents(0, c4, 'C4_ADAPTIVE_L3', R.GUARDS.usableQualities, R.OPTIONS);
  const eventsC5 = core.detectMotionManoeuvreEvents(0, c5, 'C5_PTQ_V0', C5.C5_EVENT_USABLE_QUALITIES, R.OPTIONS);

  const motionC4 = L.motionClaimEvaluation(refRows, (s) => L.c4Claim(c4By(s)?.valueKmh ?? null));
  const motionC5 = L.motionClaimEvaluation(refRows, (s) => L.c4Claim(c5By(s)?.valueKmh ?? null));

  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 5; i++) C5.computeC5PtqV0(drive.buckets, undefined, codeRoot);
  const t1 = process.hrtime.bigint();
  const runtimeMsPerRun = Number(t1 - t0) / 1e6 / 5;

  return {
    id: drive.id,
    c4,
    c5,
    c5Meta,
    c4Eval,
    c5Eval,
    common,
    gained,
    lost,
    quarantineParity,
    quarantineC4Count: quarantineC4.size,
    unknownShare: L.round(unknownShare, 4),
    attributionHist,
    eventsC4,
    eventsC5,
    motionC4,
    motionC5,
    runtimeMsPerRun,
    refRows,
  };
}

function tes16CriticalWindow(result) {
  const from = L.secOf('2026-10-16T03:50:16Z');
  const to = L.secOf('2026-10-16T03:50:26Z');
  const rows = [];
  for (let s = from; s <= to; s++) {
    const ref = result.refRows.find((r) => r.sec === s)?.ref;
    const c4 = result.c4.find((x) => L.secOf(x.label) === s);
    const c5 = result.c5.find((x) => L.secOf(x.label) === s);
    if (ref == null) continue;
    rows.push({
      sec: s,
      ref,
      c4: c4?.valueKmh,
      c5: c5?.valueKmh,
      c5q: c5?.quality,
      errC4: c4?.valueKmh != null ? Math.abs(c4.valueKmh - ref) : null,
      errC5: c5?.valueKmh != null ? Math.abs(c5.valueKmh - ref) : null,
    });
  }
  const numeric = rows.filter((r) => r.c5 != null);
  const maxErrC5 = numeric.length ? Math.max(...numeric.map((r) => r.errC5)) : null;
  const falseAccelC4 = result.eventsC4.filter((e) => e.kind === 'ACCELERATION' && L.secOf(e.startLabel) >= L.secOf('2026-10-16T03:50:20Z') && L.secOf(e.endLabel) <= L.secOf('2026-10-16T03:50:23Z'));
  const falseAccelC5 = result.eventsC5.filter((e) => e.kind === 'ACCELERATION' && L.secOf(e.startLabel) >= L.secOf('2026-10-16T03:50:20Z') && L.secOf(e.endLabel) <= L.secOf('2026-10-16T03:50:23Z'));
  return { rows, maxErrC5, falseAccelC4, falseAccelC5 };
}

function tig22_1904(result) {
  const from = L.secOf('2026-10-22T19:04:30Z');
  const to = L.secOf('2026-10-22T19:04:53Z');
  const pt37 = result.c5.find((s) => s.label === '2026-10-22T19:04:37Z');
  const eventsC4 = result.eventsC4.filter((e) => {
    const s = L.secOf(e.startLabel);
    return s >= from && s <= to;
  });
  const eventsC5 = result.eventsC5.filter((e) => {
    const s = L.secOf(e.startLabel);
    return s >= from && s <= to;
  });
  return { pt37Quality: pt37?.quality, pt37Flags: pt37?.flags, eventsC4, eventsC5, note: '19:04 events not auto-scored (no video after 19:03:02)' };
}

function acceptanceGates(results) {
  const gates = [];
  for (const r of results) {
    const covC4 = r.c4Eval.coverage.pairedShareOfReadable;
    const covC5 = r.c5Eval.coverage.pairedShareOfReadable;
    gates.push({
      drive: r.id,
      gate: 'coverage_delta_pp',
      pass: covC5 >= covC4 - 0.01,
      detail: { covC4, covC5, deltaPp: L.round((covC5 - covC4) * 100, 2) },
    });
    const maeC4 = r.common.a?.maeKmh;
    const maeC5 = r.common.b?.maeKmh;
    gates.push({
      drive: r.id,
      gate: 'common_mae',
      pass: maeC5 != null && maeC4 != null && maeC5 <= maeC4 + 0.1,
      detail: { n: r.common.n, maeC4, maeC5 },
    });
    const p95C4 = r.common.a?.p95AbsKmh;
    const p95C5 = r.common.b?.p95AbsKmh;
    gates.push({
      drive: r.id,
      gate: 'common_p95',
      pass: p95C5 != null && p95C4 != null && p95C5 <= p95C4 + 0.2,
      detail: { p95C4, p95C5 },
    });
    gates.push({
      drive: r.id,
      gate: 'teleport_quarantine_parity',
      pass: r.quarantineParity,
      detail: { count: r.quarantineC4Count },
    });
  }
  const tes = results.find((x) => x.id === 'TES16');
  if (tes) {
    const crit = tes16CriticalWindow(tes);
    gates.push({
      drive: 'TES16',
      gate: 'false_accel_035020_23_removed',
      pass: crit.falseAccelC5.length === 0 && crit.falseAccelC4.length > 0,
      detail: { c4Events: crit.falseAccelC4.length, c5Events: crit.falseAccelC5.length },
    });
    const numericCrit = crit.rows.filter((r) => r.c5 != null);
    const maxErr = numericCrit.length ? Math.max(...numericCrit.map((r) => r.errC5)) : null;
    gates.push({
      drive: 'TES16',
      gate: 'critical_numeric_max_err_8kmh',
      pass: maxErr != null && maxErr <= 8,
      detail: { maxErrC5: maxErr, seconds: numericCrit.map((r) => r.sec) },
    });
  }
  const allPass = gates.every((g) => g.pass);
  return { gates, allPass };
}

function runSynthetics() {
  const baseLat = 52.52;
  const baseLon = 13.405;
  const lab = (i) => L.labelOf((1700000000 + i) * 1000);
  const mk = (i, latOff, lonOff = 0) => ({
    bucketLabelUtc: lab(i),
    availability: 'PRESENT',
    latitude: baseLat + latOff * 1e-4,
    longitude: baseLon + lonOff * 1e-4,
  });
  const cases = [];
  // constant ~100 km/h straight
  {
    const buckets = [];
    for (let i = 0; i < 12; i++) buckets.push(mk(i, i * 0.0278)); // ~27.8m/s * 1s in lat approx
    const { samples } = C5.computeC5PtqV0(buckets, undefined, codeRoot);
    const mid = samples[6];
    cases.push({ name: 'constant_speed', ok: mid.valueKmh != null && mid.valueKmh > 90 && mid.valueKmh < 110 });
  }
  // time-mislabeled interior (stretch one leg)
  {
    const buckets = [];
    for (let i = 0; i < 10; i++) {
      if (i === 5) buckets.push(mk(i, i * 0.0278 + 0.05));
      else buckets.push(mk(i, i * 0.0278));
    }
    const { samples, meta } = C5.computeC5PtqV0(buckets, undefined, codeRoot);
    const sus = meta.presentAttribution.filter((p) => p.suspect);
    cases.push({ name: 'time_mislabel_or_outlier', ok: samples.every((s) => s.quality !== 'OUTLIER_REJECTED' || s.flags.includes('HARD_QUARANTINE_PARITY_C4')) });
  }
  // missing bucket ROW_ABSENT
  {
    const buckets = [];
    for (let i = 0; i < 8; i++) {
      if (i === 4) buckets.push({ bucketLabelUtc: lab(i), availability: 'ROW_ABSENT', latitude: null, longitude: null });
      else buckets.push(mk(i, i * 0.02));
    }
    const { samples } = C5.computeC5PtqV0(buckets, undefined, codeRoot);
    const absent = samples.find((s) => L.secOf(s.label) === L.secOf(lab(4)));
    cases.push({ name: 'missing_bucket', ok: absent.valueKmh == null && absent.quality === 'NO_POSITION' });
  }
  return cases;
}

const drives = R.loadDrives();
const results = drives.map(compareAlgorithms);
const synth = runSynthetics();
const acceptance = acceptanceGates(results);

const summary = {
  generatedAt: new Date().toISOString(),
  codeRoot,
  codeSha,
  productionPin: PROD_PIN,
  c5Version: C5.MOTION_CORE_SPEED_C5_PTQ_V0_VERSION,
  c4Version: core.MOTION_CORE_SPEED_C4_VERSION,
  frozen: C5.PTQ_FROZEN,
  lookaheadS: C5.PTQ_FROZEN.lookaheadS,
  drives: results.map((r) => ({
    id: r.id,
    c4: r.c4Eval.all,
    c5: r.c5Eval.all,
    coverage: { c4: r.c4Eval.coverage, c5: r.c5Eval.coverage },
    common: r.common,
    lostCount: r.lost.length,
    gainedCount: r.gained.length,
    unknownShare: r.unknownShare,
    runtimeMsPerRun: L.round(r.runtimeMsPerRun, 2),
    quarantineParity: r.quarantineParity,
  })),
  synthetics: synth,
  acceptance,
  tes16: results.find((x) => x.id === 'TES16') ? tes16CriticalWindow(results.find((x) => x.id === 'TES16')) : null,
  tig22: results.find((x) => x.id === 'TIG22') ? tig22_1904(results.find((x) => x.id === 'TIG22')) : null,
};

fs.writeFileSync(path.join(outDir, 'c5_regression_summary.json'), JSON.stringify(summary, null, 2));

// CSV matrix
const csvRows = [];
for (const r of results) {
  csvRows.push({
    drive: r.id,
    algo: 'C4',
    mae: r.c4Eval.all.maeKmh,
    median: r.c4Eval.all.medianAbsKmh,
    p95: r.c4Eval.all.p95AbsKmh,
    max: r.c4Eval.all.maxAbsKmh,
    coverage_paired: r.c4Eval.coverage.paired,
    coverage_readable: r.c4Eval.coverage.readable,
    coverage_share: r.c4Eval.coverage.pairedShareOfReadable,
    common_n: r.common.n,
    common_mae: r.common.a?.maeKmh,
    common_p95: r.common.a?.p95AbsKmh,
  });
  csvRows.push({
    drive: r.id,
    algo: 'C5',
    mae: r.c5Eval.all.maeKmh,
    median: r.c5Eval.all.medianAbsKmh,
    p95: r.c5Eval.all.p95AbsKmh,
    max: r.c5Eval.all.maxAbsKmh,
    coverage_paired: r.c5Eval.coverage.paired,
    coverage_readable: r.c5Eval.coverage.readable,
    coverage_share: r.c5Eval.coverage.pairedShareOfReadable,
    common_n: r.common.n,
    common_mae: r.common.b?.maeKmh,
    common_p95: r.common.b?.p95AbsKmh,
  });
}
fs.writeFileSync(
  path.join(evalRoot, 'C5_REGRESSION_MATRIX.csv'),
  L.toCsv(csvRows, ['drive', 'algo', 'mae', 'median', 'p95', 'max', 'coverage_paired', 'coverage_readable', 'coverage_share', 'common_n', 'common_mae', 'common_p95']),
);

for (const r of results) {
  fs.writeFileSync(path.join(outDir, `${r.id}_lost_seconds.json`), JSON.stringify(r.lost, null, 2));
  fs.writeFileSync(path.join(outDir, `${r.id}_c5_series.json`), JSON.stringify(r.c5.map((s) => ({ label: s.label, v: s.valueKmh, q: s.quality, a: s.attribution })), null, 2));
  fs.writeFileSync(
    path.join(outDir, `${r.id}_motion_events.json`),
    JSON.stringify({
      motionC4: r.motionC4,
      motionC5: r.motionC5,
      eventsC4: r.eventsC4.map((e) => ({ kind: e.kind, start: e.startLabel, end: e.endLabel, delta: e.deltaKmh, quality: e.quality })),
      eventsC5: r.eventsC5.map((e) => ({ kind: e.kind, start: e.startLabel, end: e.endLabel, delta: e.deltaKmh, quality: e.quality })),
    }, null, 2),
  );
}

console.log(JSON.stringify({ ok: true, acceptance: acceptance.allPass, drives: summary.drives.map((d) => d.id) }, null, 2));

module.exports = { results, summary, acceptance, synth };
