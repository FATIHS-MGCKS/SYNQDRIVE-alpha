#!/usr/bin/env node
'use strict';
// Per-second probes of the audit windows on the production SHA (read-only, outside repo).
const path = require('node:path');
const P = require('./paths.cjs');
const R = require(P.replayScript);
const L = require(P.evalLib);
const { haversineMeters } = require(path.join(P.DI, 'core/geo/haversine.ts'));

const drives = R.loadDrives();
const byId = Object.fromEntries(drives.map((d) => [d.id, d]));

const WINDOWS = [
  ['TIG22', '2026-10-22T18:41:06Z', '2026-10-22T18:41:17Z', 'Borderline miss ACCEL 18:41:11-13 (2->15, peak 1.94)'],
  ['TIG22', '2026-10-22T18:42:52Z', '2026-10-22T18:43:02Z', 'Borderline miss DECEL 18:42:56-58 (14->3, peak 1.67)'],
  ['TIG22', '2026-10-22T18:44:08Z', '2026-10-22T18:44:22Z', 'HARD miss ACCEL 18:44:16-18 (0->15, peak 2.5)'],
  ['TIG22', '2026-10-22T18:49:08Z', '2026-10-22T18:49:28Z', 'GPS outlier cluster / quarantine 18:49'],
  ['TIG22', '2026-10-22T18:58:44Z', '2026-10-22T18:58:52Z', 'Borderline miss DECEL 18:58:47-49 (22->9, peak 1.94)'],
  ['TIG22', '2026-10-22T19:02:30Z', '2026-10-22T19:02:39Z', 'Borderline miss DECEL 19:02:33-36 (23->6, peak 1.94)'],
  ['TIG22', '2026-10-22T19:04:28Z', '2026-10-22T19:04:53Z', 'Trip tail 19:04 (no video GT; plausibility only)'],
  ['TES16', '2026-10-16T03:50:16Z', '2026-10-16T03:50:26Z', 'Hard false alarm ACCEL 03:50:20-23 (ref flat 133)'],
];

for (const [id, from, to, title] of WINDOWS) {
  const d = byId[id];
  const refBySec = new Map(d.refRows.map((r) => [r.sec, r.ref]));
  const c4BySec = new Map(d.c4.map((s) => [L.secOf(s.label), s]));
  const bBySec = new Map(d.buckets.map((b) => [L.secOf(b.bucketLabelUtc), b]));
  const f = L.secOf(from), t = L.secOf(to);
  console.log(`\n## ${id} ${from}..${to} — ${title}`);
  console.log('UTC      | ref | C4     | step a (m/s2) | quality          | pos | fwd-chord km/h | flags');
  let prevC4 = null, prevSec = null;
  for (let s = f; s <= t; s++) {
    const c = c4BySec.get(s);
    const b = bBySec.get(s);
    const nb = bBySec.get(s + 1);
    const pos = !b ? 'x' : b.latitude == null ? '-' : 'P';
    let chord = '';
    if (b && nb && b.latitude != null && nb.latitude != null) {
      chord = (haversineMeters(b.latitude, b.longitude, nb.latitude, nb.longitude) * 3.6).toFixed(1);
    }
    let step = '';
    if (c && c.valueKmh != null && prevC4 != null) step = ((c.valueKmh - prevC4) / 3.6 / (s - prevSec)).toFixed(2);
    if (c && c.valueKmh != null) { prevC4 = c.valueKmh; prevSec = s; }
    const hh = new Date(s * 1000).toISOString().slice(11, 19);
    console.log(`${hh} | ${String(refBySec.get(s) ?? '·').padStart(3)} | ${String(c?.valueKmh == null ? '·' : c.valueKmh.toFixed(1)).padStart(6)} | ${step.padStart(13)} | ${(c?.quality ?? '').padEnd(16)} | ${pos}   | ${chord.padStart(14)} | ${(c?.flags ?? []).filter((x) => !x.startsWith('{')).join(' ')}`);
  }
}
