/**
 * EXP021 S4 Viterbi backtrack R1 — frozen Tesla replay + topology diagnosis (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  buildRoadContextFromOverpass,
  buildViterbiMatchesBacktrackR1,
  diagnoseWayAdjacency,
  type ResearchGpsBucket,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research';
import { buildBaselineMatches } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/baseline-matching';
import {
  buildViterbiMatches,
  headingsFromBaseline,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-matching';
import { buildWayAdjacency, graphReachable } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/osm-parse';
import { detectGraphTransitionConflicts } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/road-matching-pipeline';

const repoRoot = path.resolve(__dirname, '../../..');
const evidenceDir = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');
const fixturePath = path.join(evidenceDir, 'fixtures/tesla-20261016/TESLA_POSITION_GRID.json');
const osmPath = path.join(evidenceDir, 'LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json');
const pinsPath = path.join(evidenceDir, 'LDI10D_GEOMETRY_V2_REPLAY_PINS.json');
const outPath =
  process.env.S4_VITERBI_BACKTRACK_R1_OUT ??
  path.join('/opt/cursor/artifacts/exp021-s4-viterbi-backtrack-r1', 'EXP021_S4_VITERBI_BACKTRACK_R1.json');

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

function impossibleTransitions(
  rows: Array<{ osmWayId: number | null; outcome: string }>,
  adj: Map<number, Set<number>>,
): number {
  let n = 0;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].osmWayId;
    const cur = rows[i].osmWayId;
    if (prev != null && cur != null && prev !== cur && rows[i].outcome === 'CONFIRMED') {
      if (!graphReachable(adj, prev, cur)) n += 1;
    }
  }
  return n;
}

function main(): void {
  const pins = JSON.parse(fs.readFileSync(pinsPath, 'utf8')) as {
    viterbi: Record<string, number>;
  };
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
  const config = DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG;
  const baseline = buildBaselineMatches(buckets, roadContext, config);
  const headings = headingsFromBaseline(baseline);

  const t0 = performance.now();
  const forward = buildViterbiMatches(buckets, roadContext.ways, headings, config);
  const forwardMs = performance.now() - t0;

  const t1 = performance.now();
  const back = buildViterbiMatchesBacktrackR1(buckets, roadContext.ways, headings, config);
  const backtrackMs = performance.now() - t1;

  const adj = buildWayAdjacency(roadContext.ways);
  const forwardConflicts = detectGraphTransitionConflicts(
    forward.map((r) => ({ bucketLabelUtc: r.bucketLabelUtc, wayId: r.osmWayId })),
    roadContext.ways,
  );
  const backConflicts = detectGraphTransitionConflicts(
    back.matches.map((r) => ({ bucketLabelUtc: r.bucketLabelUtc, wayId: r.osmWayId })),
    roadContext.ways,
  );

  let changedBuckets = 0;
  for (let i = 0; i < buckets.length; i++) {
    if (forward[i].osmWayId !== back.matches[i].osmWayId || forward[i].outcome !== back.matches[i].outcome) {
      changedBuckets += 1;
    }
  }

  const pathCostVerified = back.segments.every(
    (s) => Math.abs(s.tracebackEndCost - s.tracebackVerifiedPathCost) < 1e-6,
  );

  const topology = diagnoseWayAdjacency(overpass, roadContext.ways);

  const report = {
    schema: 'EXP021_S4_VITERBI_BACKTRACK_R1',
    baseSha: 'c6d5ab99416bbff569f25741c27b4e24f46aaf8e',
    tripId: grid.tripId ?? '358d0158-b2a9-47ed-af26-33926c5770b4',
    FORWARD_V2_PARITY: {
      forwardLabelCounts: labelCounts(forward),
      pinnedViterbiCounts: pins.viterbi,
      forwardMatchesPins: JSON.stringify(labelCounts(forward)) === JSON.stringify(pins.viterbi),
    },
    BACKTRACKING_IMPLEMENTED: true,
    GLOBAL_PATH_COST_VERIFIED: pathCostVerified,
    CHANGED_BUCKETS: changedBuckets,
    WAY_SWITCH_DELTA: waySwitches(back.matches) - waySwitches(forward),
    GRAPH_CONFLICT_DELTA: backConflicts.length - forwardConflicts.length,
    labelCounts: {
      forward: labelCounts(forward),
      backtrack: labelCounts(back.matches),
    },
    graphConflicts: { forward: forwardConflicts.length, backtrack: backConflicts.length },
    impossibleConfirmedTransitions: {
      forward: impossibleTransitions(forward, adj),
      backtrack: impossibleTransitions(back.matches, adj),
    },
    pathCosts: {
      backtrackTotalReported: back.totalReportedPathCost,
      segments: back.segments,
    },
    RUNTIME_DELTA: {
      forwardMs,
      backtrackMs,
      deltaMs: backtrackMs - forwardMs,
    },
    OSM_TOPOLOGY_DIAGNOSIS: topology,
    INDEPENDENT_ACCURACY: 'NOT_ASSESSABLE',
    FINAL_RECOMMENDATION:
      'Keep FORWARD_V2 as default causal research path; backtrack R1 is audit-only until node-id adjacency (Phase B) and independent road GT exist. Lower global path cost does not imply higher road accuracy.',
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}

main();
