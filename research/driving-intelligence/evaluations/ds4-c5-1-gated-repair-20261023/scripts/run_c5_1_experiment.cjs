#!/usr/bin/env node
'use strict';
/**
 * C5.1 offline experiment — single authoritative output: c5_1_experiment_summary.json
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const L = require('../../ds4-speed-video-reference-20261023/scripts/eval_lib.cjs');
const E = require('../../ds4-accel-brake-video-reference-20261023/scripts/event_eval_lib.cjs');
const R = require('../../ds4-accel-brake-video-reference-20261023/scripts/replay_event_eval.cjs');
const C51 = require('./c5-1-gated-repair.cjs');

const evalRoot = path.resolve(__dirname, '..');
const thisRepo = path.resolve(evalRoot, '../../../..');
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const codeRoot = path.resolve(opt('--code-root', thisRepo));
const expectSha = opt('--expect-sha', '579ee8b2fed06593d7d2aa57cffb6036dbf53a24');
const outDir = path.join(evalRoot, 'outputs');
fs.mkdirSync(outDir, { recursive: true });

const DI = 'backend/src/modules/vehicle-intelligence/driving-intelligence';
const codeSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: codeRoot }).toString().trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--', DI], { cwd: codeRoot }).toString().trim();
if (dirty) throw new Error(`DI not clean in ${codeRoot}:\n${dirty}`);
if (!codeSha.startsWith(expectSha.slice(0, 7)) && codeSha !== expectSha) {
  console.warn(`WARN: code SHA ${codeSha} != expected ${expectSha.slice(0, 12)}`);
}

const core = C51.loadCore(codeRoot);

function toMotionSamples(samples) {
  return samples.map((s) => ({
    label: s.label,
    valueKmh: s.valueKmh,
    quality: s.quality,
    supportLabels: s.supportLabels,
    supportSpanS: s.supportSpanS,
    flags: (s.flags || []).filter((f) => !f.startsWith('C5_1_')),
    estimator: s.estimator,
  }));
}

function seriesFrom(samples) {
  const m = new Map(samples.map((s) => [L.secOf(s.label), s]));
  return (sec) => m.get(sec) ?? null;
}

function c4FieldsEqual(a, b) {
  return (
    a.valueKmh === b.valueKmh &&
    a.quality === b.quality &&
    JSON.stringify(a.flags || []) === JSON.stringify(b.flags || []) &&
    JSON.stringify(a.supportLabels || []) === JSON.stringify(b.supportLabels || [])
  );
}

function compareDrive(d) {
  const { samples: c51Raw, c4, meta } = C51.computeC5_1GatedRepair(d.buckets, codeRoot, {
    vehicleClass: d.identity.vehicleClass,
  });
  const c51 = toMotionSamples(c51Raw);

  let c4ParityMismatch = 0;
  for (let i = 0; i < c4.length; i++) {
    const a = c4[i];
    const b = d.c4[i];
    if (a.label !== b.label || a.valueKmh !== b.valueKmh || a.quality !== b.quality) c4ParityMismatch++;
  }

  const c4By = seriesFrom(c4);
  const c51By = seriesFrom(c51);
  const refRows = d.refRows;
  const grid = (sec) => d.buckets.some((b) => L.secOf(b.bucketLabelUtc) === sec);

  const c4Eval = L.speedEvaluation(refRows, (s) => c4By(s)?.valueKmh ?? null, grid);
  const c51Eval = L.speedEvaluation(refRows, (s) => c51By(s)?.valueKmh ?? null, grid);
  const common = L.commonSupport(refRows, (s) => c4By(s)?.valueKmh ?? null, (s) => c51By(s)?.valueKmh ?? null);

  const readableSecs = refRows.filter((r) => r.ref != null && grid(r.sec));
  const lost = [];
  const gained = [];
  for (const r of readableSecs) {
    const c4n = c4By(r.sec)?.valueKmh != null;
    const c51n = c51By(r.sec)?.valueKmh != null;
    if (c4n && !c51n) lost.push({ sec: r.sec, label: L.labelOf(r.sec * 1000), c4: c4By(r.sec).valueKmh });
    if (!c4n && c51n) gained.push({ sec: r.sec });
  }

  let passThroughViolations = 0;
  for (const s of c51Raw) {
    const c4s = c4By(L.secOf(s.label));
    if (!c4s) continue;
    if (s.repairState === 'REPAIR_ACCEPTED') continue;
    const stripped = toMotionSamples([s])[0];
    if (!c4FieldsEqual(c4s, stripped)) passThroughViolations++;
  }

  const quarantineC4 = new Set(c4.filter((s) => s.quality === 'OUTLIER_REJECTED').map((s) => s.label));
  const quarantineC51 = new Set(c51.filter((s) => s.quality === 'OUTLIER_REJECTED').map((s) => s.label));
  const quarantineParity =
    quarantineC4.size === quarantineC51.size && [...quarantineC4].every((l) => quarantineC51.has(l));

  const eventsC4 = core.detectMotionManoeuvreEvents(0, c4, 'C4_ADAPTIVE_L3', R.GUARDS.usableQualities, R.OPTIONS);
  const eventsC51 = core.detectMotionManoeuvreEvents(0, c51, C51.MOTION_CORE_SPEED_C5_1_VERSION, R.GUARDS.usableQualities, R.OPTIONS);

  const eventEvalC4 = R.evaluateDrive({ ...d, c4, events: eventsC4 }, { write: false, matching: 'v2_gap2s' });
  const eventEvalC51 = R.evaluateDrive({ ...d, c4, events: eventsC51 }, { write: false, matching: 'v2_gap2s' });

  const refClasses = L.classifyReference(refRows);
  const motionRows = refRows.map((r) => ({
    ...r,
    cls: refClasses.classes.get(r.sec)?.cls ?? 'UNREADABLE',
  }));
  const motionC4 = L.motionClaimEvaluation(motionRows, (s) => L.c4Claim(c4By(s)?.valueKmh ?? null));
  const motionC51 = L.motionClaimEvaluation(motionRows, (s) => L.c4Claim(c51By(s)?.valueKmh ?? null));

  const repairedOnly = c51Raw.filter((s) => s.repairState === 'REPAIR_ACCEPTED');
  const passThroughOnly = c51Raw.filter((s) => s.repairState !== 'REPAIR_ACCEPTED');

  return {
    id: d.id,
    vehicleClass: d.identity.vehicleClass,
    c4,
    c51Raw,
    c51,
    meta,
    c4ParityMismatch,
    c4Eval,
    c51Eval,
    common,
    lost,
    gained,
    passThroughViolations,
    quarantineParity,
    eventsC4,
    eventsC51,
    eventEvalC4,
    eventEvalC51,
    motionC4,
    motionC51,
    repairedOnly,
    passThroughOnly,
  };
}

function tes16Trace(result) {
  const labels = ['2026-10-16T03:50:20Z', '2026-10-16T03:50:22Z', '2026-10-16T03:50:23Z'];
  return labels.map((label) => {
    const s = result.c51Raw.find((x) => x.label === label);
    const c4s = result.c4.find((x) => x.label === label);
    const ref = result.c4Eval?.all; // placeholder
    const refRow = R.loadDrives().find((d) => d.id === 'TES16').refRows.find((r) => L.labelOf(r.sec * 1000) === label);
    return {
      label,
      refKmh: refRow?.ref ?? null,
      c4Kmh: c4s?.valueKmh,
      c51Kmh: s?.valueKmh,
      repairState: s?.repairState,
      eligibilitySignals: s?.eligibilitySignals,
      trace: s?.trace,
      q: s?.q,
    };
  });
}

function tes16FalseAccel(result) {
  const from = L.secOf('2026-10-16T03:50:20Z');
  const to = L.secOf('2026-10-16T03:50:23Z');
  const pick = (events) =>
    events.filter((e) => e.kind === 'ACCELERATION' && L.secOf(e.startLabel) >= from && L.secOf(e.endLabel) <= to);
  return { c4: pick(result.eventsC4), c51: pick(result.eventsC51) };
}

function gateStatus(pass, verified = true) {
  if (!verified) return 'NOT_VERIFIED';
  return pass ? 'PASS' : 'FAIL';
}

function normalizeGateDisplay(g) {
  if (g.status === 'NOT_VERIFIED') {
    g.pass = null;
    g.scored = false;
    return g;
  }
  g.scored = true;
  if (!g.status) g.status = gateStatus(g.pass);
  return g;
}

function regressionFingerprint(results, tes16Labels, tes16Fa, tes211_23, tig1845) {
  return {
    c51Version: C51.MOTION_CORE_SPEED_C5_1_VERSION,
    tes16FalseAccelC51: tes16Fa.c51.length,
    tes16FalseAccelC4: tes16Fa.c4.length,
    tes16Trace: tes16Labels.map((t) => ({
      label: t.label,
      c4Kmh: t.c4Kmh,
      c51Kmh: t.c51Kmh,
      repairState: t.repairState,
    })),
    tes21_1_12_05_23: tes211_23,
    tig22_18_41_45: tig1845,
    drives: results.map((r) => ({
      id: r.id,
      lost: r.lost.length,
      passThroughViolations: r.passThroughViolations,
      quarantineParity: r.quarantineParity,
      c4ReplayParityMismatches: r.c4ParityMismatch,
      maeC4: r.common.a?.maeKmh,
      maeC51: r.common.b?.maeKmh,
      p95C4: r.common.a?.p95AbsKmh,
      p95C51: r.common.b?.p95AbsKmh,
      maxSupportOffset: r.meta.maxSupportOffset,
    })),
  };
}

function compareRegression(current, baseline) {
  const unchanged = JSON.stringify(current) === JSON.stringify(baseline);
  return {
    unchanged,
    mismatches: unchanged ? [] : [{ note: 'V1.1 regression fingerprint differs from frozen baseline' }],
  };
}

function buildGates(results) {
  const gates = [];
  for (const r of results) {
    const covC4 = r.c4Eval.coverage.pairedShareOfReadable;
    const covC51 = r.c51Eval.coverage.pairedShareOfReadable;
    gates.push({
      gate: 'A/B1_coverage',
      drive: r.id,
      pass: covC51 >= covC4 - 0.001,
      status: gateStatus(covC51 >= covC4 - 0.001),
      detail: { covC4, covC51 },
    });
    gates.push({
      gate: 'A3_repair_accepted_lt_pass_through',
      drive: r.id,
      pass: r.meta.repairAccepted < r.meta.passOutside + r.meta.repairRejected + r.meta.uncertain,
      status: gateStatus(r.meta.repairAccepted < r.meta.passOutside + r.meta.repairRejected + r.meta.uncertain),
      detail: {
        repairAccepted: r.meta.repairAccepted,
        passOutside: r.meta.passOutside,
        repairRejected: r.meta.repairRejected,
        uncertain: r.meta.uncertain,
      },
    });
    gates.push({
      gate: 'A4_no_c4_numeric_to_null',
      drive: r.id,
      pass: r.lost.length === 0,
      status: gateStatus(r.lost.length === 0),
      detail: { lost: r.lost.length },
    });
    gates.push({
      gate: 'B2_no_numeric_loss',
      drive: r.id,
      pass: r.lost.length === 0,
      status: gateStatus(r.lost.length === 0),
      detail: { lost: r.lost.length },
    });
    gates.push({
      gate: 'A_pass_through_fields',
      drive: r.id,
      pass: r.passThroughViolations === 0,
      status: gateStatus(r.passThroughViolations === 0),
      detail: { violations: r.passThroughViolations },
    });
    gates.push({
      gate: 'F1_quarantine_parity',
      drive: r.id,
      pass: r.quarantineParity,
      status: gateStatus(r.quarantineParity),
      detail: {},
    });
    let maxC4 = 0;
    let maxC51 = 0;
    for (const s of r.c4) if (s.valueKmh != null) maxC4 = Math.max(maxC4, s.valueKmh);
    for (const s of r.c51) if (s.valueKmh != null) maxC51 = Math.max(maxC51, s.valueKmh);
    gates.push({
      gate: 'F2_no_new_gt_250_kmh',
      drive: r.id,
      pass: maxC51 <= Math.max(maxC4, C51.F2_MAX_NUMERIC_KMH) && maxC51 <= C51.F2_MAX_NUMERIC_KMH + 1e-6,
      status: gateStatus(maxC51 <= Math.max(maxC4, C51.F2_MAX_NUMERIC_KMH) && maxC51 <= C51.F2_MAX_NUMERIC_KMH + 1e-6),
      detail: { maxC4Kmh: maxC4, maxC51Kmh: maxC51 },
    });
    gates.push({
      gate: 'F3_max_support_offset',
      drive: r.id,
      pass: r.meta.maxSupportOffset <= 4,
      status: gateStatus(r.meta.maxSupportOffset <= 4),
      detail: { max: r.meta.maxSupportOffset, maxAttributionOffsetS: r.meta.maxAttributionOffsetS },
    });
    gates.push({
      gate: 'G1_eligibility_pct',
      drive: r.id,
      pass: r.meta.eligibleLabelCount / r.meta.gridLabelCount <= 0.15,
      status: gateStatus(r.meta.eligibleLabelCount / r.meta.gridLabelCount <= 0.15),
      detail: {
        pct: L.round(100 * r.meta.eligibleLabelCount / r.meta.gridLabelCount, 2),
        eligible: r.meta.eligibleLabelCount,
        grid: r.meta.gridLabelCount,
      },
    });
    if (r.id === 'TES16') {
      const win = r.meta.suspicionWindows.find(
        (w) =>
          L.secOf(w.start) <= L.secOf('2026-10-16T03:50:20Z') &&
          L.secOf(w.end) >= L.secOf('2026-10-16T03:50:23Z'),
      );
      gates.push({
        gate: 'G2_tes16_gap_window_covers_cluster',
        drive: 'TES16',
        pass: Boolean(win),
        status: gateStatus(Boolean(win)),
        detail: { window: win ?? null },
      });
    }
    gates.push({
      gate: 'C4_residual_pass_through_risk_documented',
      drive: r.id,
      pass: true,
      status: 'NOT_VERIFIED',
      detail: { note: 'Residual C4>|8| km/h on pass-through documented in drive speed tables; not a pass/fail gate.' },
    });
    const maeC4 = r.common.a?.maeKmh;
    const maeC51 = r.common.b?.maeKmh;
    gates.push({
      gate: 'C1_common_mae',
      drive: r.id,
      pass: maeC51 != null && maeC4 != null && maeC51 <= maeC4 + 0.1,
      status: gateStatus(maeC51 != null && maeC4 != null && maeC51 <= maeC4 + 0.1),
      detail: { maeC4, maeC51, n: r.common.n },
    });
    const p95C4 = r.common.a?.p95AbsKmh;
    const p95C51 = r.common.b?.p95AbsKmh;
    gates.push({
      gate: 'C2_common_p95',
      drive: r.id,
      pass: p95C51 != null && p95C4 != null && p95C51 <= p95C4 + 0.2,
      status: gateStatus(p95C51 != null && p95C4 != null && p95C51 <= p95C4 + 0.2),
      detail: { p95C4, p95C51 },
    });

    const hardMissedC4 = r.eventEvalC4.summary.accepted?.oracleHardMissed ?? 0;
    const hardMissedC51 = r.eventEvalC51.summary.accepted?.oracleHardMissed ?? 0;
    gates.push({
      gate: 'D1_confirmed_recall',
      drive: r.id,
      pass: hardMissedC51 <= hardMissedC4,
      status: gateStatus(hardMissedC51 <= hardMissedC4),
      detail: { oracleHardMissedC4: hardMissedC4, oracleHardMissedC51: hardMissedC51 },
    });
    gates.push({
      gate: 'D3_unknown_oracle_reported',
      drive: r.id,
      pass: true,
      status: 'NOT_VERIFIED',
      detail: {
        c4EventRows: (r.eventEvalC4.events || []).length,
        c51EventRows: (r.eventEvalC51.events || []).length,
      },
    });
    const hardFpC4 = (r.eventEvalC4.events || []).filter((row) => row.cls === 'FEHLALARM').length;
    const hardFpC51 = (r.eventEvalC51.events || []).filter((row) => row.cls === 'FEHLALARM').length;
    gates.push({
      gate: 'D2_hard_false_alarms',
      drive: r.id,
      pass: hardFpC51 <= hardFpC4,
      status: gateStatus(hardFpC51 <= hardFpC4),
      detail: { hardFalseAlarmsC4: hardFpC4, hardFalseAlarmsC51: hardFpC51 },
    });
    const evC4 = r.eventsC4.length;
    const evC51 = r.eventsC51.length;
    const recallImproved = hardMissedC51 < hardMissedC4;
    gates.push({
      gate: 'D6_no_event_drop_without_oracle_gain',
      drive: r.id,
      pass: evC51 >= evC4 || recallImproved || hardFpC51 < hardFpC4,
      status: gateStatus(evC51 >= evC4 || recallImproved || hardFpC51 < hardFpC4),
      detail: { eventsC4: evC4, eventsC51: evC51, recallImproved },
    });
    gates.push({
      gate: 'E1_false_motion_still',
      drive: r.id,
      pass: r.motionC51.falseMotionInConfirmedStill <= r.motionC4.falseMotionInConfirmedStill,
      status: gateStatus(r.motionC51.falseMotionInConfirmedStill <= r.motionC4.falseMotionInConfirmedStill),
      detail: { c4: r.motionC4.falseMotionInConfirmedStill, c51: r.motionC51.falseMotionInConfirmedStill },
    });
    gates.push({
      gate: 'E2_false_still_motion',
      drive: r.id,
      pass: r.motionC51.falseStillInConfirmedMotion <= r.motionC4.falseStillInConfirmedMotion,
      status: gateStatus(r.motionC51.falseStillInConfirmedMotion <= r.motionC4.falseStillInConfirmedMotion),
      detail: { c4: r.motionC4.falseStillInConfirmedMotion, c51: r.motionC51.falseStillInConfirmedMotion },
    });
    gates.push({
      gate: 'PRODUCTION_C4_REPLAY_PARITY',
      drive: r.id,
      pass: r.c4ParityMismatch === 0,
      status: gateStatus(r.c4ParityMismatch === 0),
      detail: { mismatches: r.c4ParityMismatch },
    });
    if (r.id === 'TIG22') {
      const unscored = (r.eventEvalC51.events || []).filter((row) => row.cls === 'UNSCORED_VIDEO_GAP');
      gates.push({
        gate: 'D5_tig22_1904_unscored_gap',
        drive: 'TIG22',
        pass: true,
        status: 'NOT_VERIFIED',
        detail: {
          note: '19:04 remains UNSCORED_VIDEO_GAP per video reference; not asserted in offline event rows.',
          unscoredCount: unscored.length,
        },
      });
    }
  }

  const tes = results.find((x) => x.id === 'TES16');
  if (tes) {
    const fa = tes16FalseAccel(tes);
    gates.push({
      gate: 'D4_tes16_false_accel_removed',
      drive: 'TES16',
      pass: fa.c51.length === 0 && fa.c4.length > 0,
      status: gateStatus(fa.c51.length === 0 && fa.c4.length > 0),
      detail: { c4Events: fa.c4.length, c51Events: fa.c51.length },
    });
    const from = L.secOf('2026-10-16T03:50:16Z');
    const to = L.secOf('2026-10-16T03:50:26Z');
    let maxErr = 0;
    const refDrv = R.loadDrives().find((d) => d.id === 'TES16');
    for (let s = from; s <= to; s++) {
      const refR = refDrv.refRows.find((r) => r.sec === s);
      if (refR?.ref == null) continue;
      const v = tes.c51.find((x) => L.secOf(x.label) === s)?.valueKmh;
      if (v != null) maxErr = Math.max(maxErr, Math.abs(v - refR.ref));
    }
    gates.push({
      gate: 'C3_tes16_critical_max_err',
      drive: 'TES16',
      pass: maxErr <= 8,
      status: gateStatus(maxErr <= 8),
      detail: { maxErrKmh: L.round(maxErr, 2) },
    });
  }

  const tes211 = results.find((x) => x.id === 'TES21-1');
  if (tes211) {
    const lab23 = '2026-10-21T12:05:23Z';
    const c4s = tes211.c4.find((x) => x.label === lab23);
    const c51s = tes211.c51Raw.find((x) => x.label === lab23);
    gates.push({
      gate: 'TES21_1_brake_120523_not_worsened',
      drive: 'TES21-1',
      pass: (c51s?.valueKmh ?? 0) <= (c4s?.valueKmh ?? 0) + 0.01,
      status: gateStatus((c51s?.valueKmh ?? 0) <= (c4s?.valueKmh ?? 0) + 0.01),
      detail: { c4Kmh: c4s?.valueKmh, c51Kmh: c51s?.valueKmh, repairState: c51s?.repairState },
    });
    const from = L.secOf('2026-10-21T12:05:18Z');
    const to = L.secOf('2026-10-21T12:05:24Z');
    const decelC4 = tes211.eventsC4.filter((e) => e.kind === 'DECELERATION' && L.secOf(e.startLabel) <= to && L.secOf(e.endLabel) >= from);
    const decelC51 = tes211.eventsC51.filter((e) => e.kind === 'DECELERATION' && L.secOf(e.startLabel) <= to && L.secOf(e.endLabel) >= from);
    gates.push({
      gate: 'TES21_1_real_decel_preserved',
      drive: 'TES21-1',
      pass: decelC51.length >= decelC4.length,
      status: gateStatus(decelC51.length >= decelC4.length),
      detail: { decelC4: decelC4.length, decelC51: decelC51.length },
    });
  }

  for (const g of gates) normalizeGateDisplay(g);

  const scored = gates.filter((g) => g.scored);
  return {
    gates,
    allPass: scored.every((g) => g.pass === true),
    scoredPass: scored.every((g) => g.pass === true),
  };
}

const { execFileSync: execSynth } = require('node:child_process');
let syntheticsOk = true;
let supportOk = true;
const scriptsDir = path.join(evalRoot, 'scripts');
try {
  execSynth('node', ['c5-1.synthetic.test.cjs'], { cwd: scriptsDir, stdio: 'pipe' });
} catch (e) {
  syntheticsOk = false;
}
try {
  execSynth('node', ['c5-1.support.test.cjs'], { cwd: scriptsDir, stdio: 'pipe' });
} catch (e) {
  supportOk = false;
}

const drives = R.loadDrives();
const results = drives.map(compareDrive);
const gates = buildGates(results);
gates.gates.push(
  normalizeGateDisplay({
    gate: 'H_synthetics',
    drive: 'ALL',
    pass: syntheticsOk && supportOk,
    status: gateStatus(syntheticsOk && supportOk),
    detail: { syntheticsOk, supportOk },
  }),
);
gates.allPass = gates.gates.filter((g) => g.scored).every((g) => g.pass === true);

const tes16Labels = tes16Trace(results.find((x) => x.id === 'TES16'));

const tes211 = results.find((x) => x.id === 'TES21-1');
const tes211_23 = tes211?.c51Raw.find((x) => x.label === '2026-10-21T12:05:23Z');
const tig22 = results.find((x) => x.id === 'TIG22');
const tig1845 = tig22?.c51Raw.find((x) => x.label === '2026-10-22T18:41:45Z');

const tes16Fa = tes16FalseAccel(results.find((x) => x.id === 'TES16'));
const regressionCurrent = regressionFingerprint(
  results,
  tes16Labels,
  tes16Fa,
  {
    c4Kmh: tes211?.c4.find((x) => x.label === '2026-10-21T12:05:23Z')?.valueKmh,
    c51Kmh: tes211_23?.valueKmh,
    repairState: tes211_23?.repairState,
  },
  {
    c4Kmh: tig22?.c4.find((x) => x.label === '2026-10-22T18:41:45Z')?.valueKmh,
    c51Kmh: tig1845?.valueKmh,
    repairState: tig1845?.repairState,
  },
);
const baselinePath = path.join(evalRoot, 'outputs', 'baselines', 'c5_1_v1_1_regression_fingerprint_53f5acebc.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const regressionCompare = compareRegression(regressionCurrent, {
  c51Version: baseline.c51Version,
  tes16FalseAccelC51: baseline.tes16FalseAccelC51,
  tes16FalseAccelC4: baseline.tes16FalseAccelC4,
  tes16Trace: baseline.tes16Trace,
  tes21_1_12_05_23: baseline.tes21_1_12_05_23,
  tig22_18_41_45: baseline.tig22_18_41_45,
  drives: baseline.drives,
});

const syntheticAuditPath = path.join(outDir, 'c5_1_synthetic_test_audit.json');
const syntheticAudit = fs.existsSync(syntheticAuditPath)
  ? JSON.parse(fs.readFileSync(syntheticAuditPath, 'utf8'))
  : null;

const summary = {
  schema: 'C5_1_EXPERIMENT_SUMMARY_V2_SAFETY_HARDENED',
  testAuditSchema: 'C5_1_TEST_INTEGRITY_AUDIT_V1',
  generatedAt: new Date().toISOString(),
  codeRoot,
  codeSha,
  productionPin: expectSha,
  hardening: C51.HARDENING_TAG,
  c51Version: C51.MOTION_CORE_SPEED_C5_1_VERSION,
  c4Version: core.MOTION_CORE_SPEED_C4_VERSION,
  frozen: C51.FROZEN,
  drives: results.map((r) => ({
    id: r.id,
    vehicleClass: r.vehicleClass,
    eligibility: {
      velocitySeeds: r.meta.velocitySeedCount,
      suspicionWindows: r.meta.suspicionWindows,
      eligibleLabels: r.meta.eligibleLabelCount,
      gridLabels: r.meta.gridLabelCount,
      eligiblePct: L.round(100 * r.meta.eligibleLabelCount / r.meta.gridLabelCount, 2),
      repairAccepted: r.meta.repairAccepted,
      repairRejected: r.meta.repairRejected,
      uncertain: r.meta.uncertain,
      passOutside: r.meta.passOutside,
      maxSupportOffset: r.meta.maxSupportOffset,
    },
    speed: {
      c4All: r.c4Eval.all,
      c51All: r.c51Eval.all,
      common: r.common,
      coverage: { c4: r.c4Eval.coverage, c51: r.c51Eval.coverage },
    },
    coverageDelta: { lost: r.lost, gained: r.gained },
    events: {
      c4: r.eventEvalC4.summary,
      c51: r.eventEvalC51.summary,
    },
    motion: { c4: r.motionC4, c51: r.motionC51 },
    quarantineParity: r.quarantineParity,
    c4ReplayParityMismatches: r.c4ParityMismatch,
    passThroughViolations: r.passThroughViolations,
  })),
  tes16SecondTrace: tes16Labels,
  tes16FalseAccel: tes16Fa,
  tes21_1_12_05_23: {
    c4Kmh: tes211?.c4.find((x) => x.label === '2026-10-21T12:05:23Z')?.valueKmh,
    c51Kmh: tes211_23?.valueKmh,
    repairState: tes211_23?.repairState,
  },
  tig22_18_41_45: {
    c4Kmh: tig22?.c4.find((x) => x.label === '2026-10-22T18:41:45Z')?.valueKmh,
    c51Kmh: tig1845?.valueKmh,
    repairState: tig1845?.repairState,
  },
  attributionHorizons: results.map((r) => ({
    id: r.id,
    maxSupportOffset: r.meta.maxSupportOffset,
    maxAttributionOffsetS: r.meta.maxAttributionOffsetS,
    maxTimeSuspectSpanS: r.meta.maxTimeSuspectSpanS,
    supportHalfSMax: r.meta.supportHalfSMax,
    note: r.meta.eligibilityHorizonNote,
  })),
  validationGates: gates,
  gateCounts: {
    pass: gates.gates.filter((g) => g.status === 'PASS').length,
    fail: gates.gates.filter((g) => g.status === 'FAIL').length,
    notVerified: gates.gates.filter((g) => g.status === 'NOT_VERIFIED').length,
    scored: gates.gates.filter((g) => g.scored).length,
    total: gates.gates.length,
  },
  testIntegrityAudit: {
    algorithmFileSha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(evalRoot, 'scripts', 'c5-1-gated-repair.cjs')))
      .digest('hex'),
    algorithmHeadPinned: '53f5acebc13f8ac45498b9ff7311e4152f30f1fe',
    productionPin: expectSha,
    codeSha,
    commands: [
      'node scripts/c5-1.support.test.cjs',
      'node scripts/c5-1.synthetic.test.cjs',
      'node scripts/run_c5_1_experiment.cjs --code-root <repo>',
    ],
    syntheticAudit,
    regressionBaseline: baselinePath,
    regressionUnchanged: regressionCompare.unchanged,
    regressionMismatches: regressionCompare.mismatches,
  },
  finalVerdict: gates.allPass && regressionCompare.unchanged && syntheticsOk && supportOk
    ? 'SAFE_OFFLINE_CANDIDATE'
    : 'NOT_PROVEN',
  finalTestVerdict:
    gates.gates.filter((g) => g.scored).every((g) => g.pass === true) &&
    syntheticsOk &&
    supportOk &&
    regressionCompare.unchanged
      ? 'PASS'
      : regressionCompare.unchanged
        ? 'NOT_PROVEN'
        : 'FAIL',
  priorV1Verdict: 'PROVEN_FOR_LOCAL_REPAIR',
  independentGeneralization: 'NOT_YET_PROVEN',
};

fs.writeFileSync(path.join(outDir, 'c5_1_experiment_summary.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(
  path.join(outDir, 'c5_1_test_integrity_audit.json'),
  JSON.stringify(
    {
      schema: summary.testAuditSchema,
      generatedAt: summary.generatedAt,
      finalTestVerdict: summary.finalTestVerdict,
      gateCounts: summary.gateCounts,
      testIntegrityAudit: summary.testIntegrityAudit,
      syntheticAudit,
    },
    null,
    2,
  ),
);

// Markdown report (derived only)
const md = [];
md.push('# C5.1 experiment report\n');
md.push(`Generated: ${summary.generatedAt}\n`);
md.push(`Verdict: **${summary.finalVerdict}**\n`);
md.push('## Gates\n');
for (const g of gates.gates) {
  const label = g.status === 'NOT_VERIFIED' ? 'NOT_VERIFIED' : g.status;
  md.push(`- ${label} \`${g.gate}\` (${g.drive}) ${JSON.stringify(g.detail)}`);
}
md.push('\n## Gate counts\n');
md.push(JSON.stringify(summary.gateCounts, null, 2));
md.push('\n## Test integrity\n');
md.push(JSON.stringify(summary.testIntegrityAudit, null, 2));
md.push('\n## TES16 trace\n');
md.push('```json\n' + JSON.stringify(tes16Labels, null, 2) + '\n```\n');
fs.writeFileSync(path.join(outDir, 'C5_1_REPORT.md'), md.join('\n'));

console.log('Wrote', path.join(outDir, 'c5_1_experiment_summary.json'));
console.log('FINAL_VERDICT=', summary.finalVerdict);
const gc = summary.gateCounts;
console.log('gates PASS/FAIL/NOT_VERIFIED', gc.pass, gc.fail, gc.notVerified, 'scored', gc.scored);
console.log('FINAL_TEST_VERDICT=', summary.finalTestVerdict);
console.log('regression unchanged', regressionCompare.unchanged);
