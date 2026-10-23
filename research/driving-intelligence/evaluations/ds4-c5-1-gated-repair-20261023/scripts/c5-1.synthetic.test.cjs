#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('./c5-1.synthetic.helpers.cjs').C51.loadCore(path.resolve(__dirname, '../../../../..'));
const H = require('./c5-1.synthetic.helpers.cjs');
const C51 = H.C51;
const L = H.L;

const codeRoot = path.resolve(__dirname, '../../../../..');
const baseLat = 48.1;
const baseLon = 11.5;
const t0 = 1800000200;
const lab = (i) => L.labelOf((t0 + i) * 1000);
const mk = (i, metersAlong, lonOff = 0) => ({
  bucketLabelUtc: lab(i),
  availability: 'PRESENT',
  latitude: baseLat + metersAlong / 111320,
  longitude: baseLon + lonOff,
});

const audit = {
  schema: 'C5_1_SYNTHETIC_TEST_AUDIT_V2_ACTIVE_REPAIR_PATH',
  c51Version: C51.MOTION_CORE_SPEED_C5_1_VERSION,
  scenarios: {},
};

function runC51(buckets, vehicleClass = 'TESLA') {
  return C51.computeC5_1GatedRepair(buckets, codeRoot, { vehicleClass });
}

function record(name, payload) {
  audit.scenarios[name] = payload;
}

// 1 constant cruise — ~100 km/h
{
  const buckets = Array.from({ length: 14 }, (_, i) => mk(i, i * 27.8));
  const leg = H.legSpeedKmh(buckets[6], buckets[7]);
  assert.ok(leg > 95 && leg < 105, `cruise leg ${leg}`);
  const { samples } = runC51(buckets);
  const mid = samples.find((s) => s.label === lab(7));
  assert.ok(mid.valueKmh > 95 && mid.valueKmh < 105);
  assert.equal(mid.repairState, 'PASS_THROUGH_OUTSIDE_WINDOW');
  record('1_constant_cruise', { legKmh: leg, valueKmh: mid.valueKmh });
}

// 2 strong accel — mean path accel ≥ 2.5 m/s², no mass repair
{
  const buckets = H.accelProfileBuckets({ t0Sec: t0, v0Mps: 4, accelMps2: 3.0 });
  const meanA = H.meanAlongTrackAccelMps2(buckets);
  assert.ok(meanA != null && meanA >= 2.5, `accel mean ${meanA} m/s²`);
  const { samples } = runC51(buckets);
  const accepted = samples.filter((s) => s.repairState === 'REPAIR_ACCEPTED');
  assert.ok(accepted.length < 3);
  record('2_strong_accel', { meanAccelMps2: meanA, repairAccepted: accepted.length });
}

// 3 strong brake — decel ≤ −2 m/s² mean, speeds strictly fall, no upward repair
{
  const buckets = H.decelProfileBuckets({ t0Sec: t0 + 100, v0Mps: 28, decelMps2: 3.0 });
  const meanA = H.meanAlongTrackAccelMps2(buckets);
  assert.ok(meanA != null && meanA <= -2.0, `brake mean ${meanA} m/s²`);
  const legs = [];
  for (let i = 1; i < buckets.length; i++) legs.push(H.legSpeedKmh(buckets[i - 1], buckets[i]));
  for (let i = 1; i < legs.length; i++) {
    if (legs[i] != null && legs[i - 1] != null) assert.ok(legs[i] <= legs[i - 1] + 0.5, 'speeds must not increase along path');
  }
  const c4 = core.computeC4AdaptiveL3(buckets);
  const { samples } = runC51(buckets);
  for (const c of c4) {
    if (c.valueKmh == null) continue;
    const s = samples.find((x) => x.label === c.label);
    assert.ok(s.valueKmh != null);
    if (s.repairState === 'REPAIR_ACCEPTED') {
      assert.ok(s.valueKmh <= c.valueKmh + 0.5, `upward repair at ${c.label}`);
    }
  }
  record('3_strong_brake', { meanAccelMps2: meanA, legSpeedsKmh: legs });
}

