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
/** Versioned outputs: V1.1 (53f5acebc) is sealed under outputs/v1_1; this run writes outputs/v1_2. */
const OUT_VERSION = 'v1_2';
const PRIOR_OUT_VERSION = 'v1_1';
const outDir = path.join(evalRoot, 'outputs', OUT_VERSION);
fs.mkdirSync(outDir, { recursive: true });

const V1_1_ALGORITHM_HEAD = '53f5acebc13f8ac45498b9ff7311e4152f30f1fe';
const TIG22_190438 = '2026-10-22T19:04:38Z';
/**
 * V1.1 observation for TIG22 19:04:38 (Fable independent safety signoff, 2026-10-23, read-only
 * recompute of 53f5acebc). Reproduce with
 *   git show 53f5acebc:research/.../scripts/c5-1-gated-repair.cjs > /tmp/c5-1-v1_1.cjs
 * and run computeC5_1GatedRepair on the sealed TIG22 fixture. Video ground truth is UNKNOWN.
 */
const TIG22_190438_V1_1_OBSERVED = Object.freeze({
  version: C51.PRIOR_VERSION_V1_1,
  algorithmHead: V1_1_ALGORITHM_HEAD,
  c4Kmh: 100.10595401668607,
  c4Quality: 'SPARSE_SUPPORT',
  c51Kmh: 74.45209167284705,
  repairState: 'REPAIR_ACCEPTED',
  attributionP: '2026-10-22T19:04:40Z',
  q5Detail: { vCand: 0, vC4: 0 },
  neighbourNote:
    '19:04:37 OUTLIER_REJECTED (null speed) → tripleAccelViolation() returned 0 for both C4 and candidate; Q5/Q6 passed without evidence.',
  localStepAfterRepairKmhPerS: { from: 74.45209167284705, to: 98.16216281501156, label: '2026-10-22T19:04:39Z' },
  provenance: 'FABLE_SIGNOFF_READ_ONLY_RECOMPUTE_2026-10-23',
});

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
    const refRow = drivesCached().find((d) => d.id === 'TES16').refRows.find((r) => L.labelOf(r.sec * 1000) === label);
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

/** Video-reference status of a label: numeric reference, readable-but-null, or outside the scored window. */
let drivesMemo = null;
function drivesCached() {
  if (!drivesMemo) drivesMemo = R.loadDrives();
  return drivesMemo;
}

