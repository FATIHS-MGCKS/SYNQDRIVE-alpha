import { haversineMeters } from '../speed-qc/di-v0-speed-qc-geo';
import type { ResearchOsmWay } from './contracts';
import { parseFrozenTopologyElements, type RawOsmWay } from './osm-parse';
import { S4_RESEARCH_DIRECTED_ROUTING_GRAPH_R1 } from './version';

export type RouteTopologyStatus =
  | 'CONNECTED_AND_DIRECTION_ALLOWED'
  | 'DIRECTION_FORBIDDEN'
  | 'TURN_RESTRICTION_UNKNOWN'
  | 'ROUTE_NOT_FOUND_IN_EXTRACT'
  | 'TOPOLOGY_INCOMPLETE';

export type DirectedRoutingEdge = {
  toNodeId: number;
  distanceM: number;
  wayId: number;
  segmentIndex: number;
};

export type DirectedCarRoutingGraph = {
  algorithmId: string;
  corridorWayIds: Set<number>;
  rawWaysById: Map<number, RawOsmWay>;
  nodeCoords: Map<number, { lat: number; lon: number }>;
  /** Outgoing drivable edges per OSM node id. */
  adjacency: Map<number, DirectedRoutingEdge[]>;
  turnRestrictionRelationsPresent: boolean;
  uncertainties: string[];
};

const MOTORWAY_LIKE = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link']);
const DRIVABLE_HIGHWAYS = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'unclassified',
  'residential',
  'living_street',
  'service',
  'road',
  'track',
]);

function isCarDrivableWay(tags: Record<string, string>): boolean {
  const hw = tags.highway;
  if (!hw || !DRIVABLE_HIGHWAYS.has(hw)) return false;
  const access = tags.access ?? tags.vehicle ?? '';
  if (access === 'no' || access === 'private') return false;
  if (tags.motor_vehicle === 'no') return false;
  return true;
}

function segmentLengthM(
  nodeCoords: Map<number, { lat: number; lon: number }>,
  a: number,
  b: number,
): number {
  const ca = nodeCoords.get(a);
  const cb = nodeCoords.get(b);
  if (!ca || !cb) return 0;
  return haversineMeters(ca.lat, ca.lon, cb.lat, cb.lon);
}

function forwardAllowed(tags: Record<string, string>): boolean {
  const ow = tags.oneway;
  if (ow === '-1') return false;
  return true;
}

function reverseAllowed(tags: Record<string, string>): boolean {
  const ow = tags.oneway;
  if (ow === 'yes') return false;
  return true;
}

/**
 * Build a directed car routing graph from frozen Overpass topology (corridor ways only).
 * Does not invent turn restrictions when relations are absent.
 */
export function buildDirectedCarRoutingGraph(
  overpassBody: { elements?: Array<Record<string, unknown>> },
  corridorWays: ResearchOsmWay[],
): DirectedCarRoutingGraph {
  const topo = parseFrozenTopologyElements(overpassBody);
  const corridorWayIds = new Set(corridorWays.map((w) => w.osmWayId));
  const rawWays = topo.ways.filter((w) => corridorWayIds.has(w.osmId));
  const rawWaysById = new Map(rawWays.map((w) => [w.osmId, w]));

  const turnRestrictionRelationsPresent = (overpassBody.elements ?? []).some(
    (el) => String(el.type ?? '') === 'relation' && (el.tags as Record<string, string>)?.type === 'restriction',
  );

  const adjacency = new Map<number, DirectedRoutingEdge[]>();
  const uncertainties: string[] = [];
  if (!turnRestrictionRelationsPresent) {
    uncertainties.push('TURN_RESTRICTION_RELATIONS_NOT_IN_FROZEN_EXTRACT');
  } else {
    uncertainties.push('TURN_RESTRICTION_RELATIONS_PRESENT_BUT_NOT_APPLIED_IN_R1_DECODER');
  }

  for (const way of rawWays) {
    if (!isCarDrivableWay(way.tags)) continue;
    const nodes = way.nodeIds;
    if (nodes.length < 2) {
      uncertainties.push(`WAY_${way.osmId}_TOPOLOGY_INCOMPLETE`);
      continue;
    }
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      if (!topo.nodeCoords.has(a) || !topo.nodeCoords.has(b)) {
        uncertainties.push(`WAY_${way.osmId}_MISSING_NODE_COORDS`);
        continue;
      }
      const dist = segmentLengthM(topo.nodeCoords, a, b);
      if (dist <= 0) continue;
      if (forwardAllowed(way.tags)) {
        const list = adjacency.get(a) ?? [];
        list.push({ toNodeId: b, distanceM: dist, wayId: way.osmId, segmentIndex: i });
        adjacency.set(a, list);
      }
      if (reverseAllowed(way.tags)) {
        const list = adjacency.get(b) ?? [];
        list.push({ toNodeId: a, distanceM: dist, wayId: way.osmId, segmentIndex: i });
        adjacency.set(b, list);
      }
    }
  }

  return {
    algorithmId: S4_RESEARCH_DIRECTED_ROUTING_GRAPH_R1,
    corridorWayIds,
    rawWaysById,
    nodeCoords: topo.nodeCoords,
    adjacency,
    turnRestrictionRelationsPresent,
    uncertainties: [...new Set(uncertainties)],
  };
}

/** Junction complexity heuristic for turn-restriction unknown (no invented rules). */
export function junctionTurnRestrictionUnknown(
  graph: DirectedCarRoutingGraph,
  nodeId: number,
): boolean {
  if (graph.turnRestrictionRelationsPresent) return false;
  const out = graph.adjacency.get(nodeId)?.length ?? 0;
  return out >= 3;
}
