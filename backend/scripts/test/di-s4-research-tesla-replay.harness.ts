/**
 * Frozen Tesla LDI-10D replay harness (transpile-only; not imported by Nest runtime).
 * Exit 0 on parity with geometry V2 pins; exit 1 otherwise.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  buildRoadContextFromOverpass,
  buildWayCandidateDetails,
  classifyAmbiguousPromotion,
  S4_RESEARCH_GEOMETRY_PROJECTION_ID,
  type ResearchGpsBucket,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research';
import { buildBaselineMatches } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/baseline-matching';
import { buildViterbiMatches, headingsFromBaseline } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-matching';
import { buildWayAdjacency, graphReachable } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/osm-parse';

const repoRoot = path.resolve(__dirname, '../../..');
const evidenceDir = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');
const fixturePath = path.join(evidenceDir, 'fixtures/tesla-20261016/TESLA_POSITION_GRID.json');
const osmPath = path.join(evidenceDir, 'LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json');
const pinsPath = path.join(evidenceDir, 'LDI10D_GEOMETRY_V2_REPLAY_PINS.json');

function summarizeInternal(
  rows: ReturnType<typeof buildBaselineMatches>,
): Record<'ASSOCIATED' | 'AMBIGUOUS' | 'UNKNOWN', number> {
  const counts = { ASSOCIATED: 0, AMBIGUOUS: 0, UNKNOWN: 0 };
  for (const r of rows) {
    const label = r.outcome === 'CONFIRMED' ? 'ASSOCIATED' : r.outcome;
    counts[label] += 1;
  }
  return counts;
}

function fail(msg: string): void {
  console.error(msg);
  process.exit(1);
}

function main(): void {
  const pins = JSON.parse(fs.readFileSync(pinsPath, 'utf8')) as {
    geometryProjectionId: string;
    baseline: Record<'ASSOCIATED' | 'AMBIGUOUS' | 'UNKNOWN', number>;
    viterbi: Record<'ASSOCIATED' | 'AMBIGUOUS' | 'UNKNOWN', number>;
    promotions: number;
    impossibleViterbiTransitions: number;
    promotionClassDistribution: Record<string, number>;
  };
  if (pins.geometryProjectionId !== S4_RESEARCH_GEOMETRY_PROJECTION_ID) {
    fail(`geometry id mismatch harness=${S4_RESEARCH_GEOMETRY_PROJECTION_ID} pins=${pins.geometryProjectionId}`);
  }

  const grid = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
    buckets: Array<{
      bucketLabelUtc: string;
      availability: string;
      latitude: number | null;
      longitude: number | null;
      qcTrustLevel?: string;
      pinnedProductionL3Kmh?: number | null;
    }>;
  };
  const buckets: ResearchGpsBucket[] = grid.buckets.map((b) => ({
    bucketLabelUtc: b.bucketLabelUtc,
    availability: b.availability as ResearchGpsBucket['availability'],
    latitude: b.latitude,
    longitude: b.longitude,
    qcTrustLevel: b.qcTrustLevel ?? null,
    l3SpeedKmh: b.pinnedProductionL3Kmh ?? null,
  }));
  if (buckets.length !== 1136) fail(`expected 1136 buckets, got ${buckets.length}`);

  const doc = JSON.parse(fs.readFileSync(osmPath, 'utf8')) as { overpassResponse: unknown };
  const roadContext = buildRoadContextFromOverpass(doc.overpassResponse as { elements?: Array<Record<string, unknown>> }, {
    buckets,
    corridorMarginM: 75,
  });
  const baselineInternal = buildBaselineMatches(buckets, roadContext, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
  const viterbiInternal = buildViterbiMatches(
    buckets,
    roadContext.ways,
    headingsFromBaseline(baselineInternal),
    DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  );

  const baseline = summarizeInternal(baselineInternal);
  const viterbi = summarizeInternal(viterbiInternal);
  if (JSON.stringify(baseline) !== JSON.stringify(pins.baseline)) {
    fail(`baseline mismatch: ${JSON.stringify(baseline)} expected ${JSON.stringify(pins.baseline)}`);
  }
  if (JSON.stringify(viterbi) !== JSON.stringify(pins.viterbi)) {
    fail(`viterbi mismatch: ${JSON.stringify(viterbi)} expected ${JSON.stringify(pins.viterbi)}`);
  }

  let promotions = 0;
  for (let i = 0; i < buckets.length; i++) {
    const baseLabel = baselineInternal[i].outcome === 'CONFIRMED' ? 'ASSOCIATED' : baselineInternal[i].outcome;
    const vitLabel = viterbiInternal[i].outcome === 'CONFIRMED' ? 'ASSOCIATED' : viterbiInternal[i].outcome;
    if (baseLabel === 'AMBIGUOUS' && vitLabel === 'ASSOCIATED') promotions += 1;
  }
  if (promotions !== pins.promotions) fail(`promotion count ${promotions} !== ${pins.promotions}`);

  const adj = buildWayAdjacency(roadContext.ways);
  let impossible = 0;
  for (let i = 1; i < viterbiInternal.length; i++) {
    const prev = viterbiInternal[i - 1].osmWayId;
    const cur = viterbiInternal[i].osmWayId;
    if (prev != null && cur != null && prev !== cur && viterbiInternal[i].outcome === 'CONFIRMED') {
      if (!graphReachable(adj, prev, cur)) impossible += 1;
    }
  }
  if (impossible < pins.impossibleViterbiTransitions) {
    fail(`impossible transitions ${impossible} < ${pins.impossibleViterbiTransitions}`);
  }

  const classDist: Record<string, number> = {};
  for (let i = 0; i < buckets.length; i++) {
    if (baselineInternal[i].outcome !== 'AMBIGUOUS' || viterbiInternal[i].outcome !== 'CONFIRMED') continue;
    const prevWay = i > 0 ? viterbiInternal[i - 1].osmWayId : null;
    const graphContinuity =
      prevWay != null && viterbiInternal[i].osmWayId != null
        ? graphReachable(adj, prevWay, viterbiInternal[i].osmWayId)
        : null;
    const candidates = buildWayCandidateDetails(
      buckets[i].latitude!,
      buckets[i].longitude!,
      baselineInternal[i].headingDeg,
      roadContext.ways,
      DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    );
    const { decisionClass } = classifyAmbiguousPromotion({
      bucket: buckets[i],
      baseline: baselineInternal[i],
      viterbi: viterbiInternal[i],
      candidates,
      graphContinuityFromPrev: graphContinuity,
      parallelCarriagewayHint: false,
      config: DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    });
    classDist[decisionClass] = (classDist[decisionClass] ?? 0) + 1;
  }
  for (const [k, v] of Object.entries(pins.promotionClassDistribution)) {
    if ((classDist[k] ?? 0) !== v) fail(`promotion class ${k}: got ${classDist[k] ?? 0} expected ${v}`);
  }

  const result = {
    geometryProjectionId: S4_RESEARCH_GEOMETRY_PROJECTION_ID,
    baseline,
    viterbi,
    promotions,
    impossible,
    promotionClassDistribution: classDist,
    wayCount: roadContext.ways.length,
    independentAccuracy: 'NOT_ASSESSABLE',
  };
  console.log(JSON.stringify(result));
}

main();