function d4RefStatus(driveId, label) {
  const d = drivesCached().find((x) => x.id === driveId);
  if (!d) return 'UNKNOWN_DRIVE';
  const sec = L.secOf(label);
  const row = d.refRows.find((r) => r.sec === sec);
  if (!row) return 'OUTSIDE_VIDEO_REFERENCE_WINDOW';
  return row.ref != null ? `REF_${row.ref}_KMH` : 'REF_UNREADABLE';
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

function regressionFingerprint(results, tes16Labels, tes16Fa, tes211_23, tig1845, tig190438) {
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
    tig22_19_04_38: tig190438,
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

/**
 * Field-wise comparison against the frozen V1.1 fingerprint. Only the documented C1 deltas may
 * differ; any other difference is a regression.
 */
const EXPECTED_V1_2_DELTAS = Object.freeze({
  '.c51Version': 'V1.1 → V1.2 version string',
  '.tig22_19_04_38': 'new fingerprint field (V1.1 baseline did not pin 19:04:38); V1.1 value documented in tig22_19_04_38.before',
});

function diffPaths(a, b, prefix = '', out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (isObj(a) && isObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffPaths(a[k], b[k], `${prefix}.${k}`, out);
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    a.forEach((x, i) => diffPaths(x, b[i], `${prefix}[${i}]`, out));
    return out;
  }
  out.push(prefix);
  return out;
}

function compareRegression(current, baseline) {
  const mismatches = diffPaths(current, baseline);
  const isExpected = (p) => Object.keys(EXPECTED_V1_2_DELTAS).some((e) => p === e || p.startsWith(`${e}.`) || p.startsWith(`${e}[`));
  const expected = mismatches.filter(isExpected);
  const unexpected = mismatches.filter((p) => !isExpected(p));
  return {
    unchanged: unexpected.length === 0,
    identicalOutsideExpectedDeltas: unexpected.length === 0,
    expectedDeltas: expected.map((p) => ({ path: p, reason: EXPECTED_V1_2_DELTAS[Object.keys(EXPECTED_V1_2_DELTAS).find((e) => p === e || p.startsWith(`${e}.`) || p.startsWith(`${e}[`))] })),
    mismatches: unexpected.map((p) => ({ path: p, current: getPath(current, p), baseline: getPath(baseline, p) })),
  };
}

function getPath(obj, p) {
  const parts = p.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = obj;
  for (const k of parts) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
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
    // C1 (fleet): no accepted repair may rest on anything but VALID Q5 and Q6 evidence.
    const acceptedWithoutEvidence = r.repairedOnly.filter(
      (s) => s.trace?.q5Evidence !== C51.EVIDENCE.VALID || s.trace?.q6Evidence !== C51.EVIDENCE.VALID,
    );
    gates.push({
      gate: 'C1_no_accept_without_valid_q5_q6_evidence',
      drive: r.id,
      pass: acceptedWithoutEvidence.length === 0,
      status: gateStatus(acceptedWithoutEvidence.length === 0),
      detail: {
        accepted: r.repairedOnly.length,
        acceptedWithoutValidEvidence: acceptedWithoutEvidence.map((s) => s.label),
        insufficientEvidenceRejections: r.meta.insufficientEvidenceRejections,
      },
    });
    if (r.id === 'TIG22') {
      const unscored = (r.eventEvalC51.events || []).filter((row) => row.cls === 'UNSCORED_VIDEO_GAP');
      gates.push({
        gate: 'D5_tig22_1904_unscored_gap',
        drive: 'TIG22',
        pass: true,
        status: 'NOT_VERIFIED',
        detail: {
          note:
            '19:04 remains UNSCORED_VIDEO_GAP per video reference (reference ends 19:03:02); true speed at 19:04:38 is unknown. V1.1 accepted a repair here without ground truth (see tig22_19_04_38); V1.2 fails closed. This is not a confirmed false alarm.',
          unscoredCount: unscored.length,
        },
      });
      const s38 = r.c51Raw.find((x) => x.label === TIG22_190438);
      const c438 = r.c4.find((x) => x.label === TIG22_190438);
      const t38 = s38?.trace;
      const failClosed =
        s38?.repairState !== 'REPAIR_ACCEPTED' &&
        s38?.valueKmh === c438?.valueKmh &&
        t38?.q5Evidence === C51.EVIDENCE.INSUFFICIENT_EVIDENCE &&
        t38?.q6Evidence === C51.EVIDENCE.INSUFFICIENT_EVIDENCE &&
        t38?.candidateKmh != null;
      gates.push({
        gate: 'C1_tig22_190438_null_neighbor_fail_closed',
        drive: 'TIG22',
        pass: failClosed,
        status: gateStatus(failClosed),
        detail: {
          before: TIG22_190438_V1_1_OBSERVED,
          after: {
            version: C51.MOTION_CORE_SPEED_C5_1_VERSION,
            c4Kmh: c438?.valueKmh,
            c4Quality: c438?.quality,
            c51Kmh: s38?.valueKmh,
            repairState: s38?.repairState,
            candidateKmh: t38?.candidateKmh,
            attributionP: t38?.attributionP,
            q: t38?.q,
            q5Evidence: t38?.q5Evidence,
            q6Evidence: t38?.q6Evidence,
            q5Reason: t38?.q5Detail?.reason,
            evidenceReason: t38?.q5Detail?.evidenceReason,
            neighborsExamined: t38?.q5Detail?.neighborsExamined,
          },
          videoGroundTruth: 'UNKNOWN_UNSCORED_VIDEO_GAP',
          c4ValuePreserved: s38?.valueKmh === c438?.valueKmh,
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
    const refDrv = drivesCached().find((d) => d.id === 'TES16');
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

const syntheticAuditPath = path.join(outDir, 'c5_1_synthetic_test_audit.json');
const syntheticAudit = fs.existsSync(syntheticAuditPath)
  ? JSON.parse(fs.readFileSync(syntheticAuditPath, 'utf8'))
  : null;

const drives = drivesCached();
const results = drives.map(compareDrive);
const gates = buildGates(results);
gates.gates.push(
  normalizeGateDisplay({
    gate: 'H_synthetics',
    drive: 'ALL',
    pass: syntheticsOk && supportOk,
    status: gateStatus(syntheticsOk && supportOk),
    detail: { syntheticsOk, supportOk, syntheticAuditSchema: syntheticAudit?.schema ?? null },
  }),
);
// C3: in-window manoeuvre scenarios must have exercised the repair path (eligible > 0, candidates > 0, Q5/Q6 evaluated).
const C3_SCENARIOS = ['10_accel_time_suspect', '11_brake_suspect_fix', '12_start_from_stop_suspect', '13_outlier_neighbour_fail_closed'];
const c3Activity = C3_SCENARIOS.map((name) => {
  const a = syntheticAudit?.scenarios?.[name]?.activity;
  return {
    scenario: name,
    present: Boolean(a),
    eligible: a?.eligible ?? 0,
    candidates: a?.candidates ?? 0,
    q5Evaluated: a?.q5Evaluated ?? 0,
    q6Evaluated: a?.q6Evaluated ?? 0,
    accepted: a?.accepted ?? 0,
    insufficientEvidenceRejections: a?.insufficientEvidenceRejections ?? 0,
  };
});
const c3Pass =
  syntheticsOk &&
  c3Activity.every((a) => a.present && a.eligible > 0 && a.candidates > 0 && a.q5Evaluated === a.candidates && a.q6Evaluated === a.candidates) &&
  c3Activity.find((a) => a.scenario === '13_outlier_neighbour_fail_closed').insufficientEvidenceRejections >= 1;
gates.gates.push(
  normalizeGateDisplay({
    gate: 'C3_in_window_manoeuvre_tests_active_repair_path',
    drive: 'SYNTHETIC',
    pass: c3Pass,
    status: gateStatus(c3Pass),
    detail: { scenarios: c3Activity },
  }),
);
gates.allPass = gates.gates.filter((g) => g.scored).every((g) => g.pass === true);

const tes16Labels = tes16Trace(results.find((x) => x.id === 'TES16'));

const tes211 = results.find((x) => x.id === 'TES21-1');
const tes211_23 = tes211?.c51Raw.find((x) => x.label === '2026-10-21T12:05:23Z');
const tig22 = results.find((x) => x.id === 'TIG22');
const tig1845 = tig22?.c51Raw.find((x) => x.label === '2026-10-22T18:41:45Z');

const tig190438 = tig22?.c51Raw.find((x) => x.label === TIG22_190438);
const tig190438C4 = tig22?.c4.find((x) => x.label === TIG22_190438);

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
  {
    c4Kmh: tig190438C4?.valueKmh,
    c51Kmh: tig190438?.valueKmh,
    repairState: tig190438?.repairState,
    q5Evidence: tig190438?.trace?.q5Evidence ?? null,
    q6Evidence: tig190438?.trace?.q6Evidence ?? null,
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
const algorithmFileSha256 = crypto
  .createHash('sha256')
  .update(fs.readFileSync(path.join(evalRoot, 'scripts', 'c5-1-gated-repair.cjs')))
  .digest('hex');
const v12BaselinePath = path.join(evalRoot, 'outputs', 'baselines', 'c5_1_v1_2_regression_fingerprint.json');
fs.writeFileSync(
  v12BaselinePath,
  JSON.stringify(
    {
      schema: 'C5_1_V1_2_REGRESSION_FINGERPRINT',
      priorBaseline: path.basename(baselinePath),
      algorithmFileSha256,
      productionPin: expectSha,
      ...regressionCurrent,
    },
    null,
    2,
  ),
);

const speedRegression = results.map((r) => ({
  id: r.id,
  n: r.common.n,
  maeC4: r.common.a?.maeKmh,
  maeC51: r.common.b?.maeKmh,
  p95C4: r.common.a?.p95AbsKmh,
  p95C51: r.common.b?.p95AbsKmh,
  maxAbsC4: r.common.a?.maxAbsKmh ?? null,
  maxAbsC51: r.common.b?.maxAbsKmh ?? null,
  coverageC4: r.c4Eval.coverage.pairedShareOfReadable,
  coverageC51: r.c51Eval.coverage.pairedShareOfReadable,
  lost: r.lost.length,
  gained: r.gained.length,
}));

const summary = {
  schema: 'C5_1_EXPERIMENT_SUMMARY_V3_NULL_NEIGHBOR_FAIL_CLOSED',
  testAuditSchema: 'C5_1_TEST_INTEGRITY_AUDIT_V2',
  generatedAt: new Date().toISOString(),
  outputsVersion: OUT_VERSION,
  priorVersion: {
    version: C51.PRIOR_VERSION_V1_1,
    algorithmHead: V1_1_ALGORITHM_HEAD,
    outputs: `outputs/${PRIOR_OUT_VERSION}/`,
    fableSignoff: 'APPROVED_AS_SAFE_OFFLINE_CANDIDATE (no shadow/production release); conditions C1–C3',
  },
  codeRoot,
  codeSha,
  productionPin: expectSha,
  hardening: C51.HARDENING_TAG,
  c51Version: C51.MOTION_CORE_SPEED_C5_1_VERSION,
  c4Version: core.MOTION_CORE_SPEED_C4_VERSION,
  frozen: C51.FROZEN,
  evidenceModel: 'Q5_Q6_TRI_STATE_FAIL_CLOSED',
  fableConditions: {
    C1_null_neighbor_tri_state: 'IMPLEMENTED — tripleAccelEvidence() VALID | VIOLATION | INSUFFICIENT_EVIDENCE; INSUFFICIENT_EVIDENCE rejects the repair and keeps the C4 value; no neighbour substitution, no horizon widening.',
    C2_research_transparency: 'IMPLEMENTED — tig22_19_04_38 before/after with UNKNOWN video ground truth; V1.1 artefacts sealed under outputs/v1_1/.',
    C3_in_window_manoeuvre_tests: 'IMPLEMENTED — synthetic scenarios 10–13 with active repair path (gate C3_in_window_manoeuvre_tests_active_repair_path).',
  },
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
      insufficientEvidenceRejections: r.meta.insufficientEvidenceRejections,
      acceptedRepairs: r.repairedOnly.map((s) => ({
        label: s.label,
        c4Kmh: r.c4.find((x) => x.label === s.label)?.valueKmh,
        c51Kmh: s.valueKmh,
        q5Evidence: s.trace?.q5Evidence,
        q6Evidence: s.trace?.q6Evidence,
        attributionP: s.trace?.attributionP,
        videoReference: d4RefStatus(r.id, s.label),
      })),
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
    videoReference: d4RefStatus('TIG22', '2026-10-22T18:41:45Z'),
    q5Evidence: tig1845?.trace?.q5Evidence ?? null,
    q6Evidence: tig1845?.trace?.q6Evidence ?? null,
  },
  tig22_19_04_38: {
    disclosure: [
      'TIG22 19:04:38 was an ACCEPTED repair in V1.1 (53f5acebc) without video ground truth (reference ends 19:03:02; 19:04 is UNSCORED_VIDEO_GAP).',
      'C4 already carried a conspicuous estimate here (SPARSE_SUPPORT 100.11 km/h after 54.06 km/h at 19:04:36 and OUTLIER_REJECTED at 19:04:37).',
      'V1.1 moved at least one local plausibility violation (74.45 → 98.16 km/h within 1 s ≈ 6.6 m/s²) instead of independently proving its resolution.',
      'The null-neighbour finding originates from Fable\'s independent safety audit: tripleAccelViolation() returned 0 when a neighbour speed was null.',
      'V1.2 (this version) classifies the evidence as INSUFFICIENT_EVIDENCE, rejects the repair and keeps the C4 value. The true speed at 19:04 remains UNKNOWN; this is not a confirmed false alarm.',
    ],
    videoGroundTruth: 'UNKNOWN_UNSCORED_VIDEO_GAP',
    before: TIG22_190438_V1_1_OBSERVED,
    after: {
      version: C51.MOTION_CORE_SPEED_C5_1_VERSION,
      c4Kmh: tig190438C4?.valueKmh,
      c4Quality: tig190438C4?.quality,
      c51Kmh: tig190438?.valueKmh,
      repairState: tig190438?.repairState,
      candidateKmh: tig190438?.trace?.candidateKmh,
      q: tig190438?.trace?.q,
      q5Evidence: tig190438?.trace?.q5Evidence,
      q6Evidence: tig190438?.trace?.q6Evidence,
      q5Detail: tig190438?.trace?.q5Detail,
      q6Detail: tig190438?.trace?.q6Detail,
    },
    neighbourhood: ['2026-10-22T19:04:35Z', '2026-10-22T19:04:36Z', '2026-10-22T19:04:37Z', TIG22_190438, '2026-10-22T19:04:39Z', '2026-10-22T19:04:40Z', '2026-10-22T19:04:41Z'].map((label) => {
      const c4s = tig22?.c4.find((x) => x.label === label);
      const s = tig22?.c51Raw.find((x) => x.label === label);
      return { label, c4Kmh: c4s?.valueKmh ?? null, c4Quality: c4s?.quality ?? null, c51Kmh: s?.valueKmh ?? null, repairState: s?.repairState ?? null, videoReference: d4RefStatus('TIG22', label) };
    }),
  },
  speedRegression,
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
    algorithmFileSha256,
    algorithmBaselineHead: V1_1_ALGORITHM_HEAD,
    algorithmPatch: 'C1 null-neighbour tri-state (Q5/Q6 fail-closed); acceleration limits, FROZEN parameters and gates Q1–Q4/heading unchanged',
    productionPin: expectSha,
    codeSha,
    commands: [
      'node scripts/c5-1.support.test.cjs',
      'node scripts/c5-1.synthetic.test.cjs',
      'node scripts/run_c5_1_experiment.cjs --code-root <repo>',
    ],
    syntheticAudit,
    regressionBaseline: baselinePath,
    regressionBaselineV1_2: v12BaselinePath,
    regressionVsV1_1: {
      identicalOutsideExpectedDeltas: regressionCompare.identicalOutsideExpectedDeltas,
      expectedDeltas: regressionCompare.expectedDeltas,
      unexpectedMismatches: regressionCompare.mismatches,
    },
    regressionUnchanged: regressionCompare.unchanged,
    regressionMismatches: regressionCompare.mismatches,
  },
  finalVerdict: gates.allPass && regressionCompare.unchanged && syntheticsOk && supportOk
    ? 'SAFE_OFFLINE_CANDIDATE'
    : regressionCompare.unchanged
      ? 'NOT_PROVEN'
      : 'REGRESSION',
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
  priorV1_1Verdict: 'SAFE_OFFLINE_CANDIDATE (Fable: APPROVED_AS_SAFE_OFFLINE_CANDIDATE, conditions C1–C3)',
  independentGeneralization: 'NOT_YET_PROVEN',
  releaseScope: { shadow: 'NOT_APPROVED', production: 'NOT_APPROVED', productCodeChanged: false, productionMutations: false },
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
md.push('# C5.1 experiment report — V1.2 (safety patch C1–C3)\n');
md.push(`Generated: ${summary.generatedAt}\n`);
md.push(`Version: \`${summary.c51Version}\` · prior: \`${summary.priorVersion.version}\` (sealed under \`${summary.priorVersion.outputs}\`)\n`);
md.push(`Verdict: **${summary.finalVerdict}** · test verdict: **${summary.finalTestVerdict}** · regression vs V1.1 identical outside expected deltas: **${regressionCompare.identicalOutsideExpectedDeltas}**\n`);
md.push('Release scope: shadow NOT_APPROVED · production NOT_APPROVED · product code unchanged.\n');
md.push('## TIG22 19:04:38 — before / after (video ground truth UNKNOWN)\n');
for (const line of summary.tig22_19_04_38.disclosure) md.push(`- ${line}`);
md.push('');
md.push('| Version | C4 km/h (quality) | C5.1 km/h | repairState | Q5 / Q6 evidence |');
md.push('| --- | --- | --- | --- | --- |');
const b = summary.tig22_19_04_38.before;
const a = summary.tig22_19_04_38.after;
md.push(`| V1.1 (\`${b.algorithmHead.slice(0, 9)}\`) | ${b.c4Kmh.toFixed(2)} (${b.c4Quality}) | ${b.c51Kmh.toFixed(2)} | ${b.repairState} | passed on null→0 (vCand=0, vC4=0) |`);
md.push(`| V1.2 (this run) | ${a.c4Kmh?.toFixed(2)} (${a.c4Quality}) | ${a.c51Kmh?.toFixed(2)} | ${a.repairState} | ${a.q5Evidence} / ${a.q6Evidence} |`);
md.push('\nNeighbours examined (V1.2):\n');
md.push('```json\n' + JSON.stringify(summary.tig22_19_04_38.neighbourhood, null, 2) + '\n```\n');
md.push('## Accepted repairs per drive (with video-reference status)\n');
for (const d of summary.drives) {
  md.push(`- **${d.id}**: accepted ${d.eligibility.repairAccepted}, rejected ${d.eligibility.repairRejected}, uncertain ${d.eligibility.uncertain}, insufficient-evidence rejections ${d.eligibility.insufficientEvidenceRejections}`);
  for (const ar of d.eligibility.acceptedRepairs) md.push(`  - ${ar.label}: C4 ${ar.c4Kmh?.toFixed(2)} → C5.1 ${ar.c51Kmh?.toFixed(2)} km/h · ${ar.videoReference} · Q5 ${ar.q5Evidence} / Q6 ${ar.q6Evidence}`);
}
md.push('\n## Speed regression (common support vs video reference)\n');
md.push('| Drive | n | MAE C4 | MAE C5.1 | P95 C4 | P95 C5.1 | max C4 | max C5.1 | coverage C4 | coverage C5.1 | lost |');
md.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const s of speedRegression) md.push(`| ${s.id} | ${s.n} | ${s.maeC4} | ${s.maeC51} | ${s.p95C4} | ${s.p95C51} | ${s.maxAbsC4} | ${s.maxAbsC51} | ${s.coverageC4} | ${s.coverageC51} | ${s.lost} |`);
md.push('\n## Gates\n');
for (const g of gates.gates) {
  const label = g.status === 'NOT_VERIFIED' ? 'NOT_VERIFIED' : g.status;
  md.push(`- ${label} \`${g.gate}\` (${g.drive}) ${JSON.stringify(g.detail)}`);
}
md.push('\n## Gate counts\n');
md.push(JSON.stringify(summary.gateCounts, null, 2));
md.push('\n## Regression vs V1.1 baseline\n');
md.push('```json\n' + JSON.stringify(summary.testIntegrityAudit.regressionVsV1_1, null, 2) + '\n```\n');
md.push('\n## Test integrity\n');
md.push(JSON.stringify({ ...summary.testIntegrityAudit, syntheticAudit: summary.testIntegrityAudit.syntheticAudit ? '(see c5_1_synthetic_test_audit.json)' : null }, null, 2));
md.push('\n## TES16 trace\n');
md.push('```json\n' + JSON.stringify(tes16Labels, null, 2) + '\n```\n');
fs.writeFileSync(path.join(outDir, 'C5_1_REPORT.md'), md.join('\n'));

console.log('Wrote', path.join(outDir, 'c5_1_experiment_summary.json'));
console.log('FINAL_VERDICT=', summary.finalVerdict);
const gc = summary.gateCounts;
console.log('gates PASS/FAIL/NOT_VERIFIED', gc.pass, gc.fail, gc.notVerified, 'scored', gc.scored);
console.log('FINAL_TEST_VERDICT=', summary.finalTestVerdict);
console.log('regression unchanged', regressionCompare.unchanged);