// 4 heading — guard exercised; veto blocks same Q-gate candidacy as straight accept
{
  const corner = H.cornerHeadingBuckets({ t0Sec: t0 + 200 });
  const pm = core.presentBucketMap(core.orderMotionCoreGrid(corner));
  const tSec = L.secOf(corner[7].bucketLabelUtc);
  const heading = C51.headingRateReject(tSec, pm);
  assert.ok(heading.reject, `heading rate ${heading.rateDegPerS} must exceed 25°/s`);
  const straight = Array.from({ length: 14 }, (_, i) => mk(i, i * 27.8 + (i === 7 ? 8 : 0)));
  const sStraight = runC51(straight).samples.find((x) => x.label === lab(7));
  assert.equal(sStraight.repairState, 'REPAIR_ACCEPTED');
  assert.equal(sStraight.trace?.headingReject, false);
  const q = sStraight.trace.q;
  const cand = sStraight.trace.candidateKmh;
  assert.ok(cand != null);
  const gatesWithoutHeading =
    q.Q1 && q.Q2 && q.Q3 && q.Q4 && q.Q5 && q.Q6 && cand != null;
  assert.equal(gatesWithoutHeading, true, 'straight repair candidacy must pass Q1–Q6');
  const wouldAcceptWithHeadingVeto = gatesWithoutHeading && !heading.reject;
  assert.equal(wouldAcceptWithHeadingVeto, false, 'heading veto must block this candidacy');
  record('4_heading_veto', {
    cornerRateDegPerS: heading.rateDegPerS,
    straightRepairState: sStraight.repairState,
    gatesWithoutHeading,
    headingRejectOnCornerGeometry: heading.reject,
    vetoBlocksCandidacy: true,
  });
}

// 5 start from stop
{
  const buckets = Array.from({ length: 14 }, (_, i) => mk(i, i < 2 ? 0 : (i - 2) ** 2 * 1.0));
  const vEarly = H.legSpeedKmh(buckets[1], buckets[2]);
  const vLate = H.legSpeedKmh(buckets[10], buckets[11]);
  assert.ok(vEarly != null && vEarly < 8, `early speed ${vEarly}`);
  assert.ok(vLate != null && vLate > 25 && vLate < 90, `late speed ${vLate}`);
  const { samples } = runC51(buckets);
  const still = samples.filter((s) => L.secOf(s.label) <= L.secOf(lab(1)));
  assert.ok(still.every((s) => (s.valueKmh ?? 0) < 12));
  record('5_start_from_stop', { vEarlyKmh: vEarly, vLateKmh: vLate });
}

// 6 TIME_SUSPECT attribution + accepted repair
{
  const buckets = Array.from({ length: 14 }, (_, i) => (i === 7 ? mk(i, i * 27.8 + 8) : mk(i, i * 27.8)));
  const { samples, meta } = runC51(buckets);
  assert.ok(meta.maxSupportOffset <= 4);
  const attributed = samples.some(
    (s) => s.trace?.attributionP === lab(7) || (s.trace?.timeSuspects || []).includes(lab(7)),
  );
  assert.ok(attributed);
  assert.ok(samples.some((s) => s.repairState === 'REPAIR_ACCEPTED'));
  record('6_time_suspect', { attributed, accepted: samples.filter((s) => s.repairState === 'REPAIR_ACCEPTED').length });
}

// 7 quarantine parity
{
  const buckets = Array.from({ length: 10 }, (_, i) => mk(i, i * 30));
  buckets[5] = { ...buckets[5], latitude: buckets[5].latitude + 0.002 };
  const c4 = core.computeC4AdaptiveL3(buckets);
  const { samples } = runC51(buckets);
  const qC4 = new Set(c4.filter((s) => s.quality === 'OUTLIER_REJECTED').map((s) => s.label));
  const qC51 = new Set(samples.filter((s) => s.quality === 'OUTLIER_REJECTED').map((s) => s.label));
  assert.deepEqual(qC4, qC51);
  record('7_quarantine', { labels: [...qC4] });
}

