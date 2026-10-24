#!/usr/bin/env node
'use strict';
// Read-only FSM context probe: V0.3 (production before 2026-10-24T09:50Z) vs V0.4 Gap Bridge V1.3.1
// (empty auxiliary set — stationarySupportedLabels come from DI-V0 trip intervals that the offline
// evidence containers do not carry; this is a documented replay limitation, not a production claim).
const P = require('./paths.cjs');
const R = require(P.replayScript);
const L = require(P.evalLib);
const { core } = R;
const drives = R.loadDrives();
const byId = Object.fromEntries(drives.map((d) => [d.id, d]));
const WINDOWS = [
  ['TIG22', '2026-10-22T18:44:08Z', '2026-10-22T18:44:22Z'],
  ['TIG22', '2026-10-22T19:04:28Z', '2026-10-22T19:04:53Z'],
  ['TES16', '2026-10-16T03:50:16Z', '2026-10-16T03:50:26Z'],
];
const stateOf = (l) => l?.state ?? l?.motionState ?? JSON.stringify(l);
for (const [id, from, to] of WINDOWS) {
  const d = byId[id];
  const kin = core.withImplausibleLegEndpointsQuarantined(d.buckets);
  const v03 = core.runMotionFsm(kin, d.c4, 'RETROSPECTIVE', null, core.MOTION_FSM_PARAMS_V0_2_DEV, core.MOTION_FSM_V0_3_CANDIDATE_OPTIONS);
  const v04 = core.runMotionFsm(kin, d.c4, 'RETROSPECTIVE', null, core.MOTION_FSM_PARAMS_V0_2_DEV, core.MOTION_FSM_V0_4_GAP_BRIDGE_OPTIONS, { stationarySupportedLabels: new Set() });
  const b3 = new Map(v03.map((l) => [L.secOf(l.label ?? l.bucketLabelUtc), l]));
  const b4 = new Map(v04.map((l) => [L.secOf(l.label ?? l.bucketLabelUtc), l]));
  const c4By = new Map(d.c4.map((s) => [L.secOf(s.label), s]));
  const refBy = new Map(d.refRows.map((r) => [r.sec, r.ref]));
  if (id === WINDOWS[0][0] && from === WINDOWS[0][1]) console.log('label keys:', Object.keys(v03[0] ?? {}).join(','));
  console.log(`\n## ${id} ${from}..${to}`);
  console.log('UTC      | ref | C4     | C4 q             | FSM V0.3         | FSM V0.4+GB(empty aux)');
  for (let s = L.secOf(from); s <= L.secOf(to); s++) {
    const a = c4By.get(s);
    const hh = new Date(s * 1000).toISOString().slice(11, 19);
    console.log(`${hh} | ${String(refBy.get(s) ?? '·').padStart(3)} | ${String(a?.valueKmh == null ? '·' : a.valueKmh.toFixed(1)).padStart(6)} | ${(a?.quality ?? '').padEnd(16)} | ${String(stateOf(b3.get(s))).padEnd(16)} | ${stateOf(b4.get(s))}`);
  }
}
