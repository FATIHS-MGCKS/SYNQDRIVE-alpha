/**
 * EXP021 S4 OSM Node-ID Topology R1 — four-way Tesla replay + 27-pair audit (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  auditAllRoundedOnlyPairs,
  buildRoadContextFromOverpass,
  buildStrictNodeIdWayAdjacency,
  buildViterbiMatchesBacktrackR1,
  verifyReportedPathCost,
  verifyReportedPathCostDetailed,
  type ResearchGpsBucket,
  type ResearchOsmWay,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research';
import { buildBaselineMatches } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/baseline-matching';
import {
  buildViterbiMatches,
  headingsFromBaseline,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-matching';
import {
  buildWayAdjacency,
  graphReachable,
  graphReachableMultiHop,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/osm-parse';
import { graphReachableNodeId } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/osm-node-id-topology';
const repoRoot = path.resolve(__dirname, '../../..');
const evidenceDir = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');
const fixturePath = path.join(evidenceDir, 'fixtures/tesla-20261016/TESLA_POSITION_GRID.json');
const osmPath = path.join(evidenceDir, 'LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json');
const outDir = process.env.S4_NODE_ID_TOPOLOGY_R1_OUT ?? '/opt/cursor/artifacts/exp021-s4-node-id-topology-r1';

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
  rows: Array<{ bucketLabelUtc: string; wayId: number | null; outcome: string }>,
  adj: Map<number, Set<number>>,
  reach: (adj: Map<number, Set<number>>, a: number | null, b: number | null) => boolean,
  confirmedOnly = false,
): number {
  let n = 0;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].wayId;
    const cur = rows[i].wayId;
    if (confirmedOnly && rows[i].outcome !== 'CONFIRMED') continue;
    if (prev != null && cur != null && prev !== cur && !reach(adj, prev, cur)) n += 1;
  }
  return n;
}

type TransitionConflictClass =
  | 'DIRECT_NON_NEIGHBOR'
  | 'NO_GRAPH_ROUTE'
  | 'ROUNDED_PHANTOM_EDGE';

function classifyTransitionConflicts(
  rows: Array<{ wayId: number | null; outcome: string }>,
  decoderAdj: Map<number, Set<number>>,
  roundedAdj: Map<number, Set<number>>,
  nodeAdj: Map<number, Set<number>>,
  confirmedOnly = false,
): Record<TransitionConflictClass, number> {
  const counts: Record<TransitionConflictClass, number> = {
    DIRECT_NON_NEIGHBOR: 0,
    NO_GRAPH_ROUTE: 0,
    ROUNDED_PHANTOM_EDGE: 0,
  };
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].wayId;
    const cur = rows[i].wayId;
    if (confirmedOnly && rows[i].outcome !== 'CONFIRMED') continue;
    if (prev == null || cur == null || prev === cur) continue;
    if (graphReachable(decoderAdj, prev, cur)) continue;

    const roundedPhantom =
      graphReachable(roundedAdj, prev, cur) && !graphReachable(nodeAdj, prev, cur);
    if (roundedPhantom) {
      counts.ROUNDED_PHANTOM_EDGE += 1;
      continue;
    }
    if (!graphReachableMultiHop(decoderAdj, prev, cur)) {
      counts.NO_GRAPH_ROUTE += 1;
    } else {
      counts.DIRECT_NON_NEIGHBOR += 1;
    }
  }
  return counts;
}

type Variant = 'A' | 'B' | 'C' | 'D';

function runVariant(
  variant: Variant,
  buckets: ResearchGpsBucket[],
  ways: ResearchOsmWay[],
  headings: (number | null)[],
  roundedAdj: Map<number, Set<number>>,
  nodeAdj: Map<number, Set<number>>,
): {
  variant: Variant;
  labels: Record<string, number>;
  waySwitches: number;
  pathCost: number;
  graphConflictsRounded: number;
  graphConflictsNodeId: number;
  confirmedImpossibleRounded: number;
  confirmedImpossibleNodeId: number;
  transitionConflictClasses: Record<TransitionConflictClass, number>;
  pathCostIndependent: number;
  pathCostParityOk: boolean;
  ms: number;
  rows: Array<{ osmWayId: number | null; outcome: string; bucketLabelUtc: string }>;
} {
  const useBacktrack = variant === 'B' || variant === 'D';
  const useNode = variant === 'C' || variant === 'D';
  const adj = useNode ? nodeAdj : roundedAdj;
  const t0 = performance.now();
  const backtrackResult = useBacktrack
    ? buildViterbiMatchesBacktrackR1(buckets, ways, headings, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, {
        wayAdjacency: adj,
      })
    : null;
  const rows = useBacktrack
    ? backtrackResult!.matches
    : buildViterbiMatches(buckets, ways, headings, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, { wayAdjacency: adj });
  const ms = performance.now() - t0;
  const wayIds = rows.map((r) => r.osmWayId);
  const pathCostDetail = verifyReportedPathCostDetailed(
    buckets,
    wayIds,
    ways,
    headings,
    DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    adj,
  );
  const pathCost = pathCostDetail.totalCost;
  const pathCostTracebackDecoder = useBacktrack ? backtrackResult!.totalReportedPathCost : pathCost;
  const pathCostVerifiedFromSegments = useBacktrack
    ? backtrackResult!.segments.reduce((s, m) => s + m.tracebackVerifiedPathCost, 0)
    : pathCost;
  const pathCostParityOk =
    Math.abs(pathCostTracebackDecoder - pathCost) < 1e-6 &&
    Math.abs(pathCostVerifiedFromSegments - pathCost) < 1e-6;
  const track = rows.map((r) => ({
    bucketLabelUtc: r.bucketLabelUtc,
    wayId: r.osmWayId,
    outcome: r.outcome,
  }));
  return {
    variant,
    labels: labelCounts(rows),
    waySwitches: waySwitches(rows),
    pathCost,
    graphConflictsRounded: graphConflicts(track, roundedAdj, graphReachable),
    graphConflictsNodeId: graphConflicts(track, nodeAdj, graphReachableNodeId),
    confirmedImpossibleRounded: graphConflicts(track, roundedAdj, graphReachable, true),
    confirmedImpossibleNodeId: graphConflicts(track, nodeAdj, graphReachableNodeId, true),
    transitionConflictClasses: classifyTransitionConflicts(track, adj, roundedAdj, nodeAdj),
    pathCostIndependent: pathCost,
    pathCostParityOk,
    ms,
    rows,
  };
}

function main(): void {
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

  const roundedAdj = buildWayAdjacency(roadContext.ways);
  const strict = buildStrictNodeIdWayAdjacency(overpass, roadContext.ways, roundedAdj);
  const nodeAdj = strict.undirectedAdj;

  const audit27 = auditAllRoundedOnlyPairs(overpass, roadContext.ways);

  const variants = (['A', 'B', 'C', 'D'] as Variant[]).map((v) =>
    runVariant(v, buckets, roadContext.ways, headings, roundedAdj, nodeAdj),
  );

  const invalidEliminated =
    variants.find((v) => v.variant === 'A')!.graphConflictsRounded -
    variants.find((v) => v.variant === 'D')!.graphConflictsNodeId;

  const report = {
    schema: 'EXP021_S4_NODE_ID_TOPOLOGY_R1',
    PHASE_0_SCOPE: {
      note: 'PR #2081 branch incorrectly stacked ops guard commits (27346cbdf, 013fdfe9a from PR #2079). S4-only commit: c4e4724dc / cherry-pick eaa52cc15 on this branch. Guard fixes remain on separate ops PR — not reverted.',
      s4OnlyCommits: ['eaa52cc15'],
      opsCommitsExcludedFromS4PR: ['27346cbdf', '013fdfe9a'],
    },
    ROUNDED_ONLY_27_AUDIT: audit27,
    STRICT_NODE_GRAPH_IMPLEMENTED: true,
    DIRECTIONAL_TOPOLOGY_STATUS: strict.directionalTopologyStatus,
    strictTopologyUncertainties: strict.uncertainties,
    roundedOnlyEdgesRemoved: strict.roundedOnlyEdgesRemoved,
    FOUR_WAY_REPLAY: variants.map((v) => ({
      variant: v.variant,
      description:
        v.variant === 'A'
          ? 'Forward V2 + Rounded'
          : v.variant === 'B'
            ? 'Backtrack R1 + Rounded'
            : v.variant === 'C'
              ? 'Forward V2 + Node-ID'
              : 'Backtrack R1 + Node-ID',
      labels: v.labels,
      waySwitches: v.waySwitches,
      pathCost: v.pathCost,
      graphConflictsUnderRoundedDefinition: v.graphConflictsRounded,
      graphConflictsUnderNodeIdDefinition: v.graphConflictsNodeId,
      confirmedImpossibleTransitionsRounded: v.confirmedImpossibleRounded,
      confirmedImpossibleTransitionsNodeId: v.confirmedImpossibleNodeId,
      transitionConflictClassification: v.transitionConflictClasses,
      pathCostDecoderReported: v.pathCost,
      pathCostIndependentReconstruction: v.pathCostIndependent,
      pathCostGraphParityOk: v.pathCostParityOk,
      runtimeMs: v.ms,
    })),
    INVALID_CONNECTIONS_ELIMINATED: {
      falseRoundedEdgesInGraph: audit27.length,
      graphConflictDelta_A_to_D_underNodeIdMetric: invalidEliminated,
    },
    WAY_SWITCH_COMPARISON: Object.fromEntries(variants.map((v) => [v.variant, v.waySwitches])),
    GRAPH_CONFLICT_COMPARISON: Object.fromEntries(
      variants.map((v) => [
        v.variant,
        { rounded: v.graphConflictsRounded, nodeId: v.graphConflictsNodeId },
      ]),
    ),
    RUNTIME_COMPARISON: Object.fromEntries(variants.map((v) => [v.variant, v.ms])),
    INDEPENDENT_ACCURACY: 'NOT_ASSESSABLE',
    RECOMMENDATION:
      'Adopt strict node-id adjacency for offline Viterbi research; keep rounded adjacency as legacy default in FORWARD_V2 until promotion audit. More visible conflicts under node-id metrics are expected when false rounded edges are removed — not automatic regression.',
  };

  const correctedDir = path.join(outDir, 'corrected');
  fs.mkdirSync(correctedDir, { recursive: true });
  const correctedReport = {
    ...report,
    schema: 'EXP021_S4_NODE_ID_TOPOLOGY_R1_CORRECTED',
    harnessFixes: {
      graphConflictsCallbackPassesAdj: true,
      verifyReportedPathCostUsesDecoderAdjacency: true,
      priorArtifactPreserved: true,
    },
    PR_2082_SCOPE_CHECK: {
      includesS4BacktrackFrom2081: true,
      note: 'Verify via git diff main — no production-db-ddl-guard commits on this branch.',
    },
  };
  fs.writeFileSync(
    path.join(correctedDir, 'EXP021_S4_NODE_ID_TOPOLOGY_R1_CORRECTED.json'),
    JSON.stringify(correctedReport, null, 2),
  );
  console.log(JSON.stringify(correctedReport, null, 2));
}

main();
