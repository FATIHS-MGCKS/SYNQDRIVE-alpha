import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EXP021_FROZEN_M7A_TIGUAN_PER_BUCKET_SHA256,
  buildM7aRuntimeContext,
  perBucketAssignmentHash,
  runFrozenM7a,
  type FrozenM7aBucket,
} from '../../exp021-frozen-m7a';

const REPO_ROOT = path.resolve(__dirname, '../../../../../../..');
const TIGUAN_DIR = path.join(REPO_ROOT, 'architecture/drivingintelligence/evidence/exp021-tiguan-20261019');

describe('EXP021 frozen M7A — Tiguan offline parity', () => {
  it('matches Phase 5A per-bucket assignment hash on pinned grid + OSM', () => {
    const gridPath = path.join(TIGUAN_DIR, 'fixtures/TIGUAN_POSITION_GRID.json');
    const osmPath = path.join(TIGUAN_DIR, 'TIGUAN_OSM_FROZEN_SNAPSHOT.json');
    expect(fs.existsSync(gridPath)).toBe(true);
    expect(fs.existsSync(osmPath)).toBe(true);

    const grid = JSON.parse(fs.readFileSync(gridPath, 'utf8')) as {
      buckets: Array<Record<string, unknown>>;
    };
    const researchBuckets = grid.buckets.map((b) => ({
      bucketLabelUtc: String(b.bucketLabelUtc),
      sourceTimestampUtc: String(b.bucketLabelUtc),
      availability: b.availability as 'PRESENT' | 'ROW_ABSENT' | 'SIGNAL_NULL' | 'OTHER',
      latitude: (b.latitude as number | null) ?? null,
      longitude: (b.longitude as number | null) ?? null,
      l3SpeedKmh: (b.pinnedProductionL3Kmh as number | null) ?? null,
      qcTrustLevel: null,
      motionState: null,
    }));

    const osm = JSON.parse(fs.readFileSync(osmPath, 'utf8')) as { overpassResponse?: unknown };
    const overpassBody = (osm.overpassResponse ?? osm) as { elements?: unknown[] };

    const ctx = buildM7aRuntimeContext({
      buckets: researchBuckets,
      overpassBody,
      corridorMarginM: 75,
    });
    const { matches, cpuMs } = runFrozenM7a(ctx);
    const hash = perBucketAssignmentHash(matches);

    expect(matches.length).toBe(grid.buckets.length);
    expect(hash).toBe(EXP021_FROZEN_M7A_TIGUAN_PER_BUCKET_SHA256);
    expect(cpuMs).toBeGreaterThanOrEqual(0);

    const confirmed = matches.filter((m) => m.outcome === 'CONFIRMED').length;
    expect(confirmed).toBeGreaterThan(0);
    for (const m of matches) {
      if (m.outcome !== 'CONFIRMED') {
        expect(m.osmWayId === null || m.outcome === 'AMBIGUOUS' || m.outcome === 'UNKNOWN').toBe(true);
      }
    }
  });
});
