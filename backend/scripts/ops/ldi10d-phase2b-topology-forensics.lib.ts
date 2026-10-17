/**
 * LDI-10D Phase 2B — road topology & intersection forensics (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import { sha256File } from './ldi10a-longitudinal-candidate-forensics.lib';
import { loadLdi08Artifacts, type Ldi08Row } from './ldi09-accel-decel-signal-forensics.lib';
import {
  bearingDeg,
  loadLdi10bGroups,
  matchManeuverTrajectory,
  rowsInInclusiveWindow,
  type Ldi10bGroup,
} from './ldi10c-spatial-trip-reconstruction.lib';
import {
  associateGroup,
  DEFAULT_UNCERTAINTY_RADIUS_M,
  parseOverpassElements,
  verifyPhase2Inputs,
} from './ldi10d-phase2-osm-road-context.lib';
import {
  EXPECTED_OSM_SNAPSHOT_SHA256,
  verifyPhase2aIntegrity,
} from './ldi10d-phase2a-unknown-root-cause.lib';

export const EXPECTED_LDI08_SHA256 =
  'effe180fe128a6c9f5c5f74f52f34ddc0c7d6f9960825d55573b02ca5b2f7009';

// Re-export for tests
export { EXPECTED_OSM_SNAPSHOT_SHA256 } from './ldi10d-phase2a-unknown-root-cause.lib';

export type RawOsmWay = {
  osmId: number;
  nodeIds: number[];
  tags: Record<string, string>;
  geometry: Array<{ lat: number; lon: number }>;
};

export type TopologySplitClass =
  | 'SAME_ROAD_SPLIT'
  | 'GENUINE_ALTERNATIVE_ROADS'
  | 'TOPOLOGY_INDETERMINATE';

export type JunctionClass = 'CONFIRMED_TOPOLOGY' | 'AMBIGUOUS' | 'NOT_ESTABLISHED';

export function parseFrozenTopologyElements(body: { elements?: Array<Record<string, unknown>> }): {
  ways: RawOsmWay[];
  nodeCoords: Map<number, { lat: number; lon: number }>;
  nodeTags: Map<number, Record<string, string>>;
  turnRestrictions: Array<{ osmId: number; tags: Record<string, string>; memberWayRefs: number[] }>;
  pedestrianCrossingNodeIds: Set<number>;
} {
  const ways: RawOsmWay[] = [];
  const nodeCoords = new Map<number, { lat: number; lon: number }>();
  const nodeTags = new Map<number, Record<string, string>>();
  const pedestrianCrossingNodeIds = new Set<number>();
  const turnRestrictions: Array<{ osmId: number; tags: Record<string, string>; memberWayRefs: number[] }> = [];

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
    } else if (type === 'relation') {
      const tags = (el.tags as Record<string, string>) ?? {};
      if (tags.type === 'restriction') {
        const members = (el.members as Array<{ type: string; ref: number }>) ?? [];
        turnRestrictions.push({
          osmId: id,
          tags,
          memberWayRefs: members.filter((m) => m.type === 'way').map((m) => m.ref),
        });
      }
    }
  }
  return { ways, nodeCoords, nodeTags, turnRestrictions, pedestrianCrossingNodeIds };
}

export function sharedNodeIds(a: RawOsmWay, b: RawOsmWay): number[] {
  const sb = new Set(b.nodeIds);
  return a.nodeIds.filter((n) => sb.has(n));
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
  nodeIncidentWays: Map<number, Array<{ wayId: number; highway: string | null; oneway: string | null; layer: string }>>;
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
      list.push({
        wayId: way.osmId,
        highway: hw,
        oneway: way.tags.oneway ?? null,
        layer,
      });
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
      graphEvidence += `; degree>=3`;
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
    const lat = coord?.lat ?? 0;
    const lon = coord?.lon ?? 0;

    junctionCandidates.push({
      nodeId,
      lat,
      lon,
      incidentWayCount: distinctWayIds.length,
      distinctHighways: highways,
      classification,
      excludedReason,
      graphEvidence,
    });
  }

  return { nodeIncidentWays, junctionCandidates };
}

function polylineMinDistanceM(a: RawOsmWay, b: RawOsmWay): number {
  let best = Infinity;
  for (const pa of a.geometry) {
    for (let i = 1; i < b.geometry.length; i++) {
      const d = haversineMeters(pa.lat, pa.lon, b.geometry[i - 1].lat, b.geometry[i - 1].lon);
      if (d < best) best = d;
    }
  }
  return best;
}

export function classifyCompetingWays(
  w1: RawOsmWay,
  w2: RawOsmWay,
  distanceGapM: number,
): {
  classification: TopologySplitClass;
  sharedNodes: number[];
  sameName: boolean;
  sameHighwayClass: boolean;
  minPolylineSeparationM: number;
  rationale: string[];
  wouldRemainUnknownUnderPhase2Gates: true;
} {
  const shared = sharedNodeIds(w1, w2);
  const name1 = w1.tags.name ?? w1.tags.ref ?? null;
  const name2 = w2.tags.name ?? w2.tags.ref ?? null;
  const sameName = name1 != null && name2 != null && name1 === name2;
  const sameHighwayClass = (w1.tags.highway ?? '') === (w2.tags.highway ?? '');
  const minSep = polylineMinDistanceM(w1, w2);
  const rationale: string[] = [];

  let classification: TopologySplitClass = 'TOPOLOGY_INDETERMINATE';

  if (shared.length >= 2) {
    classification = 'SAME_ROAD_SPLIT';
    rationale.push(`Shared ${shared.length} topology nodes — likely continuous/split OSM geometry.`);
  } else if (sameName && sameHighwayClass && distanceGapM < 5) {
    classification = 'SAME_ROAD_SPLIT';
    rationale.push('Matching name/ref and highway with sub-5m centroid gap — dual-way representation of one carriageway.');
  } else if (!sameHighwayClass && distanceGapM < 5) {
    classification = 'GENUINE_ALTERNATIVE_ROADS';
    rationale.push(`Different highway classes (${w1.tags.highway} vs ${w2.tags.highway}) within competition radius.`);
  } else if (shared.length === 1 && distanceGapM < 5) {
    classification = 'GENUINE_ALTERNATIVE_ROADS';
    rationale.push('Single shared endpoint node — branch choice at junction.');
  } else if (minSep < 8 && !sameName) {
    classification = 'GENUINE_ALTERNATIVE_ROADS';
    rationale.push('Parallel geometries without shared naming — parallel/service vs main hypothesis.');
  } else {
    rationale.push('Insufficient graph evidence to separate split mapping from true branch ambiguity.');
  }

  rationale.push('Phase 2 G2 gate (5m gap) still fires — association remains UNKNOWN without threshold change.');

  return {
    classification,
    sharedNodes: shared,
    sameName,
    sameHighwayClass,
    minPolylineSeparationM: minSep,
    rationale,
    wouldRemainUnknownUnderPhase2Gates: true,
  };
}

function headingDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

export type SpatialTemporalClass = 'SUPPORTED' | 'POSSIBLE' | 'UNKNOWN';

export function assessCurveTemporalContext(params: {
  group: Ldi10bGroup;
  rows: Ldi08Row[];
  physics: {
    speedStartKmh: number;
    speedEndKmh: number;
    meanObservedLongitudinalAccelMs2: number;
  } | null;
  nearestJunctionM: number | null;
}): {
  groupId: string;
  headingChangeDeg: number | null;
  maxStepHeadingChangeDeg: number | null;
  speedStartKmh: number | null;
  speedEndKmh: number | null;
  minSpeedKmhInWindow: number | null;
  stopAndGoPattern: SpatialTemporalClass;
  curveContext: SpatialTemporalClass;
  junctionApproach: SpatialTemporalClass;
  decelAccelContext: SpatialTemporalClass;
  notes: string[];
  notDriverIntentNotBrakePedal: true;
} {
  const spatial = matchManeuverTrajectory(params.group, params.rows);
  const windowRows = rowsInInclusiveWindow(params.rows, params.group.windowUtc.start, params.group.windowUtc.end);
  const gpsRows = windowRows.filter(
    (r) => r.gps.availability === 'PRESENT' && r.gps.latitude != null && r.gps.longitude != null,
  );

  let maxStep = 0;
  for (let i = 1; i < gpsRows.length; i++) {
    const b = bearingDeg(
      gpsRows[i - 1].gps.latitude!,
      gpsRows[i - 1].gps.longitude!,
      gpsRows[i].gps.latitude!,
      gpsRows[i].gps.longitude!,
    );
    const bPrev =
      i >= 2
        ? bearingDeg(
            gpsRows[i - 2].gps.latitude!,
            gpsRows[i - 2].gps.longitude!,
            gpsRows[i - 1].gps.latitude!,
            gpsRows[i - 1].gps.longitude!,
          )
        : b;
    maxStep = Math.max(maxStep, headingDelta(bPrev, b));
  }

  const headingChange =
    spatial.bearingStartDeg != null && spatial.bearingEndDeg != null
      ? headingDelta(spatial.bearingStartDeg, spatial.bearingEndDeg)
      : null;

  const speeds = windowRows.map((r) => r.l3.speedKmh).filter((s): s is number => s != null);
  const minSpeed = speeds.length ? Math.min(...speeds) : null;

  let curveContext: SpatialTemporalClass = 'UNKNOWN';
  if (headingChange != null) {
    if (headingChange >= 35 || maxStep >= 25) curveContext = 'SUPPORTED';
    else if (headingChange >= 15 || maxStep >= 12) curveContext = 'POSSIBLE';
  }

  let stopAndGo: SpatialTemporalClass = 'UNKNOWN';
  if (minSpeed != null && speeds.length >= 2) {
    const minIdx = speeds.indexOf(minSpeed);
    const before = minIdx > 0 ? speeds[minIdx - 1] : null;
    const after = minIdx < speeds.length - 1 ? speeds[minIdx + 1] : null;
    if (minSpeed < 8 && before != null && after != null && before > minSpeed + 3 && after > minSpeed + 3) {
      stopAndGo = 'SUPPORTED';
    } else if (minSpeed < 15 && params.group.kind === 'DECELERATION') {
      stopAndGo = 'POSSIBLE';
    }
  }

  let junctionApproach: SpatialTemporalClass = 'UNKNOWN';
  if (params.nearestJunctionM != null) {
    if (params.nearestJunctionM <= 25) junctionApproach = 'SUPPORTED';
    else if (params.nearestJunctionM <= 45) junctionApproach = 'POSSIBLE';
  }

  let decelAccel: SpatialTemporalClass = 'UNKNOWN';
  if (params.physics) {
    if (Math.abs(params.physics.meanObservedLongitudinalAccelMs2) >= 0.8) decelAccel = 'SUPPORTED';
    else decelAccel = 'POSSIBLE';
  }

  const notes: string[] = [
    'Kinematic labels describe observed L3 speed buckets only.',
    'No causal claim (signals, intent, pedal, regen).',
  ];

  return {
    groupId: params.group.groupId,
    headingChangeDeg: headingChange,
    maxStepHeadingChangeDeg: maxStep || null,
    speedStartKmh: params.physics?.speedStartKmh ?? null,
    speedEndKmh: params.physics?.speedEndKmh ?? null,
    minSpeedKmhInWindow: minSpeed,
    stopAndGoPattern: stopAndGo,
    curveContext,
    junctionApproach,
    decelAccelContext: decelAccel,
    notes,
    notDriverIntentNotBrakePedal: true,
  };
}

export function nearestJunctionDistanceM(
  lat: number,
  lon: number,
  junctions: Array<{ lat: number; lon: number; classification: JunctionClass }>,
): number | null {
  let best: number | null = null;
  for (const j of junctions) {
    if (j.classification !== 'CONFIRMED_TOPOLOGY') continue;
    const d = haversineMeters(lat, lon, j.lat, j.lon);
    if (best == null || d < best) best = d;
  }
  return best;
}

export function verifyPhase2bPreflight(repoRoot: string): {
  ok: boolean;
  errors: string[];
  inputIntegrity: 'PASS' | 'FAIL';
  baseline: {
    groups: number;
    candidates: number;
    gpsPresent: number;
    rowAbsent: number;
    associated: number;
    unknown: number;
    g2: number;
    g3: number;
    g1: number;
  };
} {
  const errors: string[] = [];
  const osmPath = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_OSM_FROZEN_SNAPSHOT.json',
  );
  const ldi08Path = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/ldi-08/LDI08_COMBINED_SNAPSHOT.json',
  );
  if (sha256File(osmPath) !== EXPECTED_OSM_SNAPSHOT_SHA256) errors.push('osm sha mismatch');
  if (sha256File(ldi08Path) !== EXPECTED_LDI08_SHA256) errors.push('ldi08 sha mismatch');

  const p2a = verifyPhase2aIntegrity(repoRoot);
  if (!p2a.ok) errors.push(...p2a.errors);

  const phase2 = verifyPhase2Inputs(repoRoot);
  if (!phase2.ok) errors.push(...phase2.errors);

  const assocPath = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_MANEUVER_ROAD_ASSOCIATION.json',
  );
  const assoc = JSON.parse(fs.readFileSync(assocPath, 'utf8')) as {
    associations: Array<{ associationOutcome: string; ambiguityReasons?: string[] }>;
  };
  const associated = assoc.associations.filter((a) => a.associationOutcome === 'ASSOCIATED').length;
  const unknown = assoc.associations.filter((a) => a.associationOutcome === 'UNKNOWN').length;
  let g2 = 0;
  let g3 = 0;
  let g1 = 0;
  for (const a of assoc.associations) {
    const r = a.ambiguityReasons ?? [];
    if (r.some((x) => x.startsWith('COMPETING_WAYS'))) g2 += 1;
    else if (r.some((x) => x.startsWith('BEARING_MISMATCH'))) g3 += 1;
    else if (r.includes('NO_WAY_WITHIN_UNCERTAINTY_RADIUS')) g1 += 1;
  }

  const baseline = {
    groups: 32,
    candidates: 75,
    gpsPresent: 346,
    rowAbsent: 16,
    associated,
    unknown,
    g2,
    g3,
    g1,
  };
  if (associated !== 14) errors.push(`associated=${associated}`);
  if (unknown !== 18) errors.push(`unknown=${unknown}`);
  if (g2 !== 11) errors.push(`g2=${g2}`);
  if (g3 !== 6) errors.push(`g3=${g3}`);
  if (g1 !== 1) errors.push(`g1=${g1}`);

  return { ok: errors.length === 0, errors, inputIntegrity: errors.length === 0 ? 'PASS' : 'FAIL', baseline };
}

export function runPhase2bTopologyAudit(repoRoot: string): {
  g2Audits: Array<Record<string, unknown>>;
  allUnknownReassessment: Array<Record<string, unknown>>;
  counts: {
    sameRoadSplit: number;
    genuineAlternative: number;
    topologyIndeterminate: number;
    drivableIntersectionsConfirmed: number;
    intersectionsAmbiguous: number;
    signalizedConfirmed: number;
    curveSupported: number;
    stopGoSupported: number;
  };
  junctionCandidates: ReturnType<typeof buildDrivableGraph>['junctionCandidates'];
  curveContexts: ReturnType<typeof assessCurveTemporalContext>[];
  controlComparison: Record<string, unknown>;
} {
  const base10d = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');
  const base10 = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10');
  const frozen = JSON.parse(
    fs.readFileSync(path.join(base10d, 'LDI10D_OSM_FROZEN_SNAPSHOT.json'), 'utf8'),
  ) as { overpassResponse: unknown };
  const assoc = JSON.parse(
    fs.readFileSync(path.join(base10d, 'LDI10D_MANEUVER_ROAD_ASSOCIATION.json'), 'utf8'),
  ) as { associations: Array<Record<string, unknown>> };
  const physicsDoc = JSON.parse(
    fs.readFileSync(path.join(base10, 'LDI10B_MANEUVER_PHYSICS.json'), 'utf8'),
  ) as { groups: Array<Record<string, unknown>> };

  const topo = parseFrozenTopologyElements(
    frozen.overpassResponse as { elements?: Array<Record<string, unknown>> },
  );
  const wayById = new Map(topo.ways.map((w) => [w.osmId, w]));
  const graph = buildDrivableGraph({
    ways: topo.ways,
    pedestrianCrossingNodeIds: topo.pedestrianCrossingNodeIds,
    nodeCoords: topo.nodeCoords,
  });

  const phase2a = JSON.parse(
    fs.readFileSync(path.join(base10d, 'LDI10D_PHASE2A_UNKNOWN_ROOT_CAUSES.json'), 'utf8'),
  ) as {
    groups: Array<{
      groupId: string;
      wayCandidatesWithinRadius: Array<{ osmWayId: number; distanceM: number; gapToNextM: number | null }>;
    }>;
  };
  const diagByGroup = new Map(phase2a.groups.map((g) => [g.groupId, g]));

  const parsed = parseOverpassElements(frozen.overpassResponse as { elements?: Array<Record<string, unknown>> });
  const signalNodes = parsed.nodes.filter((n) => n.kind === 'traffic_signals' || n.kind === 'crossing');
  const { snapshot } = loadLdi08Artifacts(repoRoot);
  const groups = loadLdi10bGroups(repoRoot);
  const physicsById = new Map(physicsDoc.groups.map((g) => [String(g.groupId), g]));

  const g2Audits: Array<Record<string, unknown>> = [];
  let sameRoadSplit = 0;
  let genuineAlternative = 0;
  let topologyIndeterminate = 0;

  for (const a of assoc.associations) {
    const reasons = (a.ambiguityReasons as string[]) ?? [];
    if (!reasons.some((r) => r.startsWith('COMPETING_WAYS'))) continue;

    const diag = diagByGroup.get(String(a.groupId));
    const topIds = diag?.wayCandidatesWithinRadius.slice(0, 2).map((c) => c.osmWayId) ?? [];
    const w1 = wayById.get(topIds[0] ?? 0);
    const w2 = wayById.get(topIds[1] ?? 0);
    if (!w1 || !w2) continue;
    const d0 = diag?.wayCandidatesWithinRadius[0]?.distanceM ?? 0;
    const d1 = diag?.wayCandidatesWithinRadius[1]?.distanceM ?? d0;
    const gapM = diag?.wayCandidatesWithinRadius[0]?.gapToNextM ?? d1 - d0;

    const classification = classifyCompetingWays(w1, w2, gapM);
    if (classification.classification === 'SAME_ROAD_SPLIT') sameRoadSplit += 1;
    else if (classification.classification === 'GENUINE_ALTERNATIVE_ROADS') genuineAlternative += 1;
    else topologyIndeterminate += 1;

    g2Audits.push({
      groupId: a.groupId,
      topWayIds: [w1.osmId, w2.osmId],
      topHighways: [w1.tags.highway, w2.tags.highway],
      names: [w1.tags.name ?? null, w2.tags.name ?? null],
      oneway: [w1.tags.oneway ?? null, w2.tags.oneway ?? null],
      distanceGapM: gapM,
      ...classification,
    });
  }

  const confirmedJunctions = graph.junctionCandidates.filter((j) => j.classification === 'CONFIRMED_TOPOLOGY');
  const ambiguousJunctions = graph.junctionCandidates.filter((j) => j.classification === 'AMBIGUOUS');

  const curveContexts: ReturnType<typeof assessCurveTemporalContext>[] = [];
  let curveSupported = 0;
  let stopGoSupported = 0;

  for (const g of groups) {
    const centroid = matchManeuverTrajectory(g, snapshot.rows).centroid;
    const jDist =
      centroid != null
        ? nearestJunctionDistanceM(centroid.latitude, centroid.longitude, graph.junctionCandidates)
        : null;
    const phys = physicsById.get(g.groupId);
    const ctx = assessCurveTemporalContext({
      group: g,
      rows: snapshot.rows,
      physics: phys
        ? {
            speedStartKmh: Number(phys.speedStartKmh),
            speedEndKmh: Number(phys.speedEndKmh),
            meanObservedLongitudinalAccelMs2: Number(phys.meanObservedLongitudinalAccelMs2),
          }
        : null,
      nearestJunctionM: jDist,
    });
    curveContexts.push(ctx);
    if (ctx.curveContext === 'SUPPORTED') curveSupported += 1;
    if (ctx.stopAndGoPattern === 'SUPPORTED') stopGoSupported += 1;
  }

  const allUnknownReassessment = assoc.associations
    .filter((a) => a.associationOutcome === 'UNKNOWN')
    .map((a) => {
      const recomputed = associateGroup({
        group: groups.find((g) => g.groupId === a.groupId)!,
        rows: snapshot.rows,
        ways: parsed.ways,
        signalNodes,
        uncertaintyRadiusM: DEFAULT_UNCERTAINTY_RADIUS_M,
      });
      const g2audit = g2Audits.find((x) => x.groupId === a.groupId);
      return {
        groupId: a.groupId,
        phase2Outcome: a.associationOutcome,
        replayOutcome: recomputed.associationOutcome,
        ambiguityReasons: a.ambiguityReasons,
        topologyInsight: g2audit?.classification ?? null,
        associationWouldChange: false,
        remainsUnknownUnderCurrentGates: true,
      };
    });

  const unclearAccel = groups.filter(
    (g) => g.kind === 'ACCELERATION' && g.plausibilityVerdict === 'UNCLEAR_QC_OR_GAPS',
  );
  const plausibleAccel = groups.filter(
    (g) => g.kind === 'ACCELERATION' && g.plausibilityVerdict === 'PLAUSIBLE',
  );

  const controlComparison = {
    unclearAccelerationGroups: unclearAccel.map((g) => g.groupId),
    plausibleAccelerationGroups: plausibleAccel.map((g) => g.groupId),
    pairs: unclearAccel.map((u) => {
      const assocU = assoc.associations.find((a) => a.groupId === u.groupId);
      const topoClass = g2Audits.find((x) => x.groupId === u.groupId)?.classification ?? null;
      return {
        unclearGroupId: u.groupId,
        unclearAssociation: assocU?.associationOutcome,
        unclearAmbiguity: assocU?.ambiguityReasons,
        topologyClass: topoClass,
        qcDoesNotExplainTopology: topoClass !== null,
      };
    }),
    falseAssociationRisks: [
      'Centroid snap near parallel residential/service ways (G2)',
      'GPS heading vs OSM segment bearing mismatch on curves (G3)',
      'Sparse 1Hz buckets at intersection approach',
      'Dual carriageway / split OSM ways counted as competitors',
    ],
    mapboxNotUsed: true,
  };

  return {
    g2Audits,
    allUnknownReassessment,
    counts: {
      sameRoadSplit,
      genuineAlternative,
      topologyIndeterminate,
      drivableIntersectionsConfirmed: confirmedJunctions.length,
      intersectionsAmbiguous: ambiguousJunctions.length,
      signalizedConfirmed: 0,
      curveSupported,
      stopGoSupported,
    },
    junctionCandidates: graph.junctionCandidates,
    curveContexts,
    controlComparison,
  };
}

/** Test helpers — synthetic topology cases */
export function classifyCompetingWaysSynthetic(
  w1: RawOsmWay,
  w2: RawOsmWay,
  gapM: number,
): TopologySplitClass {
  return classifyCompetingWays(w1, w2, gapM).classification;
}
