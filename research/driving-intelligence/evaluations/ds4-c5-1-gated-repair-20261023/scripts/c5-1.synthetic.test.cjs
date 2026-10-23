#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const L = require('../../ds4-speed-video-reference-20261023/scripts/eval_lib.cjs');
const C51 = require('./c5-1-gated-repair.cjs');

const codeRoot = path.resolve(__dirname, '../../../../..');
const core = C51.loadCore(codeRoot);
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

function runC51(buckets, vehicleClass = 'TESLA') {
  return C51.computeC5_1GatedRepair(buckets, codeRoot, { vehicleClass });
}

// 1 constant cruise — scaled ~100 km/h
{
  const buckets = Array.from({ length: 14 }, (_, i) => mk(i, i * 27.8));
  const { samples } = runC51(buckets);
  const mid = samples.find((s) => s.label === lab(7));
  assert.ok(mid.valueKmh > 95 && mid.valueKmh < 105);
  assert.equal(mid.repairState, 'PASS_THROUGH_OUTSIDE_WINDOW');
}

// 2 strong accel — interior not mass-repaired
{
  const buckets = Array.from({ length: 15 }, (_, i) => mk(i, i * i * 0.5 + i * 8));
  const { samples } = runC51(buckets);
  const accepted = samples.filter((s) => s.repairState === 'REPAIR_ACCEPTED');
  assert.ok(accepted.length < 3);
}

// 3 strong brake — falling speeds, no upward repair at trough
{
  const buckets = Array.from({ length: 15 }, (_, i) => mk(i, 400 - i * 14));
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
}

// 4 curve — heading veto blocks repair at sharp turn
{
  const buckets = Array.from({ length: 14 }, (_, i) => {
    const along = i <= 6 ? i * 28 : 6 * 28;
    const cross = i <= 6 ? 0 : (i - 6) * 28;
    return {
      bucketLabelUtc: lab(i),
      availability: 'PRESENT',
      latitude: baseLat + along / 111320,
      longitude: baseLon + cross / (111320 * Math.cos((baseLat * Math.PI) / 180)),
    };
  });
  buckets[7] = { ...buckets[7], latitude: buckets[7].latitude + 0.0002 };
  const pm = core.presentBucketMap(core.orderMotionCoreGrid(buckets));
  const tSec = L.secOf(lab(7));
  const headingOnly = C51.headingRateReject(tSec, pm);
  assert.ok(headingOnly.reject, 'synthetic 90° corner must exceed heading rate threshold');
  const straight = Array.from({ length: 14 }, (_, i) => mk(i, i * 28));
  const spike = { ...straight[7], latitude: straight[7].latitude + 0.0002 };
  straight[7] = spike;
  const { samples } = runC51(straight);
  const s7 = samples.find((x) => x.label === lab(7));
  const eligible = s7.repairState === 'REPAIR_REJECTED' || s7.repairState === 'REPAIR_ACCEPTED';
  if (eligible && s7.trace?.candidateKmh != null && s7.trace?.q?.Q2) {
    assert.equal(s7.repairState, 'REPAIR_REJECTED');
    assert.ok(s7.trace.headingReject || !s7.trace.q.Q4);
  }
}

// 5 start from stop — plausible pull-away
{
  const buckets = Array.from({ length: 14 }, (_, i) => mk(i, i < 2 ? 0 : (i - 2) ** 2 * 4));
  const { samples } = runC51(buckets);
  assert.ok(samples.filter((s) => s.valueKmh != null).length >= 10);
}

// 6 time-mislabeled interior — TIME_SUSPECT + optional accept
{
  const buckets = Array.from({ length: 14 }, (_, i) => {
    if (i === 7) return mk(i, i * 27.8 + 8);
    return mk(i, i * 27.8);
  });
  const { samples, meta } = runC51(buckets);
  assert.ok(meta.maxSupportOffset <= 4);
  const attributed = samples.some(
    (s) => s.trace?.attributionP === lab(7) || (s.trace?.timeSuspects || []).includes(lab(7)),
  );
  assert.ok(attributed, 'TIME_SUSPECT attribution on spike label');
  const accepted = samples.filter((s) => s.repairState === 'REPAIR_ACCEPTED');
  assert.ok(accepted.length >= 1, 'at least one justified repair accepted');
}

// 7 lateral outlier quarantine parity
{
  const buckets = Array.from({ length: 10 }, (_, i) => mk(i, i * 30));
  buckets[5] = { ...buckets[5], latitude: buckets[5].latitude + 0.002 };
  const c4 = core.computeC4AdaptiveL3(buckets);
  const { samples } = runC51(buckets);
  const qC4 = new Set(c4.filter((s) => s.quality === 'OUTLIER_REJECTED').map((s) => s.label));
  const qC51 = new Set(samples.filter((s) => s.quality === 'OUTLIER_REJECTED').map((s) => s.label));
  assert.deepEqual(qC4, qC51);
}

// 8 missing bucket — no invented speed
{
  const buckets = [];
  for (let i = 0; i < 10; i++) {
    if (i === 4) buckets.push({ bucketLabelUtc: lab(i), availability: 'ROW_ABSENT', latitude: null, longitude: null });
    else buckets.push(mk(i, i * 28));
  }
  const { samples } = runC51(buckets);
  assert.equal(samples.find((s) => s.label === lab(4)).valueKmh, null);
}

// Real-brake style trough: upward repair blocked when P is astern (reference-free guard)
{
  const buckets = Array.from({ length: 12 }, (_, i) => mk(i, 300 - i * 12));
  buckets[5] = mk(5, 300 - 5 * 12 + 25);
  const c4 = core.computeC4AdaptiveL3(buckets);
  const { samples } = runC51(buckets);
  const c4t = c4.find((s) => s.label === lab(6))?.valueKmh;
  const s6 = samples.find((s) => s.label === lab(6));
  if (s6.repairState === 'REPAIR_REJECTED' && c4t != null) {
    assert.equal(s6.valueKmh, c4t);
  }
}

console.log('OK all C5.1 synthetic tests');
