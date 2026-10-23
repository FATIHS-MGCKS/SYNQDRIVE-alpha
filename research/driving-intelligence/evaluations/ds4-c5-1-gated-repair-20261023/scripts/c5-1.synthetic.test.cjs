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
  schema: 'C5_1_SYNTHETIC_TEST_AUDIT_V1',
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

const fs = require('node:fs');
const out = path.join(__dirname, '..', 'outputs', 'c5_1_synthetic_test_audit.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(audit, null, 2));

console.log('OK all C5.1 synthetic tests');
console.log('Wrote', out);
