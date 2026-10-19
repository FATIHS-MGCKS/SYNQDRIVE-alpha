/**
 * EXP021 S4 Route-Aware Viterbi R1 — five-way Tesla replay (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  buildDirectedCarRoutingGraph,
  buildRoadContextFromOverpass,
  buildStrictNodeIdWayAdjacency,
  buildViterbiMatchesBacktrackR1,
  buildViterbiMatchesRouteAwareR2,
  computeRouteAwareTransitionCost,
  verifyReportedPathCost,
  type ResearchGpsBucket,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research';
import { buildBaselineMatches } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/baseline-matching';
import {
  buildViterbiMatches,
  headingsFromBaseline,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-matching';
import { buildWayAdjacency, graphReachable, graphReachableMultiHop } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/osm-parse';
import { graphReachableNodeId } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/osm-node-id-topology';

const repoRoot = path.resolve(__dirname, '../../..');
const evidenceDir = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');
const fixturePath = path.join(evidenceDir, 'fixtures/tesla-20261016/TESLA_POSITION_GRID.json');
const osmPath = path.join(evidenceDir, 'LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json');
const outDir =
  process.env.S4_ROUTE_AWARE_R2_OUT ??
  process.env.S4_ROUTE_AWARE_R1_OUT ??
  '/opt/cursor/artifacts/exp021-s4-route-aware-viterbi-r1/r2';

const PINNED_BASELINE = {
  A: { associated: 510, ambiguous: 244, unknown: 382, waySwitches: 110, graphConflictsRounded: 2, pathCost: 15814.145368888783 },
  B: { associated: 510, ambiguous: 244, unknown: 382, waySwitches: 104, graphConflictsRounded: 0, pathCost: 15773.295377804145 },
  C: { associated: 510, ambiguous: 244, unknown: 382, waySwitches: 110, graphConflictsRounded: 2, pathCost: 15814.145368888783 },
  D: { associated: 510, ambiguous: 244, unknown: 382, waySwitches: 104, graphConflictsRounded: 0, pathCost: 15773.295377804145 },
};

type Variant = 'A' | 'B' | 'C' | 'D' | 'E';

function labelCounts(rows: { outcome: string }[]): Record<string, number> {
  const c = { ASSOCIATED: 0, AMBIGUOUS: 0, UNKNOWN: 0 };
  for (const r of rows) {
    const l = r.outcome === 'CONFIRMED' ? 'ASSOCIATED' : r.outcome;
    c[l as keyof typeof c] += 1;
  }
  return c;
}

function waySwitches(rows: Array<{ osmWayId: number | null }>): number {
  let n = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].osmWayId != null && rows[i - 1].osmWayId != null && rows[i].osmWayId !== rows[i - 1].osmWayId) {
      n += 1;
    }
  }
  return n;
}

function graphConflicts(
  rows: Array<{ wayId: number | null }>,
  adj: Map<number, Set<number>>,
): number {
  let n = 0;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].wayId;
    const cur = rows[i].wayId;
    if (prev != null && cur != null && prev !== cur && !graphReachable(adj, prev, cur)) n += 1;
  }
  return n;
}

function main(): void {
  const memBefore = process.memoryUsage();
  const grid = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
    tripId: string;
    buckets: Array<{
      bucketLabelUtc: string;
      availability: string;
      latitude: number | null;
      longitude: number | null;
      pinnedProductionL3Kmh?: number | null;
    }>;
  };
  const buckets: ResearchGpsBucket[] = grid.buckets.map((b) => ({
    bucketLabelUtc: b.bucketLabelUtc,
    availability: b.availability as ResearchGpsBucket['availability'],
    latitude: b.latitude,
    longitude: b.longitude,
    l3SpeedKmh: b.pinnedProductionL3Kmh ?? null,
  }));
  const doc = JSON.parse(fs.readFileSync(osmPath, 'utf8')) as { overpassResponse: unknown };
  const overpass = doc.overpassResponse as { elements?: Array<Record<string, unknown>> };
  const roadContext = buildRoadContextFromOverpass(overpass, { buckets, corridorMarginM: 75 });
  const baseline = buildBaselineMatches(buckets, roadContext, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
  const headings = headingsFromBaseline(baseline);
  const waysById = new Map(roadContext.ways.map((w) => [w.osmWayId, w]));

  const roundedAdj = buildWayAdjacency(roadContext.ways);
  const strict = buildStrictNodeIdWayAdjacency(overpass, roadContext.ways, roundedAdj);
  const directed = buildDirectedCarRoutingGraph(overpass, roadContext.ways);

  function runVariant(variant: Variant) {
    const t0 = performance.now();
    let rows: Array<{ bucketLabelUtc: string; osmWayId: number | null; outcome: string }> = [];
    let pathCost = 0;
    let costParts: Record<string, number> | null = null;
    let eTelemetry: import('../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-matching-route-aware').RouteAwareReplayTelemetry | null =
      null;

    if (variant === 'A') {
      rows = buildViterbiMatches(buckets, roadContext.ways, headings, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, {
        wayAdjacency: roundedAdj,
      });
      pathCost = verifyReportedPathCost(
        buckets,
        rows.map((r) => r.osmWayId),
        roadContext.ways,
        headings,
        DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
        roundedAdj,
      );
    } else if (variant === 'B') {
      const r = buildViterbiMatchesBacktrackR1(buckets, roadContext.ways, headings, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, {
        wayAdjacency: roundedAdj,
      });
      rows = r.matches;
      pathCost = r.totalReportedPathCost;
    } else if (variant === 'C') {
      rows = buildViterbiMatches(buckets, roadContext.ways, headings, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, {
        wayAdjacency: strict.undirectedAdj,
      });
      pathCost = verifyReportedPathCost(
        buckets,
        rows.map((r) => r.osmWayId),
        roadContext.ways,
        headings,
        DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
        strict.undirectedAdj,
      );
    } else if (variant === 'D') {
      const r = buildViterbiMatchesBacktrackR1(buckets, roadContext.ways, headings, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, {
        wayAdjacency: strict.undirectedAdj,
      });
      rows = r.matches;
      pathCost = r.totalReportedPathCost;
    } else {
      const r = buildViterbiMatchesRouteAwareR2(
        buckets,
        roadContext.ways,
        headings,
        DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
        directed,
      );
      rows = r.matches;
      pathCost = r.totalReportedPathCost;
      const p = r.segments.reduce(
        (acc, s) => {
          const c = s.transitionCostPartsSum;
          acc.routeDistanceCost += c.routeDistanceCost;
          acc.timePlausibilityCost += c.timePlausibilityCost;
          acc.topologyUncertaintyCost += c.topologyUncertaintyCost;
          acc.directionChangeCost += c.directionChangeCost;
          acc.statusPenalty += c.statusPenalty;
          return acc;
        },
        {
          routeDistanceCost: 0,
          timePlausibilityCost: 0,
          topologyUncertaintyCost: 0,
          directionChangeCost: 0,
          statusPenalty: 0,
        },
      );
      costParts = p;
      eTelemetry = r.telemetry;
    }

    const ms = performance.now() - t0;
    const track = rows.map((r) => ({ wayId: r.osmWayId, bucketLabelUtc: r.bucketLabelUtc, outcome: r.outcome }));

    let directionViolations = 0;
    let implausibleTransitions = 0;
    let unknownTopology = 0;
    let turnRestrictionUnknown = 0;
    let noGraphRoute = 0;
    let directNonNeighbor = 0;

    for (let i = 1; i < buckets.length; i++) {
      const b0 = buckets[i - 1];
      const b1 = buckets[i];
      if (b0.availability !== 'PRESENT' || b1.availability !== 'PRESENT') continue;
      const pw = rows[i - 1].osmWayId;
      const cw = rows[i].osmWayId;
      if (pw == null || cw == null || pw === cw) continue;
      if (!graphReachable(roundedAdj, pw, cw)) {
        if (!graphReachableMultiHop(roundedAdj, pw, cw)) noGraphRoute += 1;
        else directNonNeighbor += 1;
      }
      if (variant === 'E') {
        const parts = computeRouteAwareTransitionCost(
          directed,
          b0,
          b1,
          waysById.get(pw)!,
          waysById.get(cw)!,
          DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
        );
        if (parts.status === 'DIRECTION_FORBIDDEN') directionViolations += 1;
        if (parts.timePlausibilityCost > 0) implausibleTransitions += 1;
        if (parts.status === 'ROUTE_NOT_FOUND_IN_EXTRACT' || parts.status === 'TOPOLOGY_INCOMPLETE') {
          unknownTopology += 1;
        }
        if (parts.turnRestrictionUnknown) turnRestrictionUnknown += 1;
      }
    }

    return {
      variant,
      labels: labelCounts(rows),
      waySwitches: waySwitches(rows),
      pathCost,
      costParts,
      costFunctionNote: variant === 'E' ? 'ROUTE_AWARE_R1_NOT_COMPARABLE_TO_ABCD' : 'LEGACY_VITERBI_COST',
      graphConflictsRounded: graphConflicts(track, roundedAdj),
      graphConflictsNodeId: graphConflicts(track, strict.undirectedAdj),
      directNonNeighbor,
      noGraphRoute,
      directionViolations,
      implausibleTransitions,
      unknownTopologyCases: unknownTopology,
      turnRestrictionUnknown,
      routeAwareTelemetry: eTelemetry,
      runtimeMs: ms,
      rows,
    };
  }

  const variants = (['A', 'B', 'C', 'D', 'E'] as Variant[]).map(runVariant);

  const parity: Record<string, boolean> = {};
  for (const key of ['A', 'B', 'C', 'D'] as const) {
    const v = variants.find((x) => x.variant === key)!;
    const pin = PINNED_BASELINE[key];
    parity[key] =
      v.labels.ASSOCIATED === pin.associated &&
      v.labels.AMBIGUOUS === pin.ambiguous &&
      v.labels.UNKNOWN === pin.unknown &&
      v.waySwitches === pin.waySwitches &&
      v.graphConflictsRounded === pin.graphConflictsRounded &&
      Math.abs(v.pathCost - pin.pathCost) < 1e-3;
  }

  const d = variants.find((v) => v.variant === 'D')!;
  const e = variants.find((v) => v.variant === 'E')!;
  const changedBuckets: Array<{ bucketLabelUtc: string; wayD: number | null; wayE: number | null }> = [];
  const geoFeatures: Array<Record<string, unknown>> = [];
  for (let i = 0; i < d.rows.length; i++) {
    const wD = d.rows[i].osmWayId;
    const wE = e.rows[i].osmWayId;
    if (wD !== wE) {
      changedBuckets.push({ bucketLabelUtc: d.rows[i].bucketLabelUtc, wayD: wD, wayE: wE });
      const b = buckets[i];
      if (b.latitude != null && b.longitude != null) {
        geoFeatures.push({
          type: 'Feature',
          properties: { bucketLabelUtc: b.bucketLabelUtc, wayD: wD, wayE: wE },
          geometry: { type: 'Point', coordinates: [b.longitude, b.latitude] },
        });
      }
    }
  }

  const memAfter = process.memoryUsage();
  const unknownFromGpsGapD = d.rows.filter(
    (r, i) => buckets[i].availability !== 'PRESENT' && r.outcome === 'UNKNOWN',
  ).length;
  const unknownFromGpsGapE = e.rows.filter(
    (r, i) => buckets[i].availability !== 'PRESENT' && r.outcome === 'UNKNOWN',
  ).length;
  const unknownDecoderIncreasePresentGps = d.rows.filter((r, i) => {
    const b = buckets[i];
    return (
      b.availability === 'PRESENT' &&
      d.rows[i].osmWayId != null &&
      e.rows[i].outcome === 'UNKNOWN' &&
      (d.rows[i].outcome === 'CONFIRMED' || d.rows[i].outcome === 'AMBIGUOUS')
    );
  }).length;
  const unknownDecoderIncreaseNullOnPresentGps = d.rows.filter((r, i) => {
    const b = buckets[i];
    return b.availability === 'PRESENT' && d.rows[i].osmWayId != null && e.rows[i].osmWayId == null;
  }).length;

  const report = {
    schema: 'EXP021_S4_ROUTE_AWARE_VITERBI_R2',
    tripId: grid.tripId,
    referenceMergeSha: '784c4b0cf3ae1e7e4534a458082ccef7ef539035',
    PHASE_0_SCOPE: {
      pr2082OnMain: true,
      noDbGuardFrom2079: true,
      researchOnly: true,
    },
    DIRECTED_GRAPH: {
      algorithmId: directed.algorithmId,
      turnRestrictionRelationsPresent: directed.turnRestrictionRelationsPresent,
      turnRestrictionIndex: {
        ...directed.turnRestrictionIndex,
        forbiddenTurnKeysCount: directed.turnRestrictionIndex.forbiddenTurnKeys.size,
        onlyRestrictionViaNodesCount: directed.turnRestrictionIndex.onlyRestrictionViaNodes.size,
      },
      uncertainties: directed.uncertainties,
    },
    VARIANT_E_HONEST_METRICS: {
      telemetry: variants.find((v) => v.variant === 'E')!.routeAwareTelemetry,
      chosenTransitionsNote: 'Chosen path only; rejected counts are DP evaluation samples',
      unknownBreakdown: {
        gpsGapUnknownD: unknownFromGpsGapD,
        gpsGapUnknownE: unknownFromGpsGapE,
        decoderUnknownIncreaseOnPresentGps: unknownDecoderIncreasePresentGps,
        decoderNullWayOnPresentGpsVsD: unknownDecoderIncreaseNullOnPresentGps,
      },
    },
    FIVE_WAY_REPLAY: variants.map((v) => ({
      variant: v.variant,
      labels: v.labels,
      waySwitches: v.waySwitches,
      pathCost: v.pathCost,
      costParts: v.costParts,
      costFunctionNote: v.costFunctionNote,
      graphConflictsRounded: v.graphConflictsRounded,
      graphConflictsNodeId: v.graphConflictsNodeId,
      directNonNeighbor: v.directNonNeighbor,
      noGraphRoute: v.noGraphRoute,
      directionViolations: v.directionViolations,
      implausibleTransitions: v.implausibleTransitions,
      unknownTopologyCases: v.unknownTopologyCases,
      turnRestrictionUnknown: v.turnRestrictionUnknown,
      runtimeMs: v.runtimeMs,
    })),
    BASELINE_PARITY: parity,
    CHANGED_WAY_BUCKETS: changedBuckets.slice(0, 200),
    CHANGED_WAY_BUCKET_COUNT: changedBuckets.length,
    RUNTIME_COMPARISON: Object.fromEntries(variants.map((v) => [v.variant, v.runtimeMs])),
    MEMORY: {
      heapUsedMbBefore: memBefore.heapUsed / 1_048_576,
      heapUsedMbAfter: memAfter.heapUsed / 1_048_576,
      rssMbAfter: memAfter.rss / 1_048_576,
    },
    INDEPENDENT_ACCURACY: 'NOT_ASSESSABLE',
    INDEPENDENT_VALIDATION_NOTES: [
      'Route-aware costs are not comparable to legacy scalar transition costs.',
      'Missing turn restrictions in frozen extract yield TURN_RESTRICTION_UNKNOWN — not treated as forbidden.',
      'ROUTE_NOT_FOUND_IN_EXTRACT does not imply physical impossibility.',
    ],
    FINAL_VERDICT:
      changedBuckets.length === 0
        ? 'NO_WAY_HYPOTHESIS_CHANGE_VS_D_ON_TESLA_PIN'
        : 'WAY_HYPOTHESIS_DELTA_OBSERVED_REVIEW_CHANGED_BUCKETS',
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'EXP021_S4_ROUTE_AWARE_VITERBI_R2.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(outDir, 'EXP021_S4_ROUTE_AWARE_VITERBI_R2_CHANGED_BUCKETS.geojson'),
    JSON.stringify({ type: 'FeatureCollection', features: geoFeatures }, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}

main();
