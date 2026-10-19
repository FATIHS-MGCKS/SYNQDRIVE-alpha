import type { ResearchOsmWay } from './contracts';
import {
  buildWayAdjacency,
  parseFrozenTopologyElements,
  type RawOsmWay,
} from './osm-parse';

export type AdjacencyEdgeClass =
  | 'SHARED_OSM_NODE_ID'
  | 'ROUNDED_COORD_ONLY'
  | 'SAME_COORD_DIFFERENT_NODE_ID'
  | 'LAYER_BRIDGE_TUNNEL_MISMATCH'
  | 'MISSING_NODE_IDS_ON_WAY'
  | 'ONEWAY_CONFLICT';

export type AdjacencyDiagnosisSummary = {
  roundedCoordAdjacencyPairs: number;
  sharedNodeIdPairs: number;
  roundedOnlyPairs: number;
  sameCoordDifferentNodeIdPairs: number;
  layerMismatchPairs: number;
  missingNodeIdWays: number;
  onewayConflictPairs: number;
  samples: Array<{
    wayA: number;
    wayB: number;
    classes: AdjacencyEdgeClass[];
  }>;
};

function wayLayer(tags: Record<string, string>): string {
  return tags.layer ?? tags.level ?? '0';
}

function buildAdjacencyFromNodeIds(ways: RawOsmWay[]): Map<number, Set<number>> {
  const nodeToWays = new Map<number, number[]>();
  for (const w of ways) {
    for (const nodeId of w.nodeIds) {
      const list = nodeToWays.get(nodeId) ?? [];
      list.push(w.osmId);
      nodeToWays.set(nodeId, list);
    }
  }
  const adj = new Map<number, Set<number>>();
  for (const w of ways) {
    const neighbors = adj.get(w.osmId) ?? new Set<number>();
    for (const nodeId of w.nodeIds) {
      for (const other of nodeToWays.get(nodeId) ?? []) {
        if (other !== w.osmId) neighbors.add(other);
      }
    }
    adj.set(w.osmId, neighbors);
  }
  return adj;
}

function roundedCoordKey(lat: number, lon: number): number {
  return Math.round(lat * 1e6) * 1_000_000 + Math.round(lon * 1e6);
}

/**
 * Phase B diagnosis: how rounded-coordinate adjacency diverges from OSM node-id topology.
 * Read-only; does not mutate production graphs.
 */
export function diagnoseWayAdjacency(
  overpassBody: { elements?: Array<Record<string, unknown>> },
  corridorWays: ResearchOsmWay[],
): AdjacencyDiagnosisSummary {
  const topo = parseFrozenTopologyElements(overpassBody);
  const rawById = new Map(topo.ways.map((w) => [w.osmId, w]));
  const roundedAdj = buildWayAdjacency(corridorWays);
  const nodeAdj = buildAdjacencyFromNodeIds(
    topo.ways.filter((w) => corridorWays.some((c) => c.osmWayId === w.osmId)),
  );

  let missingNodeIdWays = 0;
  for (const cw of corridorWays) {
    const raw = rawById.get(cw.osmWayId);
    if (!raw || raw.nodeIds.length === 0) missingNodeIdWays += 1;
  }

  const pairKey = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;
  const roundedPairs = new Set<string>();
  for (const [w, neighbors] of roundedAdj) {
    for (const n of neighbors) roundedPairs.add(pairKey(w, n));
  }
  const nodePairs = new Set<string>();
  for (const [w, neighbors] of nodeAdj) {
    for (const n of neighbors) nodePairs.add(pairKey(w, n));
  }

  let roundedOnlyPairs = 0;
  let sameCoordDifferentNodeIdPairs = 0;
  let layerMismatchPairs = 0;
  let onewayConflictPairs = 0;
  const samples: AdjacencyDiagnosisSummary['samples'] = [];

  for (const key of roundedPairs) {
    const [a, b] = key.split(':').map(Number);
    const inNode = nodePairs.has(key);
    const rawA = rawById.get(a);
    const rawB = rawById.get(b);
    const classes: AdjacencyEdgeClass[] = [];
    if (inNode) {
      classes.push('SHARED_OSM_NODE_ID');
    } else {
      classes.push('ROUNDED_COORD_ONLY');
      roundedOnlyPairs += 1;
      if (rawA && rawB) {
        const aNodes = new Set(rawA.nodeIds);
        const bNodes = new Set(rawB.nodeIds);
        let sharedCoordDiffId = false;
        const aCoordKeys = new Map<number, number>();
        for (const nid of rawA.nodeIds) {
          const c = topo.nodeCoords.get(nid);
          if (c) aCoordKeys.set(roundedCoordKey(c.lat, c.lon), nid);
        }
        for (const nid of rawB.nodeIds) {
          const c = topo.nodeCoords.get(nid);
          if (!c) continue;
          const k = roundedCoordKey(c.lat, c.lon);
          const other = aCoordKeys.get(k);
          if (other != null && other !== nid && !aNodes.has(nid) && !bNodes.has(other)) {
            sharedCoordDiffId = true;
          }
        }
        if (sharedCoordDiffId) {
          classes.push('SAME_COORD_DIFFERENT_NODE_ID');
          sameCoordDifferentNodeIdPairs += 1;
        }
        if (wayLayer(rawA.tags) !== wayLayer(rawB.tags)) {
          classes.push('LAYER_BRIDGE_TUNNEL_MISMATCH');
          layerMismatchPairs += 1;
        }
        const owA = rawA.tags.oneway;
        const owB = rawB.tags.oneway;
        if ((owA === 'yes' || owA === '-1') && (owB === 'yes' || owB === '-1')) {
          classes.push('ONEWAY_CONFLICT');
          onewayConflictPairs += 1;
        }
      } else {
        classes.push('MISSING_NODE_IDS_ON_WAY');
      }
    }
    if (samples.length < 12 && classes.includes('ROUNDED_COORD_ONLY')) {
      samples.push({ wayA: a, wayB: b, classes });
    }
  }

  return {
    roundedCoordAdjacencyPairs: roundedPairs.size,
    sharedNodeIdPairs: nodePairs.size,
    roundedOnlyPairs,
    sameCoordDifferentNodeIdPairs,
    layerMismatchPairs,
    missingNodeIdWays,
    onewayConflictPairs,
    samples,
  };
}
