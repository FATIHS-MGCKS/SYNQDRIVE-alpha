import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EXP021_FROZEN_M7A_TIGUAN_PER_BUCKET_SHA256,
  buildM7aRuntimeContext,
  perBucketAssignmentHash,
  runFrozenM7a,
} from '../../exp021-frozen-m7a';

const REPO_ROOT = path.resolve(__dirname, '../../../../../../..');
const TIGUAN_DIR = path.join(REPO_ROOT, 'architecture/drivingintelligence/evidence/exp021-tiguan-20261019');
const FREEZE_DIR = path.join(REPO_ROOT, 'architecture/drivingintelligence/evidence/exp021-phase5a-baseline-freeze');

const MANIFEST_POSITION_GRID_SHA = '3a253b975f35ae02c3caa9a0bb894545447d3c6cdfccbe2a42ca23f6f7a95c09';
const MANIFEST_OSM_SHA = 'c141ec2f4713e9b4def75a8c1b709d1be53b35b14ade71b0ca3749b926c24959';

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

type ExportedBucket = {
  bucketLabelUtc: string;
  gpsStatus: string;
  headingDeg: number | null;
  outcome: string;
  osmWayId: number | null;
  candidateWayIds: number[];
  ambiguityReasons: string[];
  pathMargin: number | null;
  posteriorMax: number | null;
  posteriorSecond: number | null;
};

function exportMatchFields(matches: ReturnType<typeof runFrozenM7a>['matches']): ExportedBucket[] {
  return matches.map((m) => ({
    bucketLabelUtc: m.bucketLabelUtc,
    gpsStatus: m.gpsStatus,
    headingDeg: m.headingDeg,
    outcome: m.outcome,
    osmWayId: m.osmWayId,
    candidateWayIds: m.candidateWayIds,
    ambiguityReasons: m.ambiguityReasons,
    pathMargin: m.pathMargin ?? null,
    posteriorMax: m.posteriorMax ?? null,
    posteriorSecond: m.posteriorSecond ?? null,
  }));
}

describe('EXP021 frozen M7A — Tiguan offline parity', () => {
  it('pins input fixtures against freeze manifest', () => {
    const gridPath = path.join(TIGUAN_DIR, 'fixtures/TIGUAN_POSITION_GRID.json');
    const osmPath = path.join(TIGUAN_DIR, 'TIGUAN_OSM_FROZEN_SNAPSHOT.json');
    expect(sha256File(gridPath)).toBe(MANIFEST_POSITION_GRID_SHA);
    expect(sha256File(osmPath)).toBe(MANIFEST_OSM_SHA);
  });

  it('matches Phase 5A per-bucket hash and every exported bucket field vs frozen reference', () => {
    const gridPath = path.join(TIGUAN_DIR, 'fixtures/TIGUAN_POSITION_GRID.json');
    const osmPath = path.join(TIGUAN_DIR, 'TIGUAN_OSM_FROZEN_SNAPSHOT.json');
    const goldenPath = path.join(FREEZE_DIR, 'fixtures/TIGUAN_M7A_FROZEN_BUCKET_EXPORT.json');
    const smokePath = path.join(FREEZE_DIR, 'smoke/TIGUAN_SMOKE_REPLAY.json');

    const grid = JSON.parse(fs.readFileSync(gridPath, 'utf8')) as { buckets: Array<Record<string, unknown>> };
    const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8')) as {
      bucketCount: number;
      perBucketHash: string;
      confirmed: number;
      buckets: ExportedBucket[];
    };
    const smoke = JSON.parse(fs.readFileSync(smokePath, 'utf8')) as {
      models: { M7A: { sha256: string; confirmed: number } };
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
    const ctx = buildM7aRuntimeContext({
      buckets: researchBuckets,
      overpassBody: (osm.overpassResponse ?? osm) as { elements?: unknown[] },
      corridorMarginM: 75,
    });
    const { matches } = runFrozenM7a(ctx);
    const exported = exportMatchFields(matches);
    const hash = perBucketAssignmentHash(matches);

    expect(matches.length).toBe(grid.buckets.length);
    expect(matches.length).toBe(golden.bucketCount);
    expect(hash).toBe(EXP021_FROZEN_M7A_TIGUAN_PER_BUCKET_SHA256);
    expect(hash).toBe(golden.perBucketHash);
    expect(hash).toBe(smoke.models.M7A.sha256);

    const confirmed = matches.filter((m) => m.outcome === 'CONFIRMED').length;
    expect(confirmed).toBe(golden.confirmed);
    expect(confirmed).toBe(smoke.models.M7A.confirmed);

    const deviations: string[] = [];
    for (let i = 0; i < exported.length; i++) {
      if (JSON.stringify(exported[i]) !== JSON.stringify(golden.buckets[i])) {
        deviations.push(`${exported[i].bucketLabelUtc}: field mismatch at index ${i}`);
      }
    }
    expect(deviations).toEqual([]);
  });
});
