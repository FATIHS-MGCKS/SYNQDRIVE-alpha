#!/usr/bin/env node
'use strict';
const P = require('./paths.cjs');
const R = require(P.replayScript);
const L = require(P.evalLib);
const { core } = R;
const drives = R.loadDrives();
const byId = Object.fromEntries(drives.map((d) => [d.id, d]));
const WINDOWS = [
  ['TES16', '2026-10-16T03:50:16Z', '2026-10-16T03:50:26Z'],
  ['TIG22', '2026-10-22T19:04:28Z', '2026-10-22T19:04:53Z'],
  ['TIG22', '2026-10-22T18:44:12Z', '2026-10-22T18:44:20Z'],
];
for (const [id, from, to] of WINDOWS) {
  const d = byId[id];
  const c5 = core.computeC5_1GatedRepair(d.buckets, { vehicleClass: d.identity.vehicleClass });
  const c5By = new Map(c5.samples.map((s) => [L.secOf(s.label), s]));
  const c4By = new Map(d.c4.map((s) => [L.secOf(s.label), s]));
  const refBy = new Map(d.refRows.map((r) => [r.sec, r.ref]));
  console.log(`\n## ${id} ${from}..${to} (class ${d.identity.vehicleClass})`);
  console.log('UTC      | ref | C4     | C4 q           | C5.1   | C5.1 q         | repairState               | note');
  for (let s = L.secOf(from); s <= L.secOf(to); s++) {
    const a = c4By.get(s), b = c5By.get(s);
    const t = b?.trace;
    const note = b?.repairState && b.repairState !== 'PASS_THROUGH_OUTSIDE_WINDOW' ? JSON.stringify({ q5: t?.q5Evidence, q6: t?.q6Evidence, r: t?.q5Detail?.reason ?? t?.q5Detail?.evidenceReason }) : '';
    const hh = new Date(s * 1000).toISOString().slice(11, 19);
    console.log(`${hh} | ${String(refBy.get(s) ?? '·').padStart(3)} | ${String(a?.valueKmh == null ? '·' : a.valueKmh.toFixed(1)).padStart(6)} | ${(a?.quality ?? '').padEnd(14)} | ${String(b?.valueKmh == null ? '·' : b.valueKmh.toFixed(1)).padStart(6)} | ${(b?.quality ?? '').padEnd(14)} | ${(b?.repairState ?? '').padEnd(25)} | ${note}`);
  }
}
