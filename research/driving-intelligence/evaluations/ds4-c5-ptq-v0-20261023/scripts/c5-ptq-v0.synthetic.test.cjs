#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const L = require('../../ds4-speed-video-reference-20261023/scripts/eval_lib.cjs');
const C5 = require('./c5-ptq-v0.cjs');

const codeRoot = path.resolve(__dirname, '../../../../..');
const core = C5.loadCore(codeRoot);

const baseLat = 48.1;
const baseLon = 11.5;
const t0 = 1800000000;
const lab = (i) => L.labelOf((t0 + i) * 1000);
const mk = (i, metersAlong) => ({
  bucketLabelUtc: lab(i),
  availability: 'PRESENT',
  latitude: baseLat + (metersAlong / 111320),
  longitude: baseLon,
});

function run(name, buckets, check) {
  const { samples } = C5.computeC5PtqV0(buckets, undefined, codeRoot);
  const c4 = core.computeC4AdaptiveL3(buckets);
  check({ samples, c4 });
  console.log('OK', name);
}

// strong acceleration along straight line
run('accel_manoeuvre', Array.from({ length: 15 }, (_, i) => mk(i, i * i * 0.5 + i * 8)), ({ samples }) => {
  const mid = samples[8];
  assert.ok(mid.valueKmh != null && mid.valueKmh > 20);
});

// hard brake
run('brake_manoeuvre', Array.from({ length: 15 }, (_, i) => mk(i, 200 - i * 12)), ({ samples }) => {
  const mid = samples[10];
  assert.ok(mid.valueKmh != null);
});

// curve: gentle lateral offset
run('curve', Array.from({ length: 12 }, (_, i) => mk(i, i * 25)), ({ samples }) => {
  const withLon = Array.from({ length: 12 }, (_, i) => ({
    ...mk(i, i * 25),
    longitude: baseLon + Math.sin(i / 3) * 0.0003,
  }));
  const { samples: s2 } = C5.computeC5PtqV0(withLon, undefined, codeRoot);
  assert.ok(s2[6].valueKmh != null);
});

// start from stop
run('start_from_stop', Array.from({ length: 14 }, (_, i) => mk(i, i < 2 ? 0 : (i - 2) ** 2 * 4)), ({ samples }) => {
  assert.equal(samples[0].valueKmh, null);
  assert.ok(samples.every((s) => s.valueKmh !== 0));
  const anyMoving = samples.some((s) => s.valueKmh != null && s.valueKmh > 10);
  assert.ok(anyMoving, 'expected at least one post-stop speed estimate');
});

// lateral outlier
run('lateral_outlier', (() => {
  const b = Array.from({ length: 10 }, (_, i) => mk(i, i * 30));
  b[5] = { ...b[5], latitude: b[5].latitude + 0.002 };
  return b;
})(), ({ samples, c4 }) => {
  const qC4 = c4.find((s) => s.label === lab(5))?.quality;
  const qC5 = samples.find((s) => s.label === lab(5))?.quality;
  assert.ok(qC4 === 'OUTLIER_REJECTED' || qC5 === 'OUTLIER_REJECTED' || samples[5].valueKmh != null);
});

// missing buckets
run('missing_buckets', (() => {
  const b = [];
  for (let i = 0; i < 10; i++) {
    if (i === 3 || i === 4) b.push({ bucketLabelUtc: lab(i), availability: 'ROW_ABSENT', latitude: null, longitude: null });
    else b.push(mk(i, i * 28));
  }
  return b;
})(), ({ samples }) => {
  assert.equal(samples.find((s) => s.label === lab(3)).quality, 'NO_POSITION');
});

// constant cruise
run('constant_cruise', Array.from({ length: 14 }, (_, i) => mk(i, i * 27.8)), ({ samples }) => {
  const v = samples[7].valueKmh;
  assert.ok(v > 95 && v < 105);
});

// teleport leg should stay quarantined (synthetic spike)
run('teleport_quarantine', (() => {
  const b = Array.from({ length: 10 }, (_, i) => mk(i, i * 25));
  b[5] = mk(5, 5 * 25 + 400);
  return b;
})(), ({ samples, c4 }) => {
  const labs = new Set(c4.filter((s) => s.quality === 'OUTLIER_REJECTED').map((s) => s.label));
  const labs5 = new Set(samples.filter((s) => s.quality === 'OUTLIER_REJECTED').map((s) => s.label));
  assert.deepEqual(labs, labs5);
});

console.log('all synthetic tests passed');
