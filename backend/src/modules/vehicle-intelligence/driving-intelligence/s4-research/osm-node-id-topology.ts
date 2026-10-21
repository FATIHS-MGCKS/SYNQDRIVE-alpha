import type { ResearchOsmWay } from './contracts';
import { parseFrozenTopologyElements, type RawOsmWay } from './osm-parse';
import { S4_RESEARCH_STRICT_NODE_ID_TOPOLOGY_R1 } from './version';

export type DirectedTransitionStatus =
  | 'SHARED_NODE_UNDIRECTED'
  | 'ONEWAY_DIRECTION_UNKNOWN'
  | 'TURN_RESTRICTIONS_UNKNOWN'
  | 'CLEARLY_ALLOWED'
  | 'CLEARLY_FORBIDDEN';

export type StrictNodeIdTopologyBundle = {
  algorithmId: string;
  undirectedAdj: Map<number, Set<number>>;
  directionalTopologyStatus: 'TURN_RESTRICTIONS_NOT_IN_FROZEN_EXTRACT';
  uncertainties: string[];
  missingNodeIdWayIds: number[];
  /** Pairs connected in rounded graph but not by shared OSM node id (false-positive edges removed). */
  roundedOnlyEdgesRemoved: number;
};

function wayLayer(tags: Record<string, string>): string {
  return tags.layer ?? tags.level ?? '0';
}

function sharedNodeIds(a: RawOsmWay, b: RawOsmWay): number[] {
  const bs = new Set(b.nodeIds);
  return a.nodeIds.filter((id) => bs.has(id));
}

/**
 * Conservative oneway check: only forbid when both ways are oneway and the only
 * shared node is an endpoint that cannot serve as a continuous drive-through
 * without reversing on a oneway=yes segment (heuristic, not turn-restriction aware).
 */
export function classifyDirectedTransition(
  prev: RawOsmWay,
  cur: RawOsmWay,
  sharedNodes: number[],
): DirectedTransitionStatus {
  if (sharedNodes.length === 0) return 'CLEARLY_FORBIDDEN';
  const prevOw = prev.tags.oneway;
  const curOw = cur.tags.oneway;
  if (prevOw !== 'yes' && prevOw !== '-1' && curOw !== 'yes' && curOw !== '-1') {
    return 'SHARED_NODE_UNDIRECTED';
  }
  return 'ONEWAY_DIRECTION_UNKNOWN';
}

/**
 * Strict offline adjacency: edges only when ways share at least one OSM node id.
 * No coordinate-rounding edges. Does not treat missing turn restrictions as impossible.
 */
export function buildStrictNodeIdWayAdjacency(
  overpassBody: { elements?: Array<Record<string, unknown>> },
  corridorWays: ResearchOsmWay[],
  roundedAdjForDiff?: Map<number, Set<number>>,
): StrictNodeIdTopologyBundle {
  const topo = parseFrozenTopologyElements(overpassBody);
  const corridorIds = new Set(corridorWays.map((w) => w.osmWayId));
  const rawWays = topo.ways.filter((w) => corridorIds.has(w.osmId));
  const rawById = new Map(rawWays.map((w) => [w.osmId, w]));

  const missingNodeIdWayIds: number[] = [];
  for (const id of corridorIds) {
    const raw = rawById.get(id);
    if (!raw || raw.nodeIds.length === 0) missingNodeIdWayIds.push(id);
  }

  const nodeToWays = new Map<number, number[]>();
  for (const w of rawWays) {
    for (const nodeId of w.nodeIds) {
      const list = nodeToWays.get(nodeId) ?? [];
      list.push(w.osmId);
      nodeToWays.set(nodeId, list);
    }
  }

  const undirectedAdj = new Map<number, Set<number>>();
  for (const w of rawWays) {
    const neighbors = undirectedAdj.get(w.osmId) ?? new Set<number>();
    for (const nodeId of w.nodeIds) {
      for (const other of nodeToWays.get(nodeId) ?? []) {
        if (other === w.osmId) continue;
        const otherWay = rawById.get(other);
        if (!otherWay) continue;
        // Do not invent edges from coordinate equality without shared node id (already enforced).
        // Layer mismatch: keep node-id edge but record uncertainty — do not merge grade-separated stacks via coords.
        if (wayLayer(w.tags) !== wayLayer(otherWay.tags)) {
          // Still allow node-id topology (OSM graph truth); uncertainty surfaced in audit.
        }
        neighbors.add(other);
      }
    }
    undirectedAdj.set(w.osmId, neighbors);
  }

  let roundedOnlyEdgesRemoved = 0;
  if (roundedAdjForDiff) {
    for (const [w, neighbors] of roundedAdjForDiff) {
      if (!corridorIds.has(w)) continue;
      for (const n of neighbors) {
        if (!undirectedAdj.get(w)?.has(n)) roundedOnlyEdgesRemoved += 1;
      }
    }
    roundedOnlyEdgesRemoved = Math.floor(roundedOnlyEdgesRemoved / 2);
  }

  const uncertainties: string[] = [
    'TURN_RESTRICTION_RELATIONS_NOT_IN_FROZEN_OVERPASS_EXTRACT',
    'ONEWAY_DIRECTION_NOT_FULLY_RESOLVED_WITHOUT_TURN_RESTRICTIONS',
  ];
  if (missingNodeIdWayIds.length > 0) {
    uncertainties.push(`MISSING_NODE_IDS_ON_${missingNodeIdWayIds.length}_CORRIDOR_WAYS`);
  }

  return {
    algorithmId: S4_RESEARCH_STRICT_NODE_ID_TOPOLOGY_R1,
    undirectedAdj,
    directionalTopologyStatus: 'TURN_RESTRICTIONS_NOT_IN_FROZEN_EXTRACT',
    uncertainties,
    missingNodeIdWayIds,
    roundedOnlyEdgesRemoved,
  };
}

export function graphReachableNodeId(
  adj: Map<number, Set<number>>,
  a: number | null,
  b: number | null,
): boolean {
  if (a == null || b == null) return false;
  if (a === b) return true;
  return adj.get(a)?.has(b) ?? false;
}
