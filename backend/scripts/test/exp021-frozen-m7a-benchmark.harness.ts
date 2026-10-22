/**
 * Measures M7A decode wall time and heap delta (no Jest). Run from backend/:
 * npx ts-node --transpile-only scripts/test/exp021-frozen-m7a-benchmark.harness.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildM7aRuntimeContext, runFrozenM7a, perBucketAssignmentHash } from '../../src/modules/vehicle-intelligence/driving-intelligence/exp021-frozen-m7a';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const TIGUAN_DIR = path.join(REPO_ROOT, 'architecture/drivingintelligence/evidence/exp021-tiguan-20261019');

function main(): void {
  const grid = JSON.parse(fs.readFileSync(path.join(TIGUAN_DIR, 'fixtures/TIGUAN_POSITION_GRID.json'), 'utf8')) as {
    buckets: Array<Record<string, unknown>>;
  };
  const osm = JSON.parse(fs.readFileSync(path.join(TIGUAN_DIR, 'TIGUAN_OSM_FROZEN_SNAPSHOT.json'), 'utf8')) as {
    overpassResponse?: unknown;
  };
  const buckets = grid.buckets.map((b) => ({
    bucketLabelUtc: String(b.bucketLabelUtc),
    sourceTimestampUtc: String(b.bucketLabelUtc),
    availability: b.availability as 'PRESENT' | 'ROW_ABSENT' | 'SIGNAL_NULL' | 'OTHER',
    latitude: (b.latitude as number | null) ?? null,
    longitude: (b.longitude as number | null) ?? null,
    l3SpeedKmh: (b.pinnedProductionL3Kmh as number | null) ?? null,
    qcTrustLevel: null,
    motionState: null,
  }));

  if (global.gc) global.gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const wallStart = performance.now();
  const ctx = buildM7aRuntimeContext({
    buckets,
    overpassBody: (osm.overpassResponse ?? osm) as { elements?: unknown[] },
    corridorMarginM: 75,
  });
  const { matches, cpuMs } = runFrozenM7a(ctx);
  const wallEnd = performance.now();
  const heapAfter = process.memoryUsage().heapUsed;

  const report = {
    fixture: 'TIGUAN_20261019',
    bucketCount: matches.length,
    corridorMarginM: 75,
    decodeWallMs: wallEnd - wallStart,
    processCpuUsageMs: cpuMs,
    heapDeltaBytes: heapAfter - heapBefore,
    heapDeltaMb: (heapAfter - heapBefore) / 1048576,
    rssAfterMb: process.memoryUsage().rss / 1048576,
    perBucketAssignmentHash: perBucketAssignmentHash(matches),
    confirmedCount: matches.filter((m) => m.outcome === 'CONFIRMED').length,
  };
  console.log(JSON.stringify(report, null, 2));
}

main();
