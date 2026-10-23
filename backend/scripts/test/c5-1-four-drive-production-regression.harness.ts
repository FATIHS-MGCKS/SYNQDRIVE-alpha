#!/usr/bin/env npx ts-node --transpile-only
/**
 * Offline four-drive regression against sealed V1.2 summary (production TS C5.1 port).
 * cd backend && npx ts-node --transpile-only scripts/test/c5-1-four-drive-production-regression.harness.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { computeC5_1GatedRepairResearchV12 } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/kinematics/c5-1-gated-repair';

const EVAL_ROOT =
  process.env.DS4_C51_EVAL_ROOT ??
  path.join(
    process.cwd(),
    '../.worktrees/ds4-speed-ref/research/driving-intelligence/evaluations/ds4-c5-1-gated-repair-20261023',
  );
const REPLAY_LIB = path.join(
  process.cwd(),
  '../.worktrees/ds4-speed-ref/research/driving-intelligence/evaluations/ds4-accel-brake-video-reference-20261023/scripts/replay_event_eval.cjs',
);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const R = require(REPLAY_LIB) as {
  loadDrives: () => Array<{ id: string; buckets: unknown[]; identity: { vehicleClass: string } }>;
};

const summaryPath = path.join(EVAL_ROOT, 'outputs/v1_2/c5_1_experiment_summary.json');
if (!fs.existsSync(summaryPath)) {
  console.error('Missing sealed summary:', summaryPath);
  process.exit(2);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
let failed = 0;
for (const d of R.loadDrives()) {
  const out = computeC5_1GatedRepairResearchV12(d.buckets as never, {
    vehicleClass: d.identity.vehicleClass === 'TIGUAN' ? 'TIGUAN' : 'TESLA',
  });
  const row = summary.speedRegression.find((x: { id: string }) => x.id === d.id);
  if (row?.lost !== 0) {
    console.error('lost manoeuvres', d.id, row?.lost);
    failed += 1;
  }
  console.log(d.id, 'repairAccepted', out.meta.repairAccepted, 'samples', out.samples.length);
}
if (summary.gateCounts.fail !== 0) failed += 1;
console.log('gateCounts', summary.gateCounts);
process.exit(failed ? 1 : 0);
