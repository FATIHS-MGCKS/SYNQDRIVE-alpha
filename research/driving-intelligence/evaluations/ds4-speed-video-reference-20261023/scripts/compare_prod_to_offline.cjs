#!/usr/bin/env node
'use strict';
/**
 * Parity: production DI code replay (prod_code) vs offline harness candidate (no_obd_speed).
 * Expects identical speed/QC/FSM metrics on all four video drives when production implements the strip boundary.
 */
const fs = require('node:fs');
const path = require('node:path');
const L = require('./eval_lib.cjs');

const evalRoot = path.resolve(__dirname, '..');
const outDir = path.join(evalRoot, 'outputs');
const prod = JSON.parse(fs.readFileSync(path.join(outDir, 'prod_code', 'summary.json'), 'utf8'));
const offline = JSON.parse(fs.readFileSync(path.join(outDir, 'no_obd_speed', 'summary.json'), 'utf8'));

const series = ['replay_l3', 'replay_l3_qc', 'replay_c4'];
const perDrive = {};
let allOk = true;
for (const d of prod.drives) {
  const o = offline.drives.find((x) => x.id === d.id);
  const row = { speed: {}, motion: {}, timing: {} };
  for (const s of series) {
    const a = d.speed[s]?.all;
    const b = o.speed[s]?.all;
    const same =
      a &&
      b &&
      a.n === b.n &&
      a.maeKmh === b.maeKmh &&
      a.p95AbsKmh === b.p95AbsKmh &&
      a.maxAbsKmh === b.maxAbsKmh &&
      d.speed[s].coverage.paired === o.speed[s].coverage.paired;
    if (!same) allOk = false;
    row.speed[s] = { prod: a, offline: b, identical: same };
  }
  for (const m of ['replay_c4', 'replay_fsm']) {
    const mp = d.motion[m];
    const mo = o.motion[m];
    const same =
      mp.falseMotionInConfirmedStill === mo.falseMotionInConfirmedStill &&
      mp.falseStillInConfirmedMotion === mo.falseStillInConfirmedMotion;
    if (!same) allOk = false;
    row.motion[m] = { prod: mp, offline: mo, identical: same };
  }
  row.timing = {
    replay_fsm: {
      stopMed: [d.timing.replay_fsm?.stop.medianOffsetS, o.timing.replay_fsm?.stop.medianOffsetS],
      startMed: [d.timing.replay_fsm?.start.medianOffsetS, o.timing.replay_fsm?.start.medianOffsetS],
    },
  };
  row.implausibleC4 = {
    prod: d.implausibleEstimates?.replay_c4?.count ?? 0,
    offline: o.implausibleEstimates?.replay_c4?.count ?? 0,
  };
  if (row.implausibleC4.prod !== row.implausibleC4.offline) allOk = false;
  perDrive[d.id] = row;
}

const out = {
  schema: 'DS4_PROD_VS_OFFLINE_OBD_STRIP_PARITY_V1',
  generatedAtUtc: new Date().toISOString(),
  prodCodeSha: prod.versions.codeSha,
  offlineCodeSha: offline.versions.codeSha,
  prodObdInfluence: prod.versions.obdSpeedInfluence,
  offlineObdInfluence: offline.versions.obdSpeedInfluence,
  identical: allOk,
  perDrive,
  note: '#2134 not merged — prod parity is against harness --strip-obd-speed-influence only',
};
const outFile = path.join(outDir, 'prod_code_vs_no_obd_speed_parity.json');
fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ written: path.relative(evalRoot, outFile), identical: allOk }, null, 2));
process.exit(allOk ? 0 : 1);