// 8 missing bucket
{
  const buckets = [];
  for (let i = 0; i < 10; i++) {
    if (i === 4) buckets.push({ bucketLabelUtc: lab(i), availability: 'ROW_ABSENT', latitude: null, longitude: null });
    else buckets.push(mk(i, i * 28));
  }
  const { samples } = runC51(buckets);
  assert.equal(samples.find((s) => s.label === lab(4)).valueKmh, null);
  record('8_missing_bucket', { absent: lab(4) });
}

// 9 real-brake protection — suspicion window + trough guard (unit + integration)
{
  const tBrake = t0 + 500;
  const labB = (i) => L.labelOf((tBrake + i) * 1000);
  const buckets = H.decelProfileBuckets({ t0Sec: tBrake, v0Mps: 27, decelMps2: 2.0 });
  buckets[5] = { ...buckets[5], latitude: buckets[5].latitude + 6 / 111320 };
  const c4 = core.computeC4AdaptiveL3(buckets);
  const c4ByLabel = new Map(c4.map((s) => [s.label, s]));
  const tSec = L.secOf(labB(9));
  const pSec = L.secOf(labB(5));
  const c4Trough = 14.5;
  const candUp = 21.0;
  const unitMap = new Map(c4ByLabel);
  unitMap.set(labB(8), { valueKmh: 28 });
  unitMap.set(labB(9), { valueKmh: c4Trough });
  unitMap.set(labB(10), { valueKmh: 20 });
  const unit = C51.upwardTroughManoeuvreGuard(tSec, c4Trough, candUp, unitMap, pSec);
  assert.equal(unit.pass, false, 'upward trough guard unit case');
  const { samples } = runC51(buckets);
  let integration = 'NOT_VERIFIED';
  let target = null;
  for (const s of samples) {
    if (!s.trace?.inWindow) continue;
    const c4s = c4ByLabel.get(s.label);
    if (!c4s?.valueKmh) continue;
    const tg = s.trace?.manoeuvreTroughGuard;
    if (tg && tg.pass === false) {
      integration = 'VERIFIED';
      target = { label: s.label, c4: c4s.valueKmh, c51: s.valueKmh, state: s.repairState };
      assert.equal(s.valueKmh, c4s.valueKmh);
      assert.equal(s.repairState, 'REPAIR_REJECTED');
      break;
    }
  }
  record('9_brake_protection', { unitGuard: unit.detail, integration, target });
  assert.equal(integration, 'VERIFIED', 'must observe trough/manoeuvre guard rejection in-window');
}

// ---------------------------------------------------------------------------------------------
// C3 (Fable signoff condition): manoeuvre scenarios with an ACTIVE repair path.
// Every scenario below asserts eligible > 0, candidates > 0 and Q5/Q6 evaluated; a scenario is
// never green because the repair window stayed empty.
// ---------------------------------------------------------------------------------------------
const EV_GUARDS = core.MOTION_CORE_EVENT_GUARDS_V0_1_DEV;
const EV_OPTIONS = core.MOTION_EVENT_V0_2_CANDIDATE_OPTIONS;
const TRUTH_TOL_KMH = 0.5;

function eventsOf(samples, estimator) {
  return core.detectMotionManoeuvreEvents(0, H.toMotionSamples(samples), estimator, EV_GUARDS.usableQualities, EV_OPTIONS);
}

function assertRepairPathActive(name, act) {
  assert.ok(act.eligible > 0, `${name}: eligible must be > 0 (got ${act.eligible})`);
  assert.ok(act.candidates > 0, `${name}: candidates must be > 0 (got ${act.candidates})`);
  assert.equal(act.q4Evaluated, act.candidates, `${name}: Q4 must be evaluated for every candidate`);
  assert.equal(act.q5Evaluated, act.candidates, `${name}: Q5 must be evaluated for every candidate`);
  assert.equal(act.q6Evaluated, act.candidates, `${name}: Q6 must be evaluated for every candidate`);
}

