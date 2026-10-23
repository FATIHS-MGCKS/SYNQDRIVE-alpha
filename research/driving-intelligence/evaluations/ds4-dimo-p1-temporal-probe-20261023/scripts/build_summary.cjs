#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const fullPath = process.argv[2] || '/opt/cursor/artifacts/p1_dimo_probe/p1_probe_report.json';
const outDir = path.join(__dirname, '..', 'outputs');
const full = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

const CRIT = {
  TES16: new Set([
    '2026-10-16T03:50:17Z', '2026-10-16T03:50:18Z', '2026-10-16T03:50:19Z', '2026-10-16T03:50:20Z',
    '2026-10-16T03:50:22Z', '2026-10-16T03:50:23Z', '2026-10-16T03:50:24Z',
  ]),
  TIG22: new Set([
    '2026-10-22T19:04:34Z', '2026-10-22T19:04:36Z', '2026-10-22T19:04:37Z', '2026-10-22T19:04:38Z',
    '2026-10-22T19:04:39Z', '2026-10-22T19:04:49Z', '2026-10-22T19:04:51Z', '2026-10-22T19:04:52Z',
    '2026-10-22T19:04:53Z',
  ]),
};

function keepRow(caseId, row) {
  if (CRIT[caseId].has(row.bucketUtc)) return true;
  return [...CRIT[caseId]].some((p) => row.bucketUtc.startsWith(p.slice(0, 19)));
}

const summary = {
  schema: 'DS4_DIMO_P1_SUMMARY_V1',
  probedAtUtc: full.probedAtUtc,
  productionCodeSha: full.productionCodeSha,
  auth: full.auth,
  apiSupport: full.apiSupport,
  cases: {},
};

for (const id of ['TES16', 'TIG22']) {
  const c = full.cases[id];
  summary.cases[id] = { tokenId: c.tokenId, window: c.window, intervals: {} };
  for (const [ik, iv] of Object.entries(c.intervals)) {
    summary.cases[id].intervals[ik] = {
      supported: iv.supported,
      rowCount: iv.rowCount,
      presentAvgBuckets: iv.presentAvgBuckets,
      bucketsWhereFirstNeLast: iv.bucketsWhereFirstNeLast,
      error: iv.error || null,
      criticalSeries: (iv.series || []).filter((r) => keepRow(id, r)),
    };
  }
}

fs.mkdirSync(outDir, { recursive: true });
const summaryPath = path.join(outDir, 'p1_probe_summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
const hash = crypto.createHash('sha256').update(fs.readFileSync(summaryPath)).digest('hex');
fs.writeFileSync(
  path.join(outDir, 'manifest.json'),
  JSON.stringify(
    {
      generatedAtUtc: new Date().toISOString(),
      sourceArtifact: 'p1_probe_summary.json',
      sha256: hash,
      fullProbeArtifactLocalOnly: '/opt/cursor/artifacts/p1_dimo_probe/p1_probe_report.json',
      note: 'Full probe JSON retained in agent artifacts only; repo ships derived summary without coordinates.',
    },
    null,
    2,
  ) + '\n',
);
console.log('written', summaryPath, hash);
