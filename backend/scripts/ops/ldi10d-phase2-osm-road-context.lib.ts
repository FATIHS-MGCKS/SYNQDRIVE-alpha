/**
 * LDI-10D Phase 2 — frozen OSM road context + maneuver association (offline).
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import { sha256File, verifyArtifactProvenance } from './ldi10a-longitudinal-candidate-forensics.lib';
import { loadLdi08Artifacts, type Ldi08Row } from './ldi09-accel-decel-signal-forensics.lib';
import {
  bearingDeg,
  bucketMs,
  loadLdi10bGroups,
  matchManeuverTrajectory,
  rowsInInclusiveWindow,
  type Ldi10bGroup,
  verifyLdi10cProvenance,
} from './ldi10c-spatial-trip-reconstruction.lib';

export const LDI10D_OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
export const LDI10D_USER_AGENT = 'SynqDrive-LDI10D-Phase2/1.0 (forensic evidence; contact: ops@synqdrive.eu)';

export const DEFAULT_UNCERTAINTY_RADIUS_M = 25;
export const SIGNAL_SEARCH_RADIUS_M = 35;
export const BEARING_COMPAT_DEG = 45;

export type OsmNode = {
  osmId: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  kind: 'traffic_signals' | 'crossing' | 'junction' | 'other';
};

export type OsmWay = {
  osmId: number;
  nodes: Array<{ lat: number; lon: number }>;
  tags: Record<string, string>;
  highway: string | null;
  maxspeed: string | null;
  oneway: string | null;
};

export function sha256Buffer(buf: string | Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function metersToDegreeOffsets(lat: number, marginM: number): { dLat: number; dLon: number } {
  const dLat = marginM / 111_320;
  const dLon = marginM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { dLat, dLon };
}

export function computeCorridorBbox(
  points: Array<{ latitude: number; longitude: number }>,
  marginM: number,
): { south: number; west: number; north: number; east: number; marginM: number } {
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
  return {
    south: south - dLat,
    north: north + dLat,
    west: west - dLon,
    east: east + dLon,
    marginM,
  };
}

export function buildOverpassQuery(bbox: { south: number; west: number; north: number; east: number }): string {
  const { south, west, north, east } = bbox;
  return `[out:json][timeout:90];
(
  node["highway"="traffic_signals"](${south},${west},${north},${east});
  node["highway"="crossing"](${south},${west},${north},${east});
  node["junction"](${south},${west},${north},${east});
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|service|living_street)$"](${south},${west},${north},${east});
  relation["type"="restriction"](${south},${west},${north},${east});
);
out body geom;`;
}

export async function fetchOverpassSnapshot(query: string): Promise<{
  ok: true;
  body: unknown;
  rawText: string;
  fetchedAtUtc: string;
  httpStatus: number;
} | { ok: false; error: string; httpStatus?: number; snippet?: string }> {
  const fetchedAtUtc = new Date().toISOString();
  try {
    const res = await fetch(LDI10D_OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': LDI10D_USER_AGENT,
        Accept: 'application/json',
      },
      body: new URLSearchParams({ data: query }).toString(),
    });
    const rawText = await res.text();
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, httpStatus: res.status, snippet: rawText.slice(0, 500) };
    }
    const body = JSON.parse(rawText) as unknown;
    return { ok: true, body, rawText, fetchedAtUtc, httpStatus: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function parseOverpassElements(body: { elements?: Array<Record<string, unknown>> }): {
  ways: OsmWay[];
  nodes: OsmNode[];
  relations: Array<{ osmId: number; tags: Record<string, string> }>;
} {
  const ways: OsmWay[] = [];
  const nodes: OsmNode[] = [];
  const relations: Array<{ osmId: number; tags: Record<string, string> }> = [];
  for (const el of body.elements ?? []) {
    const type = String(el.type ?? '');
    const id = Number(el.id);
    const tags = (el.tags as Record<string, string>) ?? {};
    if (type === 'way') {
      const geom = (el.geometry as Array<{ lat: number; lon: number }>) ?? [];
      ways.push({
        osmId: id,
        nodes: geom.map((g) => ({ lat: g.lat, lon: g.lon })),
        tags,
        highway: tags.highway ?? null,
        maxspeed: tags.maxspeed ?? null,
        oneway: tags.oneway ?? null,
      });
    } else if (type === 'node') {
      const lat = Number(el.lat);
      const lon = Number(el.lon);
      let kind: OsmNode['kind'] = 'other';
      if (tags.highway === 'traffic_signals') kind = 'traffic_signals';
      else if (tags.highway === 'crossing') kind = 'crossing';
      else if (tags.junction) kind = 'junction';
      nodes.push({ osmId: id, lat, lon, tags, kind });
    } else if (type === 'relation') {
      relations.push({ osmId: id, tags });
    }
  }
  return { ways, nodes, relations };
}

function pointToSegmentDistanceM(
  plat: number,
  plon: number,
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dA = haversineMeters(plat, plon, a.lat, a.lon);
  const dB = haversineMeters(plat, plon, b.lat, b.lon);
  const segLen = haversineMeters(a.lat, a.lon, b.lat, b.lon);
  if (segLen < 0.5) return dA;
  const t = Math.max(0, Math.min(1, ((plat - a.lat) * (b.lat - a.lat) + (plon - a.lon) * (b.lon - a.lon)) / (segLen * segLen + 1e-12)));
  const projLat = a.lat + t * (b.lat - a.lat);
  const projLon = a.lon + t * (b.lon - a.lon);
  return haversineMeters(plat, plon, projLat, projLon);
}

export function nearestWayCandidates(
  lat: number,
  lon: number,
  ways: OsmWay[],
  radiusM: number,
): Array<{ way: OsmWay; distanceM: number; segmentBearingDeg: number | null }> {
  const hits: Array<{ way: OsmWay; distanceM: number; segmentBearingDeg: number | null }> = [];
  for (const way of ways) {
    if (way.nodes.length < 2) continue;
    let best = Infinity;
    let bestBearing: number | null = null;
    for (let i = 1; i < way.nodes.length; i++) {
      const d = pointToSegmentDistanceM(lat, lon, way.nodes[i - 1], way.nodes[i]);
      if (d < best) {
        best = d;
        bestBearing = bearingDeg(way.nodes[i - 1].lat, way.nodes[i - 1].lon, way.nodes[i].lat, way.nodes[i].lon);
      }
    }
    if (best <= radiusM) hits.push({ way, distanceM: best, segmentBearingDeg: bestBearing });
  }
  hits.sort((a, b) => a.distanceM - b.distanceM);
  return hits;
}

function headingDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

export function associateGroup(params: {
  group: Ldi10bGroup;
  rows: Ldi08Row[];
  ways: OsmWay[];
  signalNodes: OsmNode[];
  uncertaintyRadiusM: number;
}): Record<string, unknown> {
  const { group, rows, ways, signalNodes, uncertaintyRadiusM } = params;
  const spatial = matchManeuverTrajectory(group, rows);
  const windowRows = rowsInInclusiveWindow(rows, group.windowUtc.start, group.windowUtc.end);
  const gpsBuckets = windowRows
    .filter((r) => r.gps.availability === 'PRESENT' && r.gps.latitude != null && r.gps.longitude != null)
    .map((r) => ({
      utc: r.evaluationIndexUtc,
      lat: r.gps.latitude!,
      lon: r.gps.longitude!,
      l3Qc: r.l3.qcTrustLevel,
    }));

  if (gpsBuckets.length === 0) {
    return {
      groupId: group.groupId,
      windowUtc: group.windowUtc,
      candidateIds: group.candidateIds,
      plausibilityVerdictPreserved: group.plausibilityVerdict,
      associationOutcome: 'UNKNOWN',
      associationClass: 'UNKNOWN',
      confidence: 'UNKNOWN',
      ambiguityReasons: ['NO_GPS_PRESENT_IN_WINDOW'],
      gpsBucketsUsed: [],
      centroid: null,
      candidateRoadWayIds: [],
      roadFeatureIds: [],
      distancesM: null,
      bearingCompatibilityDeg: null,
      notSignalPhaseNotBrakeNotIntent: true,
      evidenceProvenance: ['LDI08_S4_POSITION_PIN', 'LDI10D_OSM_FROZEN_SNAPSHOT'],
    };
  }

  const centroid = spatial.centroid ?? {
    latitude: gpsBuckets.reduce((s, g) => s + g.lat, 0) / gpsBuckets.length,
    longitude: gpsBuckets.reduce((s, g) => s + g.lon, 0) / gpsBuckets.length,
  };

  const wayHits = nearestWayCandidates(centroid.latitude, centroid.longitude, ways, uncertaintyRadiusM);
  const signalsInRange = signalNodes
    .map((n) => ({
      node: n,
      distanceM: haversineMeters(centroid.latitude, centroid.longitude, n.lat, n.lon),
    }))
    .filter((s) => s.distanceM <= SIGNAL_SEARCH_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM);

  let associationClass = 'UNKNOWN';
  let associationOutcome: 'ASSOCIATED' | 'UNKNOWN' = 'UNKNOWN';
  let confidence: 'INFERRED_MAP' | 'UNKNOWN' = 'UNKNOWN';
  const ambiguityReasons: string[] = [];
  const candidateRoadWayIds = wayHits.map((h) => h.way.osmId);
  const roadFeatureIds: number[] = [];

  const groupBearing = spatial.bearingStartDeg;

  if (wayHits.length === 0) {
    ambiguityReasons.push('NO_WAY_WITHIN_UNCERTAINTY_RADIUS');
  } else if (wayHits.length > 1 && wayHits[1].distanceM - wayHits[0].distanceM < 5) {
    ambiguityReasons.push('COMPETING_WAYS_WITHIN_5M');
  } else {
    const top = wayHits[0];
    if (groupBearing != null && top.segmentBearingDeg != null) {
      const delta = headingDelta(groupBearing, top.segmentBearingDeg);
      if (delta > BEARING_COMPAT_DEG) ambiguityReasons.push(`BEARING_MISMATCH_${delta.toFixed(0)}deg`);
    }
    if (ambiguityReasons.length === 0) {
      associationClass = 'NEAREST_WAY';
      associationOutcome = 'ASSOCIATED';
      confidence = 'INFERRED_MAP';
      roadFeatureIds.push(top.way.osmId);
    }
  }

  if (signalsInRange.length > 0) {
    roadFeatureIds.push(signalsInRange[0].node.osmId);
    if (signalsInRange.length > 1 && signalsInRange[1].distanceM - signalsInRange[0].distanceM < 8) {
      ambiguityReasons.push('COMPETING_SIGNALS_WITHIN_8M');
    } else if (associationClass === 'NEAREST_WAY') {
      associationClass = 'NEAREST_WAY_AND_SIGNAL_PROXIMATE';
    }
  }

  if (ambiguityReasons.length > 0) {
    associationOutcome = 'UNKNOWN';
    confidence = 'UNKNOWN';
    if (associationClass === 'NEAREST_WAY' && ambiguityReasons.some((r) => r.startsWith('COMPETING'))) {
      associationClass = 'UNKNOWN';
    }
  }

  return {
    groupId: group.groupId,
    kind: group.kind,
    windowUtc: group.windowUtc,
    candidateIds: group.candidateIds,
    plausibilityVerdictPreserved: group.plausibilityVerdict,
    stepCount: group.candidateIds.length,
    gpsBucketsUsed: gpsBuckets,
    gpsPresentCount: gpsBuckets.length,
    gpsAbsentInWindow: windowRows.length - gpsBuckets.length,
    centroid,
    pathLengthM: spatial.pathLengthM,
    bearingStartDeg: spatial.bearingStartDeg,
    bearingEndDeg: spatial.bearingEndDeg,
    associationOutcome,
    associationClass,
    confidence,
    uncertaintyRadiusM,
    candidateRoadWayIds,
    nearestWay: wayHits[0]
      ? {
          osmWayId: wayHits[0].way.osmId,
          highway: wayHits[0].way.highway,
          maxspeed: wayHits[0].way.maxspeed,
          oneway: wayHits[0].way.oneway,
          distanceM: wayHits[0].distanceM,
          segmentBearingDeg: wayHits[0].segmentBearingDeg,
        }
      : null,
    trafficSignalProximity: signalsInRange.slice(0, 3).map((s) => ({
      osmNodeId: s.node.osmId,
      kind: s.node.kind,
      distanceM: s.distanceM,
      tags: s.node.tags,
      notObservedSignalPhase: true,
    })),
    roadFeatureIds: [...new Set(roadFeatureIds)],
    distancesM: {
      nearestWayM: wayHits[0]?.distanceM ?? null,
      nearestSignalM: signalsInRange[0]?.distanceM ?? null,
    },
    bearingCompatibilityDeg:
      groupBearing != null && wayHits[0]?.segmentBearingDeg != null
        ? headingDelta(groupBearing, wayHits[0].segmentBearingDeg!)
        : null,
    ambiguityReasons,
    notSignalPhaseNotBrakeNotIntentNotViolation: true,
    evidenceProvenance: [
      'LDI08_COMBINED_SNAPSHOT.gps',
      'LDI10B_MANEUVER_PHYSICS.json',
      'LDI10D_OSM_FROZEN_SNAPSHOT.json',
    ],
    mapContextDoesNotValidateL3Speed: true,
  };
}

export function verifyPhase2Inputs(repoRoot: string): {
  ok: boolean;
  errors: string[];
  hashes: Record<string, string | null>;
  counts: { groups: number; candidates: number; gpsPresent: number; rowAbsent: number };
} {
  const errors: string[] = [];
  const base10 = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10');
  const base10c = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10c');
  const files = {
    ldi10b: path.join(base10, 'LDI10B_MANEUVER_PHYSICS.json'),
    ldi10cRoute: path.join(base10c, 'LDI10C_ROUTE.geojson'),
    ldi10cTimeline: path.join(base10c, 'LDI10C_MANEUVER_TIMELINE.json'),
    ldi10cPhase2: path.join(base10c, 'LDI10C_PHASE2_UNCLEAR_GROUPS.json'),
    ldi10cPhase3: path.join(base10c, 'LDI10C_PHASE3_ROOT_CAUSE.json'),
  };
  const hashes: Record<string, string | null> = {};
  for (const [k, p] of Object.entries(files)) {
    hashes[k] = fs.existsSync(p) ? sha256File(p) : null;
    if (!fs.existsSync(p)) errors.push(`missing ${k}`);
  }
  const p1 = verifyLdi10cProvenance(repoRoot);
  if (!p1.ok) errors.push(...p1.errors);
  const prov = verifyArtifactProvenance(repoRoot);
  hashes.ldi08Snapshot = prov.ldi08CombinedSnapshotSha256;

  const physics = JSON.parse(fs.readFileSync(files.ldi10b, 'utf8')) as {
    groups: unknown[];
    reproduction: { candidateCount: number; groupCount: number };
  };
  if (physics.reproduction.groupCount !== 32) errors.push('groupCount!=32');
  if (physics.reproduction.candidateCount !== 75) errors.push('candidateCount!=75');

  const { snapshot } = loadLdi08Artifacts(repoRoot);
  let gpsPresent = 0;
  let rowAbsent = 0;
  for (const r of snapshot.rows) {
    if (r.gps.availability !== 'PRESENT') rowAbsent += 1;
    else if (r.gps.latitude != null) gpsPresent += 1;
  }
  if (gpsPresent !== 346) errors.push(`gpsPresent=${gpsPresent} expected 346`);
  if (rowAbsent !== 16) errors.push(`rowAbsent=${rowAbsent} expected 16`);

  return {
    ok: errors.length === 0,
    errors,
    hashes,
    counts: { groups: 32, candidates: 75, gpsPresent, rowAbsent },
  };
}

export function runIntegrityChecks(associations: Array<{ associationOutcome: string }>): string[] {
  const failures: string[] = [];
  if (associations.length !== 32) failures.push(`associations=${associations.length} expected 32`);
  const unknown = associations.filter((a) => a.associationOutcome === 'UNKNOWN').length;
  const associated = associations.length - unknown;
  if (associated + unknown !== 32) failures.push('outcome count mismatch');
  return failures;
}