/** Compare every C5.1 sample against the clean-profile C4 truth of the same label. */
function truthComparison(cleanBuckets, dirtyBuckets, samples) {
  const c4Clean = core.computeC4AdaptiveL3(cleanBuckets);
  const c4Dirty = core.computeC4AdaptiveL3(dirtyBuckets);
  const byLabel = (arr) => new Map(arr.map((s) => [s.label, s]));
  const clean = byLabel(c4Clean);
  const dirty = byLabel(c4Dirty);
  const rows = [];
  for (const s of samples) {
    if (!s.trace?.inWindow) continue;
    rows.push({
      label: s.label,
      truthKmh: clean.get(s.label)?.valueKmh ?? null,
      c4DirtyKmh: dirty.get(s.label)?.valueKmh ?? null,
      c4DirtyQuality: dirty.get(s.label)?.quality ?? null,
      c51Kmh: s.valueKmh,
      repairState: s.repairState,
      attributionP: s.trace.attributionP,
      q: s.trace.q,
      q5Evidence: s.trace.q5Evidence,
      q6Evidence: s.trace.q6Evidence,
    });
  }
  return rows;
}

function assertAcceptedMatchTruth(name, rows, { noRaiseAboveTruth = true } = {}) {
  const accepted = rows.filter((r) => r.repairState === 'REPAIR_ACCEPTED');
  assert.ok(accepted.length >= 1, `${name}: at least one accepted repair expected`);
  const corrected = accepted.filter((r) => Math.abs(r.c4DirtyKmh - r.truthKmh) > TRUTH_TOL_KMH);
  assert.ok(corrected.length >= 1, `${name}: at least one accepted repair must correct a contaminated C4 value`);
  for (const r of accepted) {
    assert.ok(r.truthKmh != null, `${name}: truth missing at ${r.label}`);
    assert.ok(Math.abs(r.c51Kmh - r.truthKmh) <= TRUTH_TOL_KMH, `${name}: ${r.label} repaired ${r.c51Kmh} vs truth ${r.truthKmh}`);
    if (noRaiseAboveTruth) assert.ok(r.c51Kmh <= r.truthKmh + TRUTH_TOL_KMH, `${name}: ${r.label} raised above truth`);
    assert.equal(r.q5Evidence, C51.EVIDENCE.VALID, `${name}: accepted repair at ${r.label} must carry VALID Q5 evidence`);
    assert.equal(r.q6Evidence, C51.EVIDENCE.VALID, `${name}: accepted repair at ${r.label} must carry VALID Q6 evidence`);
  }
  for (const r of rows) {
    if (r.repairState !== 'REPAIR_ACCEPTED') {
      assert.equal(r.c51Kmh, r.c4DirtyKmh, `${name}: pass-through at ${r.label} must keep the C4 value`);
    }
  }
}

// 10 strong acceleration (≥ 2.5 m/s²) with ONE timing-jitter fix inside the active window
{
  const tA = t0 + 700;
  const labA = (i) => L.labelOf((tA + i) * 1000);
  const clean = H.accelProfileBuckets({ t0Sec: tA, v0Mps: 4, accelMps2: 3.0 });
  const meanA = H.meanAlongTrackAccelMps2(clean);
  assert.ok(meanA >= 2.5, `accel mean ${meanA} m/s²`);
  const dirty = H.jitterAlongTrack(clean, 7, -5);
  const result = runC51(dirty);
  const act = H.repairPathActivity(result);
  assertRepairPathActive('10_accel_time_suspect', act);
  const rows = truthComparison(clean, dirty, result.samples);
  const suspects = new Set(rows.flatMap((r) => (r.attributionP ? [r.attributionP] : [])));
  assert.deepEqual([...suspects], [labA(7)], 'exactly one TIME_SUSPECT, at the jittered fix');
  assert.ok(act.uncertain === 0, 'single suspect must not yield UNCERTAIN');
  assertAcceptedMatchTruth('10_accel_time_suspect', rows);
  const accelEvents = eventsOf(result.samples, C51.MOTION_CORE_SPEED_C5_1_VERSION).filter((e) => e.kind === 'ACCELERATION');
  assert.ok(accelEvents.length >= 1, 'acceleration manoeuvre must survive repair');
  const covers = accelEvents.some((e) => L.secOf(e.startLabel) <= tA + 6 && L.secOf(e.endLabel) >= tA + 8);
  assert.ok(covers, 'acceleration event must span the repaired window');
  // Physical check from coordinates: the clean profile really accelerates across the window.
  const vIn = H.legSpeedKmh(clean[4], clean[5]);
  const vOut = H.legSpeedKmh(clean[9], clean[10]);
  assert.ok(vOut - vIn >= 5 * 3.0 * 3.6 - 1, `window acceleration ${vIn}→${vOut}`);
  record('10_accel_time_suspect', { meanAccelMps2: meanA, jitterM: -5, activity: act, rows, accelEvents: accelEvents.length });
}

