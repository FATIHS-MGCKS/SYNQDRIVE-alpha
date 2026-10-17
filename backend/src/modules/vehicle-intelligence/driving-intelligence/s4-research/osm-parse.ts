import { haversineMeters } from '../speed-qc/di-v0-speed-qc-geo';
import { bearingDeg } from './geo';
import type { ResearchGpsBucket, ResearchOsmSignalNode, ResearchOsmWay } from './contracts';

export function metersToDegreeOffsets(lat: number, marginM: number): { dLat: number; dLon: number } {
  const dLat = marginM / 111_320;
  const dLon = marginM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { dLat, dLon };
}

export function computeCorridorBbox(
  points: Array<{ latitude: number; longitude: number }>,
  marginM: number,
): { south: number; west: number; north: number; east: number } {
  let south = 90;
  let north = -90;
  let west = 180;
  let east = -180;
  for (const p of points) {
    south = Math.min(south, p.latitude);
    north = Math.max(north, p.latitude);
    west = Math.min(west, p.longitude);
    east = Math.max(east, p.longitude);
  }
  const midLat = (south + north) / 2;
  const { dLat, dLon } = metersToDegreeOffsets(midLat, marginM);
  return { south: south - dLat, north: north + dLat, west: west - dLon, east: east + dLon };
}

/** Restrict large OSM extracts to a trip corridor (no network fetch). */
export function filterWaysToGpsCorridor(
  ways: ResearchOsmWay[],
  buckets: ResearchGpsBucket[],
  marginM: number,
): ResearchOsmWay[] {
  const points = buckets
    .filter((b) => b.availability === 'PRESENT' && b.latitude != null && b.longitude != null)
    .map((b) => ({ latitude: b.latitude!, longitude: b.longitude! }));
  if (points.length === 0) return ways;
  const bbox = computeCorridorBbox(points, marginM);
  return ways.filter((w) =>
    w.nodes.some(
      (n) => n.lat >= bbox.south && n.lat <= bbox.north && n.lon >= bbox.west && n.lon <= bbox.east,
    ),
  );
}

export function parseOverpassElements(body: { elements?: Array<Record<string, unknown>> }): {
  ways: ResearchOsmWay[];
  nodes: ResearchOsmSignalNode[];
} {
  const ways: ResearchOsmWay[] = [];
  const nodes: ResearchOsmSignalNode[] = [];
  for (const el of body.elements ?? []) {
    const type = String(el.type ?? '');
    const id = Number(el.id);
    const tags = (el.tags as Record<string, string>) ?? {};
    if (type === 'way') {
      const geom = (el.geometry as Array<{ lat: number; lon: number }>) ?? [];
      ways.push({
        osmWayId: id,
        nodes: geom.map((g) => ({ lat: g.lat, lon: g.lon })),
        tags,
        highway: tags.highway ?? null,
        maxspeed: tags.maxspeed ?? null,
        oneway: tags.oneway ?? null,
      });
    } else if (type === 'node') {
      const lat = Number(el.lat);
      const lon = Number(el.lon);
      let kind: ResearchOsmSignalNode['kind'] = 'other';
      if (tags.highway === 'traffic_signals') kind = 'traffic_signals';
      else if (tags.highway === 'crossing') kind = 'crossing';
      else if (tags.junction) kind = 'junction';
      nodes.push({ osmNodeId: id, lat, lon, tags, kind });
    }
  }
  return { ways, nodes };
}

/** Local equirectangular meters (no network; short-segment safe). */
export function latLonToLocalMeters(
  lat: number,
  lon: number,
  refLat: number,
  refLon: number,
): { x: number; y: number } {
  const cosLat = Math.cos((refLat * Math.PI) / 180);
  return {
    y: (lat - refLat) * 111_320,
    x: (lon - refLon) * 111_320 * cosLat,
  };
}

/**
 * Shortest distance from point P to segment AB in a consistent local metric frame.
 * Projection uses planar geometry on equirectangular coords anchored at the segment midpoint.
 */
