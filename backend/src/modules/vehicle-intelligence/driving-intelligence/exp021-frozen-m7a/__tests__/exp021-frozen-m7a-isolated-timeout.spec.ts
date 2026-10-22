import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildM7aRuntimeContext, runFrozenM7aIsolated } from '../index';

const REPO_ROOT = path.resolve(__dirname, '../../../../../../..');
const TIGUAN_DIR = path.join(REPO_ROOT, 'architecture/drivingintelligence/evidence/exp021-tiguan-20261019');

describe('runFrozenM7aIsolated deadline', () => {
  it('terminates decode when deadline is exceeded', async () => {
    const grid = JSON.parse(
      fs.readFileSync(path.join(TIGUAN_DIR, 'fixtures/TIGUAN_POSITION_GRID.json'), 'utf8'),
    ) as { buckets: Array<Record<string, unknown>> };
    const osm = JSON.parse(fs.readFileSync(path.join(TIGUAN_DIR, 'TIGUAN_OSM_FROZEN_SNAPSHOT.json'), 'utf8')) as {
      overpassResponse?: unknown;
    };
    const buckets = grid.buckets.map((b) => ({
      bucketLabelUtc: String(b.bucketLabelUtc),
      sourceTimestampUtc: String(b.bucketLabelUtc),
      availability: b.availability as 'PRESENT' | 'ROW_ABSENT' | 'SIGNAL_NULL' | 'OTHER',
      latitude: (b.latitude as number | null) ?? null,
      longitude: (b.longitude as number | null) ?? null,
      l3SpeedKmh: null,
      qcTrustLevel: null,
      motionState: null,
    }));

    await expect(
      runFrozenM7aIsolated(
        {
          buckets,
          overpassBody: (osm.overpassResponse ?? osm) as { elements?: unknown[] },
          corridorMarginM: 75,
        },
        5,
      ),
    ).rejects.toThrow(/M7A_PROCESSING_TIMEOUT|M7A_WORKER_EXIT/);
  }, 120_000);
});
