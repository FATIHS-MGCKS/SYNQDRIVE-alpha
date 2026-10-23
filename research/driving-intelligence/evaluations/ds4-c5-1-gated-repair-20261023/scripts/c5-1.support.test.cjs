#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const C51 = require('./c5-1-gated-repair.cjs');

const codeRoot = path.resolve(__dirname, '../../../../..');
const core = C51.loadCore(codeRoot);
const baseLat = 48.1;
const baseLon = 11.5;
const t0 = 1800000100;
const lab = (i) => C51.labelOf(t0 + i);

function mkPresent(i, metersAlong) {
  return {
    bucketLabelUtc: lab(i),
    availability: 'PRESENT',
    latitude: baseLat + metersAlong / 111320,
    longitude: baseLon,
  };
}

function supportAt(nPresent, centerIndex, excludeCenterFromSlope = false) {
  const buckets = [];
  for (let i = 0; i < nPresent; i++) buckets.push(mkPresent(i, i * 30));
  const ordered = core.orderMotionCoreGrid(buckets);
  const pm = core.presentBucketMap(ordered);
  const ptByLab = new Map();
  for (const b of buckets) {
    ptByLab.set(b.bucketLabelUtc, { attribution: 'OK' });
  }
  if (excludeCenterFromSlope) {
    ptByLab.set(lab(centerIndex), { attribution: 'TIME_SUSPECT' });
  }
  const tSec = t0 + centerIndex;
  const support = C51.buildSupport(tSec, pm, ptByLab, new Set(), new Set());
  return support;
}

// 4 valid points: insufficient (need 5)
assert.equal(supportAt(4, 2), null);

// 5 valid points: minimum support
{
  const s = supportAt(5, 2);
  assert.ok(s);
  assert.equal(s.totalForRule, 5);
  assert.equal(s.left, 2);
  assert.equal(s.right, 2);
  assert.equal(s.centerInUsed, true);
  assert.equal(s.supportLabelsUsed.length, 5);
}

// 6 and 7 points: no double-count of center
for (const n of [6, 7]) {
  const s = supportAt(n, 3);
  assert.ok(s);
  assert.equal(s.totalForRule, s.supportLabelsUsed.length);
  assert.ok(s.totalForRule >= 5);
  assert.equal(s.supportLabelsUsed.filter((l) => l === lab(3)).length, 1);
}

// TIME_SUSPECT center excluded from count and slope set
{
  const s = supportAt(7, 3, true);
  assert.ok(s);
  assert.equal(s.centerInUsed, false);
  assert.ok(!s.supportLabelsUsed.includes(lab(3)));
}

console.log('OK C5.1 support boundary tests');