export function pointToSegmentDistanceM(
  plat: number,
  plon: number,
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const refLat = (a.lat + b.lat) / 2;
  const refLon = (a.lon + b.lon) / 2;
  const p = latLonToLocalMeters(plat, plon, refLat, refLon);
  const aM = latLonToLocalMeters(a.lat, a.lon, refLat, refLon);
  const bM = latLonToLocalMeters(b.lat, b.lon, refLat, refLon);
  const dx = bM.x - aM.x;
  const dy = bM.y - aM.y;
  const segLenSq = dx * dx + dy * dy;
  if (segLenSq < 0.25) {
    const dAx = p.x - aM.x;
    const dAy = p.y - aM.y;
    const dBx = p.x - bM.x;
    const dBy = p.y - bM.y;
    return Math.min(Math.hypot(dAx, dAy), Math.hypot(dBx, dBy));
  }
  const t = Math.max(0, Math.min(1, ((p.x - aM.x) * dx + (p.y - aM.y) * dy) / segLenSq));
  const projX = aM.x + t * dx;
  const projY = aM.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

export type PointToSegmentDistanceM = (
  plat: number,
  plon: number,
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) => number;

export function nearestWayCandidates(
  lat: number,
  lon: number,
  ways: ResearchOsmWay[],
  radiusM: number,
  distanceFn: PointToSegmentDistanceM = pointToSegmentDistanceM,
): Array<{ way: ResearchOsmWay; distanceM: number; segmentBearingDeg: number | null }> {
  const hits: Array<{ way: ResearchOsmWay; distanceM: number; segmentBearingDeg: number | null }> = [];
  for (const way of ways) {
    if (way.nodes.length < 2) continue;
    let best = Infinity;
    let bestBearing: number | null = null;
    for (let i = 1; i < way.nodes.length; i++) {
      const d = distanceFn(lat, lon, way.nodes[i - 1], way.nodes[i]);
      if (d < best) {
        best = d;
        bestBearing = bearingDeg(
          way.nodes[i - 1].lat,
          way.nodes[i - 1].lon,
          way.nodes[i].lat,
          way.nodes[i].lon,
        );
      }
    }
    if (best <= radiusM) hits.push({ way, distanceM: best, segmentBearingDeg: bestBearing });
  }
  hits.sort((a, b) => a.distanceM - b.distanceM);
  return hits;
}

function filterOverpassBodyToBbox(
  body: { elements?: Array<Record<string, unknown>> },
  bbox: { south: number; west: number; north: number; east: number },
): { elements?: Array<Record<string, unknown>> } {
  const elements = (body.elements ?? []).filter((el) => {
    const type = String(el.type ?? '');
    if (type === 'node') {
      const lat = Number(el.lat);
      const lon = Number(el.lon);
      return lat >= bbox.south && lat <= bbox.north && lon >= bbox.west && lon <= bbox.east;
    }
    if (type === 'way') {
      const geom = (el.geometry as Array<{ lat: number; lon: number }>) ?? [];
      return geom.some(
        (g) => g.lat >= bbox.south && g.lat <= bbox.north && g.lon >= bbox.west && g.lon <= bbox.east,
      );
    }
    return true;
  });
  return { elements };
}

export function buildRoadContextFromOverpass(
  body: { elements?: Array<Record<string, unknown>> },
  opts?: { buckets?: ResearchGpsBucket[]; corridorMarginM?: number },
): {
  ways: ResearchOsmWay[];
  signalNodes: ResearchOsmSignalNode[];
  confirmedJunctions: Array<{ nodeId: number; lat: number; lon: number }>;
} {
  let scopedBody = body;
  if (opts?.buckets?.length) {
    const points = opts.buckets
      .filter((b) => b.availability === 'PRESENT' && b.latitude != null && b.longitude != null)
      .map((b) => ({ latitude: b.latitude!, longitude: b.longitude! }));
    if (points.length > 0) {
      const bbox = computeCorridorBbox(points, opts.corridorMarginM ?? 75);
      scopedBody = filterOverpassBodyToBbox(body, bbox);
    }
  }
  const parsed = parseOverpassElements(scopedBody);
  const topo = parseFrozenTopologyElements(scopedBody);
  const graph = buildDrivableGraph({
    ways: topo.ways,
    pedestrianCrossingNodeIds: topo.pedestrianCrossingNodeIds,
    nodeCoords: topo.nodeCoords,
  });
  const confirmedJunctions = graph.junctionCandidates
    .filter((j) => j.classification === 'CONFIRMED_TOPOLOGY')
    .map((j) => ({ nodeId: j.nodeId, lat: j.lat, lon: j.lon }));
  const signalNodes = parsed.nodes.filter((n) => n.kind === 'traffic_signals');
  const ways = opts?.buckets?.length
    ? filterWaysToGpsCorridor(parsed.ways, opts.buckets, opts.corridorMarginM ?? 75)
    : parsed.ways;
  return { ways, signalNodes, confirmedJunctions };
}

// --- topology (frozen OSM extract) ---

export type RawOsmWay = {
  osmId: number;
  nodeIds: number[];
  tags: Record<string, string>;
  geometry: Array<{ lat: number; lon: number }>;
};

export type JunctionClass = 'CONFIRMED_TOPOLOGY' | 'AMBIGUOUS' | 'NOT_ESTABLISHED';

export function parseFrozenTopologyElements(body: { elements?: Array<Record<string, unknown>> }): {
  ways: RawOsmWay[];
  nodeCoords: Map<number, { lat: number; lon: number }>;
  nodeTags: Map<number, Record<string, string>>;
  pedestrianCrossingNodeIds: Set<number>;
} {
  const ways: RawOsmWay[] = [];
  const nodeCoords = new Map<number, { lat: number; lon: number }>();
  const nodeTags = new Map<number, Record<string, string>>();
  const pedestrianCrossingNodeIds = new Set<number>();

  for (const el of body.elements ?? []) {
    const type = String(el.type ?? '');
    const id = Number(el.id);
    if (type === 'node') {
      const lat = Number(el.lat);
      const lon = Number(el.lon);
      const tags = (el.tags as Record<string, string>) ?? {};
      nodeCoords.set(id, { lat, lon });
      nodeTags.set(id, tags);
      if (tags.highway === 'crossing') pedestrianCrossingNodeIds.add(id);
    } else if (type === 'way') {
      const nodeIds = (el.nodes as number[]) ?? [];
      const geometry = (el.geometry as Array<{ lat: number; lon: number }>) ?? [];
      const tags = (el.tags as Record<string, string>) ?? {};
      ways.push({ osmId: id, nodeIds, tags, geometry });
      for (let i = 0; i < Math.min(nodeIds.length, geometry.length); i++) {
        if (!nodeCoords.has(nodeIds[i])) nodeCoords.set(nodeIds[i], geometry[i]);
      }
    }
  }
  return { ways, nodeCoords, nodeTags, pedestrianCrossingNodeIds };
}

function wayLayer(tags: Record<string, string>): string {
  return tags.layer ?? '0';
}

function isRestrictedAccess(tags: Record<string, string>): boolean {
  const access = tags.access ?? tags.vehicle ?? '';
  return access === 'no' || access === 'private' || access === 'agricultural';
}

export function buildDrivableGraph(params: {
  ways: RawOsmWay[];
  pedestrianCrossingNodeIds: Set<number>;
  nodeCoords: Map<number, { lat: number; lon: number }>;
}): {
  junctionCandidates: Array<{
    nodeId: number;
    lat: number;
    lon: number;
    incidentWayCount: number;
    distinctHighways: string[];
    classification: JunctionClass;
    excludedReason: string | null;
    graphEvidence: string;
  }>;
} {
  const nodeIncidentWays = new Map<
    number,
    Array<{ wayId: number; highway: string | null; oneway: string | null; layer: string }>
  >();

  for (const way of params.ways) {
    if (isRestrictedAccess(way.tags)) continue;
    const hw = way.tags.highway ?? null;
    const layer = wayLayer(way.tags);
    for (const nodeId of way.nodeIds) {
      if (params.pedestrianCrossingNodeIds.has(nodeId)) continue;
      const list = nodeIncidentWays.get(nodeId) ?? [];
      list.push({ wayId: way.osmId, highway: hw, oneway: way.tags.oneway ?? null, layer });
      nodeIncidentWays.set(nodeId, list);
    }
  }

  const junctionCandidates: Array<{
    nodeId: number;
    lat: number;
    lon: number;
    incidentWayCount: number;
    distinctHighways: string[];
    classification: JunctionClass;
    excludedReason: string | null;
    graphEvidence: string;
  }> = [];

  for (const [nodeId, incidents] of nodeIncidentWays) {
    const distinctWayIds = [...new Set(incidents.map((i) => i.wayId))];
    if (distinctWayIds.length < 2) continue;

    const layers = [...new Set(incidents.map((i) => i.layer))];
    const highways = [...new Set(incidents.map((i) => i.highway).filter(Boolean))] as string[];

    let classification: JunctionClass = 'NOT_ESTABLISHED';
    let excludedReason: string | null = null;
    let graphEvidence = `node ${nodeId}: ${distinctWayIds.length} ways`;

    if (layers.length > 1) {
      classification = 'AMBIGUOUS';
      excludedReason = 'GRADE_SEPARATION_LAYER_MISMATCH';
      graphEvidence += `; layers=${layers.join(',')}`;
    } else if (distinctWayIds.length >= 3) {
      classification = 'CONFIRMED_TOPOLOGY';
      graphEvidence += '; degree>=3';
    } else if (distinctWayIds.length === 2) {
      const oneways = incidents.map((i) => i.oneway);
      if (oneways.some((o) => o === 'yes' || o === '-1')) {
        classification = 'CONFIRMED_TOPOLOGY';
        graphEvidence += '; two_way_oneway_pair';
      } else {
        classification = 'AMBIGUOUS';
        graphEvidence += '; two_way_merge_or_split';
      }
    }

    const coord = params.nodeCoords.get(nodeId);
    junctionCandidates.push({
      nodeId,
      lat: coord?.lat ?? 0,
      lon: coord?.lon ?? 0,
      incidentWayCount: distinctWayIds.length,
      distinctHighways: highways,
      classification,
      excludedReason,
      graphEvidence,
    });
  }

  return { junctionCandidates };
}

/**
 * Way–way adjacency from shared geometry nodes (rounded lat/lon keys).
 * LIMITATIONS: does not model OSM `layer`/`level` separation — ways that meet only
 * at the same lat/lon (e.g. grade-separated bridge stacks) are treated as connected.
 * Does not infer connectivity from spatial overlap without a shared node coordinate.
 */
export function buildWayAdjacency(ways: ResearchOsmWay[]): Map<number, Set<number>> {
  const nodeToWays = new Map<number, number[]>();
  for (const w of ways) {
    for (const n of w.nodes) {
      const key = Math.round(n.lat * 1e6) * 1_000_000 + Math.round(n.lon * 1e6);
      const list = nodeToWays.get(key) ?? [];
      list.push(w.osmWayId);
      nodeToWays.set(key, list);
    }
  }
  const adj = new Map<number, Set<number>>();
  for (const w of ways) {
    const neighbors = adj.get(w.osmWayId) ?? new Set<number>();
    for (const n of w.nodes) {
      const key = Math.round(n.lat * 1e6) * 1_000_000 + Math.round(n.lon * 1e6);
      for (const other of nodeToWays.get(key) ?? []) {
        if (other !== w.osmWayId) neighbors.add(other);
      }
    }
    adj.set(w.osmWayId, neighbors);
  }
  return adj;
}

export function graphReachable(adj: Map<number, Set<number>>, a: number | null, b: number | null): boolean {
  if (a == null || b == null) return false;
  if (a === b) return true;
  return adj.get(a)?.has(b) ?? false;
}
