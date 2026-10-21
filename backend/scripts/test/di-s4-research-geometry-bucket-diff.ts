/**
 * Export per-bucket baseline/viterbi label diffs: legacy geometry V1 vs corrected V2.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  buildRoadContextFromOverpass,
  type ResearchGpsBucket,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research';
import { buildBaselineMatches } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/baseline-matching';
import { buildViterbiMatches, headingsFromBaseline } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-matching';
import { pointToSegmentDistanceM_V1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/legacy/point-to-segment-distance-v1';

const repoRoot = path.resolve(__dirname, '../../..');
const evidenceDir = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');
const outPath = path.join(evidenceDir, 'LDI10D_GEOMETRY_V1_V2_BUCKET_DIFF.json');

function labelOf(outcome: string): string {
  return outcome === 'CONFIRMED' ? 'ASSOCIATED' : outcome;
}

function main(): void {
  const fixturePath = path.join(evidenceDir, 'fixtures/tesla-20261016/TESLA_POSITION_GRID.json');
  const osmPath = path.join(evidenceDir, 'LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json');
  const grid = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as { buckets: ResearchGpsBucket[] };
  const buckets = grid.buckets.map((b) => ({
    bucketLabelUtc: b.bucketLabelUtc,
    availability: b.availability as ResearchGpsBucket['availability'],
    latitude: b.latitude,
    longitude: b.longitude,
    qcTrustLevel: b.qcTrustLevel ?? null,
    l3SpeedKmh: (b as { pinnedProductionL3Kmh?: number | null }).pinnedProductionL3Kmh ?? null,
  }));
  const doc = JSON.parse(fs.readFileSync(osmPath, 'utf8')) as { overpassResponse: unknown };
  const roadContext = buildRoadContextFromOverpass(doc.overpassResponse as { elements?: Array<Record<string, unknown>> }, {
    buckets,
    corridorMarginM: 75,
  });

  const configV2 = DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG;
  const configV1 = { ...DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, pointToSegmentDistanceM: pointToSegmentDistanceM_V1 };

  const baseV2 = buildBaselineMatches(buckets, roadContext, configV2);
  const vitV2 = buildViterbiMatches(buckets, roadContext.ways, headingsFromBaseline(baseV2), configV2);
  const baseV1 = buildBaselineMatches(buckets, roadContext, configV1);
  const vitV1 = buildViterbiMatches(buckets, roadContext.ways, headingsFromBaseline(baseV1), configV1);

  const changes: Array<{
    bucketLabelUtc: string;
    baselineV1: string;
    baselineV2: string;
    viterbiV1: string;
    viterbiV2: string;
    baselineWayV1: number | null;
    baselineWayV2: number | null;
    viterbiWayV1: number | null;
    viterbiWayV2: number | null;
  }> = [];

  for (let i = 0; i < buckets.length; i++) {
    const b1 = labelOf(baseV1[i].outcome);
    const b2 = labelOf(baseV2[i].outcome);
    const v1 = labelOf(vitV1[i].outcome);
    const v2 = labelOf(vitV2[i].outcome);
    if (b1 !== b2 || v1 !== v2 || baseV1[i].osmWayId !== baseV2[i].osmWayId || vitV1[i].osmWayId !== vitV2[i].osmWayId) {
      changes.push({
        bucketLabelUtc: buckets[i].bucketLabelUtc,
        baselineV1: b1,
        baselineV2: b2,
        viterbiV1: v1,
        viterbiV2: v2,
        baselineWayV1: baseV1[i].osmWayId,
        baselineWayV2: baseV2[i].osmWayId,
        viterbiWayV1: vitV1[i].osmWayId,
        viterbiWayV2: vitV2[i].osmWayId,
      });
    }
  }

  const payload = {
    geometryV1: 'S4_RESEARCH_LOCAL_PROJECTION_LEGACY_V1',
    geometryV2: 'S4_RESEARCH_LOCAL_EQUIRECTANGULAR_V2',
    totalBuckets: buckets.length,
    changedBuckets: changes.length,
    independentRoadIdAccuracy: 'NOT_ASSESSABLE',
    note: 'Label/way changes reflect geometry correction only — not ground-truth accuracy claims.',
    bucketChanges: changes,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`wrote ${outPath} changed=${changes.length}`);
}

main();
