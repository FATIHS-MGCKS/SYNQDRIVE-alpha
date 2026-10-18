/** One-off metrics dump for Tesla replay (transpile-only). */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  buildRoadContextFromOverpass,
  buildWayCandidateDetails,
  classifyAmbiguousPromotion,
  type ResearchGpsBucket,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research';
import { buildBaselineMatches } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/baseline-matching';
import { buildViterbiMatches, headingsFromBaseline } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-matching';
import { buildWayAdjacency, graphReachable } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/osm-parse';
import { detectGraphTransitionConflicts } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/road-matching-pipeline';

const repoRoot = path.resolve(__dirname, '../../..');
const evidenceDir = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');
const fixturePath = path.join(evidenceDir, 'fixtures/tesla-20261016/TESLA_POSITION_GRID.json');
const osmPath = path.join(evidenceDir, 'LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json');

function summarize(rows: ReturnType<typeof buildBaselineMatches>) {
  const counts = { ASSOCIATED: 0, AMBIGUOUS: 0, UNKNOWN: 0 };
  for (const r of rows) {
    const label = r.outcome === 'CONFIRMED' ? 'ASSOCIATED' : r.outcome;
    counts[label] += 1;
  }
  return counts;
}

function main(): void {
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
  const baseline = buildBaselineMatches(buckets, roadContext, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
  const viterbi = buildViterbiMatches(
    buckets,
    roadContext.ways,
    headingsFromBaseline(baseline),
    DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  );
  let promotions = 0;
  for (let i = 0; i < buckets.length; i++) {
    const bl = baseline[i].outcome === 'CONFIRMED' ? 'ASSOCIATED' : baseline[i].outcome;
    const vl = viterbi[i].outcome === 'CONFIRMED' ? 'ASSOCIATED' : viterbi[i].outcome;
    if (bl === 'AMBIGUOUS' && vl === 'ASSOCIATED') promotions += 1;
  }
  const adj = buildWayAdjacency(roadContext.ways);
  let impossible = 0;
  for (let i = 1; i < viterbi.length; i++) {
    const prev = viterbi[i - 1].osmWayId;
    const cur = viterbi[i].osmWayId;
    if (prev != null && cur != null && prev !== cur && viterbi[i].outcome === 'CONFIRMED') {
      if (!graphReachable(adj, prev, cur)) impossible += 1;
    }
  }
  const conflicts = detectGraphTransitionConflicts(
    viterbi.map((v) => ({ bucketLabelUtc: v.bucketLabelUtc, wayId: v.osmWayId })),
    roadContext.ways,
  );
  const classDist: Record<string, number> = {};
  for (let i = 0; i < buckets.length; i++) {
    if (baseline[i].outcome !== 'AMBIGUOUS' || viterbi[i].outcome !== 'CONFIRMED') continue;
    const prevWay = i > 0 ? viterbi[i - 1].osmWayId : null;
    const graphContinuity =
      prevWay != null && viterbi[i].osmWayId != null
        ? graphReachable(adj, prevWay, viterbi[i].osmWayId)
        : null;
    const candidates = buildWayCandidateDetails(
      buckets[i].latitude!,
      buckets[i].longitude!,
      baseline[i].headingDeg,
      roadContext.ways,
      DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    );
    const { decisionClass } = classifyAmbiguousPromotion({
      bucket: buckets[i],
      baseline: baseline[i],
      viterbi: viterbi[i],
      candidates,
      graphContinuityFromPrev: graphContinuity,
      parallelCarriagewayHint: false,
      config: DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    });
    classDist[decisionClass] = (classDist[decisionClass] ?? 0) + 1;
  }
  console.log(
    JSON.stringify(
      {
        baseline: summarize(baseline),
        viterbi: summarize(viterbi),
        promotions,
        impossible,
        graphTransitionConflicts: conflicts.length,
        promotionClassDistribution: classDist,
      },
      null,
      2,
    ),
  );
}

main();
