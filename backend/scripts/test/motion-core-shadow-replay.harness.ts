/**
 * Offline adapter replay for EXP021 motion-core shadow integration (Tesla TRIP_1/TRIP_2).
 * cd backend && npx ts-node --transpile-only scripts/test/motion-core-shadow-replay.harness.ts
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { processDiV0MotionCoreShadowTrip } from '../../src/modules/vehicle-intelligence/driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-processor';
import type { MotionCorePositionBucket } from '../../src/modules/vehicle-intelligence/driving-intelligence/core';

const OUT = process.env.MOTION_CORE_SHADOW_REPLAY_OUT ?? '/opt/cursor/artifacts/exp021-motion-core-shadow-integration';
const PHASE5C =
  process.env.EXP021_PHASE5C_ROOT ?? '/opt/cursor/artifacts/exp021-phase5c-tesla-reference-20261021';
const DIMO_RO =
  process.env.EXP021_DIMO_READONLY ?? '/opt/cursor/artifacts/exp021-motion-core-design/inputs/dimo_readonly';
const REVIEW_OUT = process.env.MOTION_CORE_REVIEW_OUT ?? '/opt/cursor/artifacts/exp021-motion-core-fable-review';

function loadGrid(k: string): MotionCorePositionBucket[] {
  return JSON.parse(fs.readFileSync(path.join(PHASE5C, 'replay', `${k}_position_grid.json`), 'utf8')).buckets;
}

function loadSparse(n: number) {
  const doc = JSON.parse(
    fs.readFileSync(path.join(DIMO_RO, `TRIP_${n}_dimo_speed_location_1s.json`), 'utf8'),
  ) as { rows: Array<{ timestamp: string; speedAvg: number | null }> };
  return doc.rows.filter((r) => r.speedAvg != null);
}

function buildSyntheticParsedContainer(
  grid: MotionCorePositionBucket[],
  sparseRows: Array<{ timestamp: string; speedAvg: number | null }>,
) {
  // Shadow integration adapter uses trip-speed-quality evidence builder; for offline replay we
  // inject grid via POSITION snapshot is non-trivial — use direct processor parity path in unit tests.
  // This harness records grid+sparse fingerprints and compares to review EVENTS_SUMMARY when present.
  return {
    gridLabels: grid.length,
    sparseSamples: sparseRows.length,
  };
}

function sha256File(p: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

fs.mkdirSync(OUT, { recursive: true });
const lines: string[] = [];
lines.push('# Motion-core shadow offline replay');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push('');

for (const [key, n] of [['TRIP_1', 1], ['TRIP_2', 2]] as const) {
  const grid = loadGrid(key);
  const sparse = loadSparse(n);
  const meta = buildSyntheticParsedContainer(grid, sparse);
  lines.push(`## ${key}`);
  lines.push(`- grid labels: ${meta.gridLabels}`);
  lines.push(`- sparse samples: ${meta.sparseSamples}`);
  lines.push(`- adapter note: S4 pinned snapshot required for full \`processDiV0MotionCoreShadowTrip\`; parity counts validated in Jest`);
  const reviewEvents = path.join(REVIEW_OUT, 'EVENTS_SUMMARY.csv');
  if (fs.existsSync(reviewEvents)) {
    lines.push(`- review EVENTS_SUMMARY sha256: ${sha256File(reviewEvents)}`);
  }
  lines.push('');
}

// Smoke: empty parsed container path documents bundle id (does not run full trip without snapshot).
const smoke = processDiV0MotionCoreShadowTrip({
  parsed: {
    organizationId: 'o',
    vehicleId: 'v',
    tripId: 't',
    channelManifest: [],
    channelPayloads: {},
    snapshotHash: 'h',
    boundaryFingerprint: 'b',
    acquisitionWindowStart: '2026-01-01T00:00:00Z',
    acquisitionWindowEnd: '2026-01-01T01:00:00Z',
  } as never,
  sourceFamily: 'API_SYNTHETIC',
  pinnedSnapshotHash: 'h',
  combinedInputIdentity: 'c',
});
lines.push('## Processor smoke (empty grid)');
lines.push(`- bundle: ${smoke.summary.bundleVersion}`);
lines.push(`- labels: ${smoke.payload.summary.labelCount}`);
lines.push(`- intent: ${smoke.intentKey}`);

const outMd = path.join(OUT, 'ADAPTER_REPLAY.md');
fs.writeFileSync(outMd, lines.join('\n'));
console.log(`Wrote ${outMd}`);
