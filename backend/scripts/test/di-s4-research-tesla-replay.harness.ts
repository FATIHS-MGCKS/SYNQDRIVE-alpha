/**
 * Frozen Tesla LDI-10D replay harness (transpile-only; not imported by Nest runtime).
 * Exit 0 on parity with LDI-10D Phase 3E pins; exit 1 otherwise.
 */
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

const EXPECTED_BASELINE = { ASSOCIATED: 264, AMBIGUOUS: 512, UNKNOWN: 360 };
const EXPECTED_VITERBI = { ASSOCIATED: 300, AMBIGUOUS: 357, UNKNOWN: 479 };
const F4B_PROMOTIONS = 36;
const F4B_IMPOSSIBLE = 5;

const repoRoot = path.resolve(__dirname, '../../..');
const evidenceDir = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');
const fixturePath = path.join(evidenceDir, 'fixtures/tesla-20261016/TESLA_POSITION_GRID.json');
const osmPath = path.join(evidenceDir, 'LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json');
const f4bPath = path.join(evidenceDir, 'LDI10D_F4B_AMBIGUOUS_PROMOTIONS.json');

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
  if (JSON.stringify(baseline) !== JSON.stringify(EXPECTED_BASELINE)) {
    fail(`baseline mismatch: ${JSON.stringify(baseline)}`);
  }
  if (JSON.stringify(viterbi) !== JSON.stringify(EXPECTED_VITERBI)) {
    fail(`viterbi mismatch: ${JSON.stringify(viterbi)}`);
  }

  let promotions = 0;
  for (let i = 0; i < buckets.length; i++) {
    const baseLabel = baselineInternal[i].outcome === 'CONFIRMED' ? 'ASSOCIATED' : baselineInternal[i].outcome;
    const vitLabel = viterbiInternal[i].outcome === 'CONFIRMED' ? 'ASSOCIATED' : viterbiInternal[i].outcome;
    if (baseLabel === 'AMBIGUOUS' && vitLabel === 'ASSOCIATED') promotions += 1;
  }
  if (promotions !== F4B_PROMOTIONS) fail(`promotion count ${promotions} !== ${F4B_PROMOTIONS}`);

  const adj = buildWayAdjacency(roadContext.ways);
  let impossible = 0;
  for (let i = 1; i < viterbiInternal.length; i++) {
    const prev = viterbiInternal[i - 1].osmWayId;
    const cur = viterbiInternal[i].osmWayId;
    if (prev != null && cur != null && prev !== cur && viterbiInternal[i].outcome === 'CONFIRMED') {
      if (!graphReachable(adj, prev, cur)) impossible += 1;
    }
  }
  if (impossible < F4B_IMPOSSIBLE) fail(`impossible transitions ${impossible} < ${F4B_IMPOSSIBLE}`);

  if (fs.existsSync(f4bPath)) {
    const pinned = JSON.parse(fs.readFileSync(f4bPath, 'utf8')) as {
      reproducibility: { promotionCount: number };
      impossibleTransitions: unknown[];
      classDistribution: Record<string, number>;
    };
    if (pinned.reproducibility.promotionCount !== F4B_PROMOTIONS) fail('pinned F4B promotionCount mismatch');
    if (pinned.impossibleTransitions.length !== F4B_IMPOSSIBLE) fail('pinned F4B impossibleTransitions length mismatch');
    const stillAmbiguous = pinned.classDistribution.STILL_AMBIGUOUS ?? 0;
    if (stillAmbiguous < 29) fail(`pinned STILL_AMBIGUOUS ${stillAmbiguous} < 29`);
  }

  let stillAmbiguousReplay = 0;
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
    if (decisionClass === 'STILL_AMBIGUOUS') stillAmbiguousReplay += 1;
  }
  if (stillAmbiguousReplay < 20) fail(`replay STILL_AMBIGUOUS ${stillAmbiguousReplay} < 20`);

  const result = {
    baseline,
    viterbi,
    promotions,
    impossible,
    stillAmbiguousReplay,
    wayCount: roadContext.ways.length,
    independentAccuracy: 'NOT_ASSESSABLE',
  };
  console.log(JSON.stringify(result));
}

main();
