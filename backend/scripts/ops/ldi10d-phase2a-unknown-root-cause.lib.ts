/**
 * LDI-10D Phase 2A — UNKNOWN road-association root-cause audit (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sha256File } from './ldi10a-longitudinal-candidate-forensics.lib';
import { loadLdi08Artifacts } from './ldi09-accel-decel-signal-forensics.lib';
import { loadLdi10bGroups } from './ldi10c-spatial-trip-reconstruction.lib';
import {
  associateGroup,
  BEARING_COMPAT_DEG,
  DEFAULT_UNCERTAINTY_RADIUS_M,
  nearestWayCandidates,
  parseOverpassElements,
  verifyPhase2Inputs,
  type OsmNode,
  type OsmWay,
} from './ldi10d-phase2-osm-road-context.lib';

export const EXPECTED_OSM_SNAPSHOT_SHA256 =
  '8afff85539dad9d1590022656f291d50b01215d99cd4a9bcc4af2aef74c073d9';

export const ROOT_CAUSE_CLASSES = [
  'DISTANCE',
  'BEARING',
  'MULTIPLE_CANDIDATES',
  'TOPOLOGY',
  'MISSING_OSM_GEOMETRY',
  'INSUFFICIENT_GPS',
  'DATA_OR_SCHEMA_DEFECT',
  'INDETERMINATE',
] as const;

export type RootCauseClass = (typeof ROOT_CAUSE_CLASSES)[number];

export type RejectionGate =
  | 'G0_NO_GPS_IN_WINDOW'
  | 'G1_NO_WAY_WITHIN_RADIUS'
  | 'G2_COMPETING_WAYS_GAP_LT_5M'
  | 'G3_BEARING_DELTA_GT_45'
  | 'G4_COMPETING_SIGNALS_GAP_LT_8M'
  | 'G5_ASSOCIATION_PASSED';

export type GroupDiagnostics = {
  groupId: string;
  associationOutcome: 'ASSOCIATED' | 'UNKNOWN';
  phase2AmbiguityReasons: string[];
  rejectionGatesFired: RejectionGate[];
  rootCauses: RootCauseClass[];
  temporalCoverage: {
    windowStartUtc: string;
    windowEndUtc: string;
    windowBucketCount: number;
    gpsPresentCount: number;
    gpsAbsentInWindow: number;
    durationSec: number;
  };
  gpsUncertaintyM: number;
  centroid: { latitude: number; longitude: number } | null;
  pathLengthM: number | null;
  bearingStartDeg: number | null;
  bearingEndDeg: number | null;
  wayCandidatesWithinRadius: Array<{
    osmWayId: number;
    highway: string | null;
    distanceM: number;
    segmentBearingDeg: number | null;
    gapToNextM: number | null;
  }>;
  perBucketNearestWay: Array<{
    utc: string;
    lat: number;
    lon: number;
    nearestWayId: number | null;
    nearestDistanceM: number | null;
    distinctWaysWithinRadius: number;
  }>;
  counterfactual: {
    radiusM35: { wayCount: number; wouldPassG1: boolean; wouldStillCompeteAt5m: boolean };
    radiusM50: { wayCount: number; wouldPassG1: boolean };
    radiusM75: { wayCount: number; wouldPassG1: boolean };
    bearingCompat60Deg: { wouldPassG3: boolean; deltaDeg: number | null };
    competingGapThreshold3m: { wouldStillFireG2: boolean };
  };
  topologyNote: string | null;
  plausibilityVerdictPreserved: string;
};

function headingDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

export function evaluateRejectionGates(params: {
  gpsPresentCount: number;
  wayHits: ReturnType<typeof nearestWayCandidates>;
  groupBearing: number | null;
  signalsInRangeCount: number;
  signalGapM: number | null;
}): RejectionGate[] {
  const fired: RejectionGate[] = [];
  if (params.gpsPresentCount === 0) {
    fired.push('G0_NO_GPS_IN_WINDOW');
    return fired;
  }
  if (params.wayHits.length === 0) {
    fired.push('G1_NO_WAY_WITHIN_RADIUS');
    return fired;
  }
  if (params.wayHits.length > 1 && params.wayHits[1].distanceM - params.wayHits[0].distanceM < 5) {
    fired.push('G2_COMPETING_WAYS_GAP_LT_5M');
  } else if (
    params.groupBearing != null &&
    params.wayHits[0].segmentBearingDeg != null &&
    headingDelta(params.groupBearing, params.wayHits[0].segmentBearingDeg) > BEARING_COMPAT_DEG
  ) {
    fired.push('G3_BEARING_DELTA_GT_45');
  } else {
    fired.push('G5_ASSOCIATION_PASSED');
  }
  if (
    params.signalsInRangeCount > 1 &&
    params.signalGapM != null &&
    params.signalGapM < 8
  ) {
    fired.push('G4_COMPETING_SIGNALS_GAP_LT_8M');
  }
  return fired;
}

export function classifyRootCauses(
  gates: RejectionGate[],
  diagnostics: Pick<GroupDiagnostics, 'wayCandidatesWithinRadius' | 'counterfactual' | 'temporalCoverage'>,
): RootCauseClass[] {
  const causes = new Set<RootCauseClass>();
  for (const g of gates) {
    if (g === 'G0_NO_GPS_IN_WINDOW') causes.add('INSUFFICIENT_GPS');
    if (g === 'G1_NO_WAY_WITHIN_RADIUS') {
      if (!diagnostics.counterfactual.radiusM75.wouldPassG1) {
        causes.add('MISSING_OSM_GEOMETRY');
      } else {
        causes.add('DISTANCE');
      }
    }
    if (g === 'G2_COMPETING_WAYS_GAP_LT_5M') {
      causes.add('MULTIPLE_CANDIDATES');
      causes.add('TOPOLOGY');
    }
    if (g === 'G3_BEARING_DELTA_GT_45') causes.add('BEARING');
    if (g === 'G4_COMPETING_SIGNALS_GAP_LT_8M') causes.add('MULTIPLE_CANDIDATES');
  }
  if (causes.size === 0) causes.add('INDETERMINATE');
  return [...causes];
}

function topologyNoteFromHits(wayHits: ReturnType<typeof nearestWayCandidates>): string | null {
  if (wayHits.length < 2) return null;
  const a = wayHits[0].way;
  const b = wayHits[1].way;
  const gap = wayHits[1].distanceM - wayHits[0].distanceM;
  if (gap >= 5) return null;
  const hwA = a.highway ?? 'unknown';
  const hwB = b.highway ?? 'unknown';
  if (hwA !== hwB) {
    return `Parallel/stacked ways within ${gap.toFixed(1)}m: ${hwA} (id ${a.osmId}) vs ${hwB} (id ${b.osmId})`;
  }
  return `Two ${hwA} ways within ${gap.toFixed(1)}m (ids ${a.osmId}, ${b.osmId}) — centroid snap ambiguous`;
}

export function buildGroupDiagnostics(params: {
  stored: Record<string, unknown>;
  ways: OsmWay[];
  uncertaintyRadiusM: number;
}): GroupDiagnostics {
  const stored = params.stored;
  const centroid = stored.centroid as { latitude: number; longitude: number } | null;
  const bearingStartDeg = stored.bearingStartDeg as number | null;
  const gpsBuckets = (stored.gpsBucketsUsed as Array<{ utc: string; lat: number; lon: number }>) ?? [];

  const wayHits = centroid
    ? nearestWayCandidates(centroid.latitude, centroid.longitude, params.ways, params.uncertaintyRadiusM)
    : [];

  const wayCandidatesWithinRadius = wayHits.slice(0, 8).map((h, i) => ({
    osmWayId: h.way.osmId,
    highway: h.way.highway,
    distanceM: h.distanceM,
    segmentBearingDeg: h.segmentBearingDeg,
    gapToNextM: wayHits[i + 1] ? wayHits[i + 1].distanceM - h.distanceM : null,
  }));

  const perBucketNearestWay = gpsBuckets.map((b) => {
    const hits = nearestWayCandidates(b.lat, b.lon, params.ways, params.uncertaintyRadiusM);
    return {
      utc: b.utc,
      lat: b.lat,
      lon: b.lon,
      nearestWayId: hits[0]?.way.osmId ?? null,
      nearestDistanceM: hits[0]?.distanceM ?? null,
      distinctWaysWithinRadius: hits.length,
    };
  });

  const windowStart = String((stored.windowUtc as { start: string }).start);
  const windowEnd = String((stored.windowUtc as { end: string }).end);
  const durationSec = (Date.parse(windowEnd) - Date.parse(windowStart)) / 1000;

  const cf35 = centroid
    ? nearestWayCandidates(centroid.latitude, centroid.longitude, params.ways, 35)
    : [];
  const cf50 = centroid
    ? nearestWayCandidates(centroid.latitude, centroid.longitude, params.ways, 50)
    : [];
  const cf75 = centroid
    ? nearestWayCandidates(centroid.latitude, centroid.longitude, params.ways, 75)
    : [];

  const deltaDeg =
    bearingStartDeg != null && wayHits[0]?.segmentBearingDeg != null
      ? headingDelta(bearingStartDeg, wayHits[0].segmentBearingDeg)
      : null;

  const counterfactual = {
    radiusM35: {
      wayCount: cf35.length,
      wouldPassG1: cf35.length > 0,
      wouldStillCompeteAt5m:
        cf35.length > 1 && cf35[1].distanceM - cf35[0].distanceM < 5,
    },
    radiusM50: { wayCount: cf50.length, wouldPassG1: cf50.length > 0 },
    radiusM75: { wayCount: cf75.length, wouldPassG1: cf75.length > 0 },
    bearingCompat60Deg: {
      wouldPassG3: deltaDeg != null && deltaDeg <= 60,
      deltaDeg,
    },
    competingGapThreshold3m: {
      wouldStillFireG2:
        wayHits.length > 1 && wayHits[1].distanceM - wayHits[0].distanceM < 3,
    },
  };

  const signals = (stored.trafficSignalProximity as unknown[]) ?? [];
  const gates = evaluateRejectionGates({
    gpsPresentCount: Number(stored.gpsPresentCount ?? gpsBuckets.length),
    wayHits,
    groupBearing: bearingStartDeg,
    signalsInRangeCount: signals.length,
    signalGapM:
      signals.length > 1
        ? Number((signals[1] as { distanceM: number }).distanceM) -
          Number((signals[0] as { distanceM: number }).distanceM)
        : null,
  });

  const temporalCoverage = {
    windowStartUtc: windowStart,
    windowEndUtc: windowEnd,
    windowBucketCount: Number(stored.gpsPresentCount ?? 0) + Number(stored.gpsAbsentInWindow ?? 0),
    gpsPresentCount: Number(stored.gpsPresentCount ?? gpsBuckets.length),
    gpsAbsentInWindow: Number(stored.gpsAbsentInWindow ?? 0),
    durationSec,
  };

  const associationOutcome = stored.associationOutcome as 'ASSOCIATED' | 'UNKNOWN';
  const rootCauses =
    associationOutcome === 'ASSOCIATED' && gates.includes('G5_ASSOCIATION_PASSED')
      ? ([] as RootCauseClass[])
      : classifyRootCauses(gates, {
          wayCandidatesWithinRadius,
          counterfactual,
          temporalCoverage,
        });

  return {
    groupId: String(stored.groupId),
    associationOutcome,
    phase2AmbiguityReasons: (stored.ambiguityReasons as string[]) ?? [],
    rejectionGatesFired: gates,
    rootCauses,
    temporalCoverage,
    gpsUncertaintyM: Number(stored.uncertaintyRadiusM ?? params.uncertaintyRadiusM),
    centroid,
    pathLengthM: stored.pathLengthM as number | null,
    bearingStartDeg,
    bearingEndDeg: stored.bearingEndDeg as number | null,
    wayCandidatesWithinRadius,
    perBucketNearestWay,
    counterfactual,
    topologyNote: topologyNoteFromHits(wayHits),
    plausibilityVerdictPreserved: String(stored.plausibilityVerdictPreserved ?? ''),
  };
}

export type OsmSignalCoverageAudit = {
  queryIncludedTrafficSignals: boolean;
  bbox: Record<string, unknown>;
  rawElementCounts: {
    nodes: number;
    ways: number;
    relations: number;
    nodesWithHighwayTag: number;
    nodesHighwayTrafficSignals: number;
    nodesHighwayCrossing: number;
    nodesWithJunctionTag: number;
    nodesHighwayOther: string[];
  };
  conclusion: 'NO_MAPPED_SIGNALS_IN_BBOX' | 'EXTRACTION_FILTER_MISMATCH' | 'INDETERMINATE';
  rationale: string[];
};

export function auditOsmSignalCoverage(frozenPath: string): OsmSignalCoverageAudit {
  const frozen = JSON.parse(fs.readFileSync(frozenPath, 'utf8')) as {
    provenance: { queryText?: string; boundingBox?: Record<string, unknown> };
    overpassResponse: { elements?: Array<Record<string, unknown>> };
  };
  const elements = frozen.overpassResponse.elements ?? [];
  let nodesHighwayTrafficSignals = 0;
  let nodesHighwayCrossing = 0;
  let nodesWithJunctionTag = 0;
  let nodesWithHighwayTag = 0;
  const nodesHighwayOther: string[] = [];
  let ways = 0;
  let relations = 0;
  let nodes = 0;

  for (const el of elements) {
    const type = String(el.type ?? '');
    const tags = (el.tags as Record<string, string>) ?? {};
    if (type === 'node') {
      nodes += 1;
      if (tags.highway) {
        nodesWithHighwayTag += 1;
        if (tags.highway === 'traffic_signals') nodesHighwayTrafficSignals += 1;
        else if (tags.highway === 'crossing') nodesHighwayCrossing += 1;
        else if (!nodesHighwayOther.includes(tags.highway)) nodesHighwayOther.push(tags.highway);
      }
      if (tags.junction) nodesWithJunctionTag += 1;
    } else if (type === 'way') ways += 1;
    else if (type === 'relation') relations += 1;
  }

  const rationale: string[] = [];
  const query = frozen.provenance.queryText ?? '';
  const queryIncludedTrafficSignals = query.includes('highway"="traffic_signals"');
  if (!queryIncludedTrafficSignals) rationale.push('Query text missing traffic_signals filter — extraction defect.');
  if (nodesHighwayTrafficSignals === 0) {
    rationale.push(
      'Zero nodes with highway=traffic_signals in frozen Overpass response elements (complete extract for query).',
    );
  }
  rationale.push(
    'Crossing nodes (highway=crossing) are pedestrian/cycle crossing points — not signalized intersections.',
  );

  let conclusion: OsmSignalCoverageAudit['conclusion'] = 'INDETERMINATE';
  if (queryIncludedTrafficSignals && nodesHighwayTrafficSignals === 0) {
    conclusion = 'NO_MAPPED_SIGNALS_IN_BBOX';
  } else if (!queryIncludedTrafficSignals) {
    conclusion = 'EXTRACTION_FILTER_MISMATCH';
  }

  return {
    queryIncludedTrafficSignals,
    bbox: frozen.provenance.boundingBox ?? {},
    rawElementCounts: {
      nodes,
      ways,
      relations,
      nodesWithHighwayTag,
      nodesHighwayTrafficSignals,
      nodesHighwayCrossing,
      nodesWithJunctionTag,
      nodesHighwayOther,
    },
    conclusion,
    rationale,
  };
}

export type CrossingSemanticsRow = {
  osmNodeId: number;
  lat: number;
  lon: number;
  highwayTag: string | null;
  crossingTag: string | null;
  crossingRef: string | null;
  tactilePaving: string | null;
  segregated: string | null;
  semanticClass: 'PEDESTRIAN_CROSSING' | 'JUNCTION_NODE' | 'OTHER_HIGHWAY_NODE';
  isRoadIntersection: boolean;
  notes: string;
};

export function auditCrossingSemantics(nodes: OsmNode[]): CrossingSemanticsRow[] {
  return nodes
    .filter((n) => n.kind === 'crossing' || n.kind === 'junction' || n.tags.highway === 'crossing')
    .map((n) => {
      const crossing = n.tags.crossing ?? null;
      const semanticClass: CrossingSemanticsRow['semanticClass'] =
        n.kind === 'junction' || n.tags.junction
          ? 'JUNCTION_NODE'
          : n.kind === 'crossing' || n.tags.highway === 'crossing'
            ? 'PEDESTRIAN_CROSSING'
            : 'OTHER_HIGHWAY_NODE';
      return {
        osmNodeId: n.osmId,
        lat: n.lat,
        lon: n.lon,
        highwayTag: n.tags.highway ?? null,
        crossingTag: crossing,
        crossingRef: n.tags['crossing:ref'] ?? null,
        tactilePaving: n.tags.tactile_paving ?? null,
        segregated: n.tags.segregated ?? null,
        semanticClass,
        isRoadIntersection: false,
        notes:
          semanticClass === 'PEDESTRIAN_CROSSING'
            ? 'Tagged crossing — describes pedestrian/cycle crossing geometry, not a drivable intersection node.'
            : 'Junction-tagged node — topology hint only; not equivalent to signalized intersection.',
      };
    });
}

export function verifyPhase2aIntegrity(repoRoot: string): {
  ok: boolean;
  errors: string[];
  osmSnapshotSha256: string | null;
  associationSha256: string | null;
  inputIntegrity: 'PASS' | 'FAIL';
} {
  const errors: string[] = [];
  const phase2 = verifyPhase2Inputs(repoRoot);
  if (!phase2.ok) errors.push(...phase2.errors);

  const base = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');
  const frozenPath = path.join(base, 'LDI10D_OSM_FROZEN_SNAPSHOT.json');
  const assocPath = path.join(base, 'LDI10D_MANEUVER_ROAD_ASSOCIATION.json');
  if (!fs.existsSync(frozenPath)) errors.push('missing frozen OSM');
  if (!fs.existsSync(assocPath)) errors.push('missing association JSON');

  const osmSha = fs.existsSync(frozenPath) ? sha256File(frozenPath) : null;
  if (osmSha !== EXPECTED_OSM_SNAPSHOT_SHA256) {
    errors.push(`osm sha mismatch: ${osmSha}`);
  }
  const associationSha256 = fs.existsSync(assocPath) ? sha256File(assocPath) : null;

  if (!fs.existsSync(assocPath)) {
    return {
      ok: false,
      errors,
      osmSnapshotSha256: osmSha,
      associationSha256: null,
      inputIntegrity: 'FAIL',
    };
  }

  const assoc = JSON.parse(fs.readFileSync(assocPath, 'utf8')) as {
    associations: Array<Record<string, unknown>>;
    osmSnapshotSha256: string;
  };
  if (assoc.osmSnapshotSha256 !== EXPECTED_OSM_SNAPSHOT_SHA256) {
    errors.push('association osmSnapshotSha256 mismatch');
  }

  const frozen = JSON.parse(fs.readFileSync(frozenPath, 'utf8')) as { overpassResponse: unknown };
  const parsed = parseOverpassElements(frozen.overpassResponse as { elements?: Array<Record<string, unknown>> });
  const signalNodes = parsed.nodes.filter((n) => n.kind === 'traffic_signals' || n.kind === 'crossing');
  const { snapshot } = loadLdi08Artifacts(repoRoot);
  const groups = loadLdi10bGroups(repoRoot);

  for (const g of groups) {
    const recomputed = associateGroup({
      group: g,
      rows: snapshot.rows,
      ways: parsed.ways,
      signalNodes,
      uncertaintyRadiusM: DEFAULT_UNCERTAINTY_RADIUS_M,
    });
    const stored = assoc.associations.find((a) => a.groupId === g.groupId);
    if (!stored) {
      errors.push(`missing stored association ${g.groupId}`);
      continue;
    }
    if (stored.associationOutcome !== recomputed.associationOutcome) {
      errors.push(`outcome drift ${g.groupId}`);
    }
    const sReasons = JSON.stringify(stored.ambiguityReasons ?? []);
    const rReasons = JSON.stringify(recomputed.ambiguityReasons ?? []);
    if (sReasons !== rReasons) errors.push(`ambiguity drift ${g.groupId}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    osmSnapshotSha256: osmSha,
    associationSha256,
    inputIntegrity: errors.length === 0 ? 'PASS' : 'FAIL',
  };
}

export function rootCauseDistribution(groups: GroupDiagnostics[]): Record<RootCauseClass, number> {
  const dist: Record<string, number> = {};
  for (const c of ROOT_CAUSE_CLASSES) dist[c] = 0;
  for (const g of groups) {
    for (const c of g.rootCauses) dist[c] = (dist[c] ?? 0) + 1;
  }
  return dist as Record<RootCauseClass, number>;
}
