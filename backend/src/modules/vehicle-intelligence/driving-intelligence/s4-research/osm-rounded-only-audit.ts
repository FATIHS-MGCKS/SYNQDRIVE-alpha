import type { ResearchOsmWay } from './contracts';
import { haversineMeters } from '../speed-qc/di-v0-speed-qc-geo';
import { buildWayAdjacency, parseFrozenTopologyElements, type RawOsmWay } from './osm-parse';

export type RoundedOnlyPairProofStatus =
  | 'CONFIRMED_FALSE_POSITIVE_ROUNDED_EDGE'
  | 'UNCERTAIN_DRIVEABILITY'
  | 'SHARED_COORD_DIFFERENT_NODE_ID';

export type RoundedOnlyPairAuditRow = {
  wayA: number;
  wayB: number;
  sharedOsmNodeIds: number[];
  roundedCoordCollisionKeys: Array<{ lat: number; lon: number; nodeIdA: number; nodeIdB: number; distanceM: number }>;
  highwayA: string | null;
  highwayB: string | null;
  layerA: string;
  layerB: string;
  bridgeA: string | null;
  tunnelA: string | null;
  bridgeB: string | null;
  tunnelB: string | null;
  onewayA: string | null;
  onewayB: string | null;
  directedTransitionStatus: string;
  drivableConnectionEvidence: string;
  proofStatus: RoundedOnlyPairProofStatus;
};

function roundedCoordKey(lat: number, lon: number): number {
  return Math.round(lat * 1e6) * 1_000_000 + Math.round(lon * 1e6);
}

function tag(tags: Record<string, string>, k: string): string | null {
  return tags[k] ?? null;
}

function layerOf(tags: Record<string, string>): string {
  return tags.layer ?? tags.level ?? '0';
}

function sharedNodeIds(a: RawOsmWay, b: RawOsmWay): number[] {
  const bs = new Set(b.nodeIds);
  return a.nodeIds.filter((id) => bs.has(id));
}

function coordCollisions(
  a: RawOsmWay,
  b: RawOsmWay,
  nodeCoords: Map<number, { lat: number; lon: number }>,
): RoundedOnlyPairAuditRow['roundedCoordCollisionKeys'] {
  const out: RoundedOnlyPairAuditRow['roundedCoordCollisionKeys'] = [];
  const aByKey = new Map<number, number>();
  for (const nid of a.nodeIds) {
    const c = nodeCoords.get(nid);
    if (c) aByKey.set(roundedCoordKey(c.lat, c.lon), nid);
  }
  for (const nid of b.nodeIds) {
    const c = nodeCoords.get(nid);
    if (!c) continue;
    const k = roundedCoordKey(c.lat, c.lon);
    const other = aByKey.get(k);
    if (other != null && other !== nid) {
      const ca = nodeCoords.get(other)!;
      out.push({
        lat: c.lat,
        lon: c.lon,
        nodeIdA: other,
        nodeIdB: nid,
        distanceM: haversineMeters(ca.lat, ca.lon, c.lat, c.lon),
      });
    }
  }
  return out;
}

/**
 * Full audit of rounded-only adjacency pairs (offline Phase 1).
 */
export function auditAllRoundedOnlyPairs(
  overpassBody: { elements?: Array<Record<string, unknown>> },
  corridorWays: ResearchOsmWay[],
): RoundedOnlyPairAuditRow[] {
  const topo = parseFrozenTopologyElements(overpassBody);
  const rawById = new Map(topo.ways.map((w) => [w.osmId, w]));
  const corridorIds = new Set(corridorWays.map((w) => w.osmWayId));
  const roundedAdj = buildWayAdjacency(corridorWays);

  const nodeAdjPairs = new Set<string>();
  const nodeToWays = new Map<number, number[]>();
  for (const w of topo.ways) {
    if (!corridorIds.has(w.osmId)) continue;
    for (const nodeId of w.nodeIds) {
      const list = nodeToWays.get(nodeId) ?? [];
      list.push(w.osmId);
      nodeToWays.set(nodeId, list);
    }
  }
  for (const [w, waysAtNode] of nodeToWays) {
    for (let i = 0; i < waysAtNode.length; i++) {
      for (let j = i + 1; j < waysAtNode.length; j++) {
        const a = waysAtNode[i];
        const b = waysAtNode[j];
        nodeAdjPairs.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
      }
    }
  }

  const pairKey = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;
  const rows: RoundedOnlyPairAuditRow[] = [];

  for (const [w, neighbors] of roundedAdj) {
    if (!corridorIds.has(w)) continue;
    for (const n of neighbors) {
      const key = pairKey(w, n);
      if (nodeAdjPairs.has(key)) continue;
      const rawA = rawById.get(w);
      const rawB = rawById.get(n);
      if (!rawA || !rawB) continue;
      const collisions = coordCollisions(rawA, rawB, topo.nodeCoords);
      const shared = sharedNodeIds(rawA, rawB);
      const layerMismatch = layerOf(rawA.tags) !== layerOf(rawB.tags);
      const bridgeTunnel =
        tag(rawA.tags, 'bridge') != null ||
        tag(rawB.tags, 'bridge') != null ||
        tag(rawA.tags, 'tunnel') != null ||
        tag(rawB.tags, 'tunnel') != null;

      let proofStatus: RoundedOnlyPairProofStatus = 'CONFIRMED_FALSE_POSITIVE_ROUNDED_EDGE';
      if (collisions.length > 0) proofStatus = 'SHARED_COORD_DIFFERENT_NODE_ID';
      if (bridgeTunnel && layerMismatch) proofStatus = 'UNCERTAIN_DRIVEABILITY';

      let directedTransitionStatus = 'NO_SHARED_NODE';
      if (collisions.length > 0) directedTransitionStatus = 'ONEWAY_AND_TURN_DATA_UNKNOWN';

      rows.push({
        wayA: Math.min(w, n),
        wayB: Math.max(w, n),
        sharedOsmNodeIds: shared,
        roundedCoordCollisionKeys: collisions,
        highwayA: rawA.tags.highway ?? null,
        highwayB: rawB.tags.highway ?? null,
        layerA: layerOf(rawA.tags),
        layerB: layerOf(rawB.tags),
        bridgeA: tag(rawA.tags, 'bridge'),
        tunnelA: tag(rawA.tags, 'tunnel'),
        bridgeB: tag(rawB.tags, 'bridge'),
        tunnelB: tag(rawB.tags, 'tunnel'),
        onewayA: rawA.tags.oneway ?? null,
        onewayB: rawB.tags.oneway ?? null,
        directedTransitionStatus,
        drivableConnectionEvidence:
          collisions.length > 0
            ? 'Rounded coordinate merge only; distinct OSM node ids at same rounded key'
            : 'Rounded adjacency without shared node id or coordinate collision in extract',
        proofStatus,
      });
    }
  }

  const dedup = new Map<string, RoundedOnlyPairAuditRow>();
  for (const r of rows) dedup.set(pairKey(r.wayA, r.wayB), r);
  return [...dedup.values()].sort((a, b) => a.wayA - b.wayA || a.wayB - b.wayB);
}