// 11 strong braking (≤ −2 m/s²) with ONE suspicious GPS fix inside the manoeuvre
{
  const tB = t0 + 800;
  const labB = (i) => L.labelOf((tB + i) * 1000);
  const clean = H.decelProfileBuckets({ t0Sec: tB, v0Mps: 28, decelMps2: 3.0 });
  const meanA = H.meanAlongTrackAccelMps2(clean);
  assert.ok(meanA <= -2.0, `brake mean ${meanA} m/s²`);
  const dirty = H.jitterAlongTrack(clean, 5, 5);
  const result = runC51(dirty);
  const act = H.repairPathActivity(result);
  assertRepairPathActive('11_brake_suspect_fix', act);
  const rows = truthComparison(clean, dirty, result.samples);
  const suspects = new Set(rows.flatMap((r) => (r.attributionP ? [r.attributionP] : [])));
  assert.deepEqual([...suspects], [labB(5)], 'exactly one TIME_SUSPECT, at the suspicious fix');
  assertAcceptedMatchTruth('11_brake_suspect_fix', rows);
  const c51Series = result.samples.filter((s) => s.valueKmh != null && L.secOf(s.label) >= tB + 2 && L.secOf(s.label) <= tB + 9);
  for (let i = 1; i < c51Series.length; i++) {
    assert.ok(c51Series[i].valueKmh <= c51Series[i - 1].valueKmh + 0.5, `repaired series must keep falling at ${c51Series[i].label}`);
  }
  const decelEvents = eventsOf(result.samples, C51.MOTION_CORE_SPEED_C5_1_VERSION).filter((e) => e.kind === 'DECELERATION');
  assert.ok(decelEvents.length >= 1, 'braking manoeuvre must survive repair');
  const c4DecelEvents = eventsOf(core.computeC4AdaptiveL3(dirty), 'C4_ADAPTIVE_L3').filter((e) => e.kind === 'DECELERATION');
  assert.ok(decelEvents.length >= c4DecelEvents.length, 'repair must not drop a braking event');
  record('11_brake_suspect_fix', { meanAccelMps2: meanA, jitterM: 5, activity: act, rows, decelEventsC4: c4DecelEvents.length, decelEventsC51: decelEvents.length });
}

// 12 start from standstill with a repair suspect during the pull-away
{
  const tS = t0 + 900;
  const labS = (i) => L.labelOf((tS + i) * 1000);
  const clean = H.startFromStopBuckets({ t0Sec: tS, accelMps2: 2.0 });
  assert.ok(H.legSpeedKmh(clean[0], clean[1]) === 0, 'standstill legs must be zero');
  const dirty = H.jitterAlongTrack(clean, 9, -5);
  const result = runC51(dirty);
  const act = H.repairPathActivity(result);
  assertRepairPathActive('12_start_from_stop_suspect', act);
  const rows = truthComparison(clean, dirty, result.samples);
  const suspects = new Set(rows.flatMap((r) => (r.attributionP ? [r.attributionP] : [])));
  assert.deepEqual([...suspects], [labS(9)], 'exactly one TIME_SUSPECT during pull-away');
  assertAcceptedMatchTruth('12_start_from_stop_suspect', rows);
  const still = result.samples.filter((s) => L.secOf(s.label) <= tS + 2);
  for (const s of still) {
    assert.ok((s.valueKmh ?? 0) < 2, `standstill second ${s.label} must stay still (${s.valueKmh})`);
    assert.notEqual(s.repairState, 'REPAIR_ACCEPTED', 'standstill must never be repaired');
  }
  record('12_start_from_stop_suspect', { jitterM: -5, activity: act, rows });
}

