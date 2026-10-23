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
const t0 = 1800000000;
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

// 1 constant cruise
{
  const buckets = Array.from({ length: 14 }, (_, i) => mk(i, i * 27.8));
  const { samples } = runC51(buckets);
  const mid = samples.find((s) => s.label === lab(7));
  assert.ok(mid.valueKmh > 95 && mid.valueKmh < 105);
  assert.equal(mid.repairState, 'PASS_THROUGH_OUTSIDE_WINDOW');
}

// 2 strong accel — must not repair real manoeuvre interior
{
  const buckets = Array.from({ length: 15 }, (_, i) => mk(i, i * i * 0.5 + i * 8));
  const { samples } = runC51(buckets);
  const accepted = samples.filter((s) => s.repairState === 'REPAIR_ACCEPTED');
  assert.ok(accepted.length < samples.length * 0.5);
}

// 3 strong brake — no coverage loss vs C4
{
  const buckets = Array.from({ length: 15 }, (_, i) => mk(i, 200 - i * 12));
  const c4 = core.computeC4AdaptiveL3(buckets);
  const { samples } = runC51(buckets);
  for (const c of c4) {
    if (c.valueKmh == null) continue;
    const s = samples.find((x) => x.label === c.label);
    assert.ok(s.valueKmh != null, `numeric loss at ${c.label}`);
  }
}

// 4 curve
{
  const buckets = Array.from({ length: 12 }, (_, i) => ({
    ...mk(i, i * 25),
    longitude: baseLon + Math.sin(i / 3) * 0.0003,
  }));
  const { samples } = runC51(buckets);
  assert.ok(samples[6].valueKmh != null);
}

// 5 start from stop
{
  const buckets = Array.from({ length: 14 }, (_, i) => mk(i, i < 2 ? 0 : (i - 2) ** 2 * 4));
  const { samples } = runC51(buckets);
  assert.ok(samples.every((s) => s.valueKmh !== 0));
}

// 6 time-mislabeled interior (single spike)
{
  const buckets = Array.from({ length: 12 }, (_, i) => {
    if (i === 6) return mk(i, i * 27.8 + 35);
    return mk(i, i * 27.8);
  });
  const { samples, meta } = runC51(buckets);
  assert.ok(meta.maxSupportOffset <= 4);
  assert.ok(samples.every((s) => s.quality !== 'OUTLIER_REJECTED' || s.repairState === 'PASS_THROUGH_NO_REPAIR'));
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

console.log('OK all C5.1 synthetic tests');