// 13 OUTLIER_REJECTED neighbour with null speed — the C1 tri-state must fail closed
{
  const tO = t0 + 1000;
  const labO = (i) => L.labelOf((tO + i) * 1000);
  const mkO = (i, m) => ({ bucketLabelUtc: labO(i), availability: 'PRESENT', latitude: baseLat + m / 111320, longitude: baseLon });
  const cruise = Array.from({ length: 16 }, (_, i) => mkO(i, i * 27.8));
  const control = H.jitterAlongTrack(cruise, 7, -5);
  // Lagging single-fix outlier two seconds before the TIME_SUSPECT: C4 quarantines only that fix
  // (null speed) and the neighbouring centre keeps a numeric SPARSE_SUPPORT value — the TIG22
  // 19:04:37/19:04:38 configuration.
  const OUTLIER_IDX = 4;
  const CENTRE_IDX = 5;
  const withOutlier = H.singleFixOutlier(control, OUTLIER_IDX, -60);

  // Unit: a present neighbour with null speed is INSUFFICIENT_EVIDENCE, never 0 m/s².
  const pmU = core.presentBucketMap(core.orderMotionCoreGrid(withOutlier));
  const tC = tO + CENTRE_IDX;
  const tOut = tO + OUTLIER_IDX;
  const unit = C51.tripleAccelEvidence(tC, 100, pmU, (sec) => (sec === tOut ? null : 100), 9, (sec) => (sec === tOut ? 'OUTLIER_REJECTED' : 'OK'));
  assert.equal(unit.status, C51.EVIDENCE.INSUFFICIENT_EVIDENCE);
  assert.equal(unit.reason, 'neighbor_speed_null');
  assert.equal(unit.aMaxMps2, null, 'no acceleration figure may be synthesised from a null neighbour');
  const unitValid = C51.tripleAccelEvidence(tC, 100, pmU, () => 100, 9, () => 'OK');
  assert.equal(unitValid.status, C51.EVIDENCE.VALID);
  const unitViolation = C51.tripleAccelEvidence(tC, 100, pmU, (sec) => (sec === tOut ? 50 : 100), 9, () => 'OK');
  assert.equal(unitViolation.status, C51.EVIDENCE.VIOLATION);
  const unitAbsent = C51.tripleAccelEvidence(tO, 100, pmU, () => 100, 9, () => 'OK');
  assert.equal(unitAbsent.status, C51.EVIDENCE.INSUFFICIENT_EVIDENCE);
  assert.equal(unitAbsent.reason, 'neighbor_absent_within_gap');

  // Control: without the outlier the same centre has complete (VALID) Q5/Q6 evidence.
  const ctrl = runC51(control);
  const ctrlCentre = ctrl.samples.find((s) => s.label === labO(CENTRE_IDX));
  assert.ok(ctrlCentre.trace?.candidateKmh != null, 'control centre must have a candidate');
  assert.equal(ctrlCentre.trace.q5Evidence, C51.EVIDENCE.VALID, 'control centre evidence must be VALID');
  assert.equal(ctrlCentre.trace.q6Evidence, C51.EVIDENCE.VALID);
  assert.ok(ctrl.meta.repairAccepted >= 3, 'control run must repair the jitter cluster');

  // Integration: same centre, but its previous neighbour is OUTLIER_REJECTED with null C4 speed.
  const result = runC51(withOutlier);
  const act = H.repairPathActivity(result);
  assertRepairPathActive('13_outlier_neighbour_fail_closed', act);
  const c4 = core.computeC4AdaptiveL3(withOutlier);
  const c4By = new Map(c4.map((s) => [s.label, s]));
  assert.equal(c4By.get(labO(OUTLIER_IDX)).quality, 'OUTLIER_REJECTED');
  assert.equal(c4By.get(labO(OUTLIER_IDX)).valueKmh, null);
  assert.ok(c4By.get(labO(CENTRE_IDX)).valueKmh != null, 'centre must keep a numeric C4 value');
  const centre = result.samples.find((s) => s.label === labO(CENTRE_IDX));
  const t = centre.trace;
  assert.ok(t.candidateKmh != null, 'centre must have a repair candidate');
  assert.equal(t.attributionP, labO(7));
  assert.equal(t.q.Q1 && t.q.Q2 && t.q.Q3 && t.q.Q4 && !t.headingReject, true, 'only Q5/Q6 may block this centre');
  assert.equal(t.q.Q5, false);
  assert.equal(t.q.Q6, false);
  assert.equal(t.q5Evidence, C51.EVIDENCE.INSUFFICIENT_EVIDENCE);
  assert.equal(t.q6Evidence, C51.EVIDENCE.INSUFFICIENT_EVIDENCE);
  assert.equal(t.q5Detail.reason, 'insufficient_evidence_fail_closed');
  assert.equal(t.q5Detail.evidenceReason, 'neighbor_speed_null');
  const prevNb = t.q5Detail.neighborsExamined.find((n) => n.side === 'prev');
  assert.deepEqual(
    { label: prevNb.label, present: prevNb.present, speedKmh: prevNb.speedKmh, c4Quality: prevNb.c4Quality, usable: prevNb.usable },
    { label: labO(OUTLIER_IDX), present: true, speedKmh: null, c4Quality: 'OUTLIER_REJECTED', usable: false },
  );
  const nextNb = t.q5Detail.neighborsExamined.find((n) => n.side === 'next');
  assert.equal(nextNb.usable, true, 'the other neighbour is numeric — only the null side blocks');
  assert.equal(centre.repairState, 'REPAIR_REJECTED');
  assert.equal(centre.valueKmh, c4By.get(labO(CENTRE_IDX)).valueKmh, 'C4 value must be preserved on fail-closed');
  assert.ok(act.insufficientEvidenceRejections >= 1);
  assert.ok(act.q5Insufficient >= 1);
  assert.ok(act.accepted >= 1, 'repairs away from the null neighbour must still be possible');
  const quarantineC51 = result.samples.filter((s) => s.quality === 'OUTLIER_REJECTED').map((s) => s.label);
  assert.deepEqual(quarantineC51, [labO(OUTLIER_IDX)], 'quarantine parity with C4');
  record('13_outlier_neighbour_fail_closed', {
    unit: { insufficient: unit, valid: unitValid.status, violation: unitViolation.status, absent: unitAbsent.status },
    control: {
      centre: labO(CENTRE_IDX),
      repairState: ctrlCentre.repairState,
      q5Evidence: ctrlCentre.trace.q5Evidence,
      repairAccepted: ctrl.meta.repairAccepted,
    },
    integration: {
      centre: labO(CENTRE_IDX),
      outlier: labO(OUTLIER_IDX),
      c4Kmh: c4By.get(labO(CENTRE_IDX)).valueKmh,
      c4Quality: c4By.get(labO(CENTRE_IDX)).quality,
      candidateKmh: t.candidateKmh,
      c51Kmh: centre.valueKmh,
      repairState: centre.repairState,
      q: t.q,
      q5Evidence: t.q5Evidence,
      q6Evidence: t.q6Evidence,
      neighborsExamined: t.q5Detail.neighborsExamined,
      v1_1CounterfactualNote: 'Q1–Q4 pass, heading ok, candidate present: under V1.1 (null neighbour → 0 m/s²) this centre would have been REPAIR_ACCEPTED.',
    },
    activity: act,
  });
}

const fs = require('node:fs');
const out = path.join(__dirname, '..', 'outputs', 'v1_2', 'c5_1_synthetic_test_audit.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(audit, null, 2));

console.log('OK all C5.1 synthetic tests');
console.log('Wrote', out);
