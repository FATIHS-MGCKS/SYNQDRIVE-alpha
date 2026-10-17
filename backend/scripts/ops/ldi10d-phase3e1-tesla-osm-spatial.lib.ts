/**
 * LDI-10D Phase 3E.1 — Tesla-specific OSM spatial context recovery (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sha256File } from './ldi10a-longitudinal-candidate-forensics.lib';
import { POSITION_PAYLOAD_SHA256 } from './ldi10d-phase3c1-tesla-gps-comparative-replay.lib';
import { FIXTURE_REL, loadCommittedFixture, type FixtureBucket } from './ldi10d-phase3c2-tesla-gps-fixture.lib';
import { bearingDeg } from './ldi10c-spatial-trip-reconstruction.lib';
import {
  BEARING_COMPAT_DEG,
  buildOverpassQuery,
  computeCorridorBbox,
  DEFAULT_UNCERTAINTY_RADIUS_M,
  fetchOverpassSnapshot,
  nearestWayCandidates,
  parseOverpassElements,
  sha256Buffer,
  SIGNAL_SEARCH_RADIUS_M,
  type OsmNode,
  type OsmWay,
} from './ldi10d-phase2-osm-road-context.lib';
import {
  buildDrivableGraph,
  parseFrozenTopologyElements,
} from './ldi10d-phase2b-topology-forensics.lib';
import { EXPECTED_OSM_SNAPSHOT_SHA256 } from './ldi10d-phase2a-unknown-root-cause.lib';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import {
  buildEventGraph,
  TESLA_TRIP_ID,
  type ContextualDrivingEvent,
  type EvidenceClassification,
} from './ldi10d-phase3e-contextual-events.lib';
import { runPhase3dAnalysis, verifyPhase3dPreflight } from './ldi10d-phase3d-gps-evidence-quality.lib';

export const EVIDENCE_DIR_REL = 'architecture/drivingintelligence/evidence/ldi-10d';
export const TESLA_OSM_SNAPSHOT_FILENAME = 'LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json';
export const LDI08_OSM_FILENAME = 'LDI10D_OSM_FROZEN_SNAPSHOT.json';
export const PHASE3E_EVENTS_FILENAME = 'LDI10D_PHASE3E_CONTEXTUAL_EVENTS.json';
export const PHASE3E_EXPECTED_EVENT_COUNT = 66;

/** Corridor margin: same forensic default as LDI-10D Phase 2 (75 m beyond observed GPS extrema). */
export const TESLA_CORRIDOR_MARGIN_M = 75;

export type RoadAssociationOutcome = 'CONFIRMED' | 'AMBIGUOUS' | 'UNKNOWN';

export type TeslaBucketAssociation = {
  bucketLabelUtc: string;
  lat: number | null;
  lon: number | null;
  gpsStatus: 'PRESENT' | 'ROW_ABSENT' | 'OTHER';
  headingDeg: number | null;
  outcome: RoadAssociationOutcome;
  osmWayId: number | null;
  candidateWayIds: number[];
  ambiguityReasons: string[];
  nearestConfirmedJunctionM: number | null;
  confirmedJunctionNodeId: number | null;
  trafficSignalNodeId: number | null;
  trafficSignalDistanceM: number | null;
  temporalContinuityWayId: number | null;
  provenance: string[];
};

function headingDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function labelMs(label: string): number {
  return Date.parse(label);
}

export function deriveTeslaCorridorFromFixture(buckets: FixtureBucket[]): {
  bbox: ReturnType<typeof computeCorridorBbox>;
  validPointCount: number;
  excludedInvalidCount: number;
} {
  const valid: Array<{ latitude: number; longitude: number }> = [];
  let excluded = 0;
  for (const b of buckets) {
    if (b.availability !== 'PRESENT') continue;
    const lat = b.latitude;
    const lon = b.longitude;
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      excluded += 1;
      continue;
    }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      excluded += 1;
      continue;
    }
    valid.push({ latitude: lat, longitude: lon });
  }
  const bbox = computeCorridorBbox(valid, TESLA_CORRIDOR_MARGIN_M);
  return { bbox, validPointCount: valid.length, excludedInvalidCount: excluded };
}

export type TeslaOsmFrozenDoc = {
  schema: string;
  headSha: string;
  tripId: string;
  dimoTokenId: number;
  productionMutations: string;
  provenance: Record<string, unknown>;
  overpassResponse: unknown;
};

export async function acquireOrLoadTeslaOsmSnapshot(
  repoRoot: string,
  opts: { headSha: string; allowLiveFetch: boolean },
): Promise<{
  doc: TeslaOsmFrozenDoc;
  snapshotSha256: string;
  acquisitionMode: 'reuse_frozen' | 'live_overpass_post';
  querySha256: string;
}> {
  const outDir = path.join(repoRoot, EVIDENCE_DIR_REL);
  const snapshotPath = path.join(outDir, TESLA_OSM_SNAPSHOT_FILENAME);
  const fixture = loadCommittedFixture(repoRoot);
  const { bbox } = deriveTeslaCorridorFromFixture(fixture.buckets);
  const query = buildOverpassQuery(bbox);
  const querySha256 = sha256Buffer(query);

  if (fs.existsSync(snapshotPath) && process.env.LDI10D_FORCE_TESLA_OSM_REFETCH !== '1') {
    const doc = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as TeslaOsmFrozenDoc;
    return {
      doc,
      snapshotSha256: sha256File(snapshotPath),
      acquisitionMode: 'reuse_frozen',
      querySha256: String(doc.provenance.querySha256 ?? querySha256),
    };
  }

  if (!opts.allowLiveFetch) {
    throw new Error(`Missing ${TESLA_OSM_SNAPSHOT_FILENAME} and live fetch disabled`);
  }

  const fetched = await fetchOverpassSnapshot(query);
  if (!fetched.ok) {
    throw new Error(`Overpass fetch failed: ${fetched.error}`);
  }

  const doc: TeslaOsmFrozenDoc = {
    schema: 'LDI10D_TESLA_OSM_FROZEN_SNAPSHOT_V1',
    headSha: opts.headSha,
    tripId: TESLA_TRIP_ID,
    dimoTokenId: fixture.dimoTokenId,
    productionMutations: 'NONE',
    provenance: {
      source: 'OpenStreetMap contributors',
      license: 'ODbL-1.0',
      attribution: '© OpenStreetMap contributors — https://www.openstreetmap.org/copyright',
      endpoint: 'https://overpass-api.de/api/interpreter',
      fetchedAtUtc: fetched.fetchedAtUtc,
      querySha256,
      queryText: query,
      boundingBox: bbox,
      corridorMarginM: TESLA_CORRIDOR_MARGIN_M,
      corridorDerivation:
        'Min/max lat/lon of PRESENT finite Tesla fixture coordinates plus 75 m geodesic margin (LDI-10D Phase 2 parity).',
      inputFixture: FIXTURE_REL,
      positionPayloadSha256: fixture.positionPayloadSha256,
      mode: 'live_overpass_post',
      httpStatus: fetched.httpStatus,
      rawResponseSha256: sha256Buffer(fetched.rawText),
      odbComplianceNote:
        'Frozen extract for forensic evidence only; separate from LDI-08 pin snapshot; ODbL share-alike applies to derivatives.',
    },
    overpassResponse: fetched.body,
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(doc, null, 2));
  return {
    doc,
    snapshotSha256: sha256File(snapshotPath),
    acquisitionMode: 'live_overpass_post',
    querySha256,
  };
}

export function buildTeslaTopologyContext(doc: TeslaOsmFrozenDoc): {
  ways: OsmWay[];
  signalNodes: OsmNode[];
  confirmedJunctions: Array<{ nodeId: number; lat: number; lon: number }>;
  ambiguousJunctionCount: number;
  trafficSignalsMapped: number;
} {
  const parsed = parseOverpassElements(
    doc.overpassResponse as { elements?: Array<Record<string, unknown>> },
  );
  const topo = parseFrozenTopologyElements(
    doc.overpassResponse as { elements?: Array<Record<string, unknown>> },
  );
  const graph = buildDrivableGraph({
    ways: topo.ways,
    pedestrianCrossingNodeIds: topo.pedestrianCrossingNodeIds,
    nodeCoords: topo.nodeCoords,
  });
  const confirmedJunctions = graph.junctionCandidates
    .filter((j) => j.classification === 'CONFIRMED_TOPOLOGY')
    .map((j) => ({ nodeId: j.nodeId, lat: j.lat, lon: j.lon }));
  const ambiguousJunctionCount = graph.junctionCandidates.filter(
    (j) => j.classification === 'AMBIGUOUS',
  ).length;
  const signalNodes = parsed.nodes.filter((n) => n.kind === 'traffic_signals');
  return {
    ways: parsed.ways,
    signalNodes,
    confirmedJunctions,
    ambiguousJunctionCount,
    trafficSignalsMapped: signalNodes.length,
  };
}

function associateOneBucket(params: {
  lat: number;
  lon: number;
  headingDeg: number | null;
  prevConfirmedWayId: number | null;
  ways: OsmWay[];
  signalNodes: OsmNode[];
  confirmedJunctions: Array<{ nodeId: number; lat: number; lon: number }>;
}): TeslaBucketAssociation {
  const {
    lat,
    lon,
    headingDeg,
    prevConfirmedWayId,
    ways,
    signalNodes,
    confirmedJunctions,
  } = params;
  const ambiguityReasons: string[] = [];
  const hits = nearestWayCandidates(lat, lon, ways, DEFAULT_UNCERTAINTY_RADIUS_M);

  let outcome: RoadAssociationOutcome = 'UNKNOWN';
  let osmWayId: number | null = null;
  let temporalContinuityWayId: number | null = null;

  if (hits.length === 0) {
    ambiguityReasons.push('NO_WAY_WITHIN_UNCERTAINTY_RADIUS');
  } else if (hits.length > 1 && hits[1].distanceM - hits[0].distanceM < 5) {
    ambiguityReasons.push('COMPETING_WAYS_WITHIN_5M');
    outcome = 'AMBIGUOUS';
  } else {
    const top = hits[0];
    let bearingOk = true;
    if (headingDeg != null && top.segmentBearingDeg != null) {
      const delta = headingDelta(headingDeg, top.segmentBearingDeg);
      if (delta > BEARING_COMPAT_DEG) {
        ambiguityReasons.push(`BEARING_MISMATCH_${delta.toFixed(0)}deg`);
        bearingOk = false;
      }
    }
    if (prevConfirmedWayId != null) {
      const prevStill = hits.find((h) => h.way.osmId === prevConfirmedWayId);
      if (prevStill && bearingOk) {
        temporalContinuityWayId = prevConfirmedWayId;
        outcome = 'CONFIRMED';
        osmWayId = prevConfirmedWayId;
      }
    }
    if (outcome === 'UNKNOWN' && bearingOk && ambiguityReasons.length === 0) {
      outcome = 'CONFIRMED';
      osmWayId = top.way.osmId;
    } else if (outcome === 'UNKNOWN' && ambiguityReasons.length > 0) {
      outcome = bearingOk ? 'AMBIGUOUS' : 'AMBIGUOUS';
    }
  }

  let nearestConfirmedJunctionM: number | null = null;
  let confirmedJunctionNodeId: number | null = null;
  for (const j of confirmedJunctions) {
    const d = haversineMeters(lat, lon, j.lat, j.lon);
    if (nearestConfirmedJunctionM == null || d < nearestConfirmedJunctionM) {
      nearestConfirmedJunctionM = d;
      confirmedJunctionNodeId = j.nodeId;
    }
  }

  const signals = signalNodes
    .map((n) => ({ n, d: haversineMeters(lat, lon, n.lat, n.lon) }))
    .filter((s) => s.d <= SIGNAL_SEARCH_RADIUS_M)
    .sort((a, b) => a.d - b.d);
  const trafficSignalNodeId = signals[0]?.n.osmId ?? null;
  const trafficSignalDistanceM = signals[0]?.d ?? null;
  if (signals.length > 1 && signals[1].d - signals[0].d < 8) {
    ambiguityReasons.push('COMPETING_SIGNALS_WITHIN_8M');
  }

  return {
    bucketLabelUtc: '',
    lat,
    lon,
    gpsStatus: 'PRESENT',
    headingDeg,
    outcome,
    osmWayId,
    candidateWayIds: hits.map((h) => h.way.osmId),
    ambiguityReasons,
    nearestConfirmedJunctionM,
    confirmedJunctionNodeId:
      nearestConfirmedJunctionM != null && nearestConfirmedJunctionM <= 45
        ? confirmedJunctionNodeId
        : null,
    trafficSignalNodeId,
    trafficSignalDistanceM,
    temporalContinuityWayId,
    provenance: ['LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json', 'phase3e1_bucket_association_v1'],
  };
}

export function buildTeslaBucketAssociations(
  buckets: FixtureBucket[],
  topology: ReturnType<typeof buildTeslaTopologyContext>,
): TeslaBucketAssociation[] {
  const headings: (number | null)[] = new Array(buckets.length).fill(null);
  for (let i = 1; i < buckets.length; i++) {
    const prev = buckets[i - 1];
    const cur = buckets[i];
    if (
      prev.availability === 'PRESENT' &&
      cur.availability === 'PRESENT' &&
      prev.latitude != null &&
      cur.latitude != null
    ) {
      headings[i] = bearingDeg(prev.latitude!, prev.longitude!, cur.latitude!, cur.longitude!);
    }
  }

  const out: TeslaBucketAssociation[] = [];
  let prevConfirmedWay: number | null = null;

  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (b.availability !== 'PRESENT' || b.latitude == null || b.longitude == null) {
      out.push({
        bucketLabelUtc: b.bucketLabelUtc,
        lat: b.latitude,
        lon: b.longitude,
        gpsStatus: b.availability === 'ROW_ABSENT' ? 'ROW_ABSENT' : 'OTHER',
        headingDeg: null,
        outcome: 'UNKNOWN',
        osmWayId: null,
        candidateWayIds: [],
        ambiguityReasons: [b.availability === 'ROW_ABSENT' ? 'ROW_ABSENT' : 'NO_FINITE_COORDINATES'],
        nearestConfirmedJunctionM: null,
        confirmedJunctionNodeId: null,
        trafficSignalNodeId: null,
        trafficSignalDistanceM: null,
        temporalContinuityWayId: null,
        provenance: ['TESLA_POSITION_GRID.json'],
      });
      continue;
    }
    const assoc = associateOneBucket({
      lat: b.latitude!,
      lon: b.longitude!,
      headingDeg: headings[i],
      prevConfirmedWayId: prevConfirmedWay,
      ways: topology.ways,
      signalNodes: topology.signalNodes,
      confirmedJunctions: topology.confirmedJunctions,
    });
    assoc.bucketLabelUtc = b.bucketLabelUtc;
    if (assoc.outcome === 'CONFIRMED' && assoc.osmWayId != null) {
      prevConfirmedWay = assoc.osmWayId;
    }
    out.push(assoc);
  }
  return out;
}

function bucketsInEventWindow(
  buckets: FixtureBucket[],
  startUtc: string,
  endUtc: string,
): FixtureBucket[] {
  const t0 = labelMs(startUtc);
  const t1 = labelMs(endUtc);
  return buckets.filter((b) => {
    const t = labelMs(b.bucketLabelUtc);
    return t >= t0 && t <= t1;
  });
}

function aggregateEventSpatial(
  windowBuckets: FixtureBucket[],
  assocByLabel: Map<string, TeslaBucketAssociation>,
  teslaOsmSha: string,
): {
  spatial: ContextualDrivingEvent['spatialContext'];
  dominantOutcome: RoadAssociationOutcome;
  confirmedBucketFraction: number;
} {
  const assocs = windowBuckets
    .map((b) => assocByLabel.get(b.bucketLabelUtc))
    .filter((a): a is TeslaBucketAssociation => a != null && a.gpsStatus === 'PRESENT');
  const confirmed = assocs.filter((a) => a.outcome === 'CONFIRMED').length;
  const ambiguous = assocs.filter((a) => a.outcome === 'AMBIGUOUS').length;
  const unknown = assocs.length - confirmed - ambiguous;
  let dominantOutcome: RoadAssociationOutcome = 'UNKNOWN';
  if (confirmed > ambiguous && confirmed > unknown) dominantOutcome = 'CONFIRMED';
  else if (ambiguous >= confirmed && ambiguous >= unknown) dominantOutcome = 'AMBIGUOUS';

  const junctionIds = assocs
    .map((a) => a.confirmedJunctionNodeId)
    .filter((id): id is number => id != null);
  const junctionNodeId = junctionIds.length ? junctionIds[0] : null;
  const wayIds = assocs.map((a) => a.osmWayId).filter((id): id is number => id != null);
  const osmWayId = dominantOutcome === 'CONFIRMED' && wayIds.length ? wayIds[0] : null;

  const signalMapped = assocs.some((a) => a.trafficSignalNodeId != null);

  return {
    spatial: {
      osmFrozenSnapshotSha256: teslaOsmSha,
      roadAssociation:
        dominantOutcome === 'CONFIRMED'
          ? 'CONFIRMED'
          : dominantOutcome === 'AMBIGUOUS'
            ? 'AMBIGUOUS'
            : 'UNKNOWN',
      junctionNodeId,
      osmWayId,
      ambiguityPreserved: dominantOutcome !== 'CONFIRMED' || ambiguous > 0,
      trafficSignalCoverage: signalMapped ? 'MAPPED_NODE_PROXIMATE' : 'NOT_MAPPED',
      note:
        'Tesla-specific frozen OSM; association uses distance+heading+temporal continuity — no automatic nearest-road win when competitors within 5 m.',
    },
    dominantOutcome,
    confirmedBucketFraction: assocs.length ? confirmed / assocs.length : 0,
  };
}

export type Phase3e1ReplayDelta = {
  eventId: string;
  evidenceClassificationBefore: EvidenceClassification;
  evidenceClassificationAfter: EvidenceClassification;
  spatialBefore: string;
  spatialAfter: string;
  reasons: string[];
};

export function replayPhase3eEventsWithTeslaSpatial(params: {
  phase3eEvents: ContextualDrivingEvent[];
  buckets: FixtureBucket[];
  associations: TeslaBucketAssociation[];
  teslaOsmSha256: string;
}): {
  replayed: ContextualDrivingEvent[];
  deltas: Phase3e1ReplayDelta[];
} {
  const assocByLabel = new Map(params.associations.map((a) => [a.bucketLabelUtc, a]));
  const replayed: ContextualDrivingEvent[] = [];
  const deltas: Phase3e1ReplayDelta[] = [];

  for (const ev of params.phase3eEvents) {
    const windowBuckets = bucketsInEventWindow(params.buckets, ev.startUtc, ev.endUtc);
    const spatialAgg = aggregateEventSpatial(windowBuckets, assocByLabel, params.teslaOsmSha256);
    const beforeClass = ev.evidenceClassification;
    const beforeSpatial = ev.spatialContext.roadAssociation;

    const updated: ContextualDrivingEvent = {
      ...ev,
      spatialContext: spatialAgg.spatial,
      provenance: [...new Set([...ev.provenance, 'LDI10D_PHASE3E1_TESLA_OSM'])],
    };

    const reasons: string[] = [];
    let afterClass = beforeClass;

    if (ev.eventType === 'UNKNOWN_ROAD_CONTEXT') {
      afterClass = spatialAgg.confirmedBucketFraction > 0.5 ? 'CONTEXT_SUPPORTED' : 'INFERRED_CANDIDATE';
      reasons.push('tesla_osm_corridor_restores_partial_road_context');
      updated.uncertaintyReasons = [
        ...ev.uncertaintyReasons.filter((u) => !u.includes('ldi08')),
        `confirmed_bucket_fraction=${spatialAgg.confirmedBucketFraction.toFixed(2)}`,
      ];
    }

    if (
      (ev.eventType === 'JUNCTION_APPROACH' || ev.eventType === 'JUNCTION_EXIT') &&
      spatialAgg.spatial.junctionNodeId != null
    ) {
      if (beforeClass === 'INFERRED_CANDIDATE') {
        afterClass = 'CONTEXT_SUPPORTED';
        reasons.push('confirmed_topology_junction_within_45m');
      }
    }

    if (ev.eventType === 'HARD_BRAKING_CANDIDATE' && spatialAgg.spatial.junctionNodeId != null) {
      if (afterClass === 'INFERRED_CANDIDATE') {
        afterClass = 'CONTEXT_SUPPORTED';
        reasons.push('hard_braking_near_confirmed_junction_may_be_ordinary_approach');
      }
    }

    if (
      (ev.eventType === 'CURVE_TRAVERSAL' || ev.eventType === 'CURVE_APPROACH') &&
      spatialAgg.dominantOutcome === 'CONFIRMED'
    ) {
      reasons.push('curve_kinematics_with_confirmed_way_association');
    }

    updated.evidenceClassification = afterClass;

    if (afterClass !== beforeClass || spatialAgg.spatial.roadAssociation !== beforeSpatial) {
      deltas.push({
        eventId: ev.eventId,
        evidenceClassificationBefore: beforeClass,
        evidenceClassificationAfter: afterClass,
        spatialBefore: beforeSpatial,
        spatialAfter: spatialAgg.spatial.roadAssociation,
        reasons,
      });
    }

    replayed.push(updated);
  }

  return { replayed, deltas };
}

export function verifyPhase3e1Preflight(repoRoot: string): {
  ok: boolean;
  errors: string[];
  inputIntegrity: 'PASS' | 'FAIL';
  phase3eEventCount: number;
  ldi08OsmSha256: string;
  fixtureBuckets: number;
  positionPayloadSha256: string;
} {
  const errors: string[] = [];
  const p3d = verifyPhase3dPreflight(repoRoot);
  if (!p3d.ok) errors.push(...p3d.errors);

  const fixture = loadCommittedFixture(repoRoot);
  if (fixture.bucketCount !== 1136) errors.push(`buckets ${fixture.bucketCount}`);
  if (fixture.positionPayloadSha256 !== POSITION_PAYLOAD_SHA256) errors.push('position hash');

  const ldi08Path = path.join(repoRoot, EVIDENCE_DIR_REL, LDI08_OSM_FILENAME);
  if (!fs.existsSync(ldi08Path)) errors.push('missing LDI-08 OSM');
  const ldi08Sha = sha256File(ldi08Path);
  if (ldi08Sha !== EXPECTED_OSM_SNAPSHOT_SHA256) errors.push('LDI-08 OSM sha drift');

  const p3ePath = path.join(repoRoot, EVIDENCE_DIR_REL, PHASE3E_EVENTS_FILENAME);
  if (!fs.existsSync(p3ePath)) errors.push('missing phase3e events');
  const p3e = JSON.parse(fs.readFileSync(p3ePath, 'utf8')) as { events: unknown[] };
  if (p3e.events.length !== PHASE3E_EXPECTED_EVENT_COUNT) {
    errors.push(`phase3e events ${p3e.events.length}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    inputIntegrity: errors.length === 0 ? 'PASS' : 'FAIL',
    phase3eEventCount: p3e.events.length,
    ldi08OsmSha256: ldi08Sha,
    fixtureBuckets: fixture.bucketCount,
    positionPayloadSha256: fixture.positionPayloadSha256,
  };
}

export function summarizeAssociationCounts(associations: TeslaBucketAssociation[]): {
  roadAssociated: number;
  roadAmbiguous: number;
  roadUnknown: number;
} {
  let roadAssociated = 0;
  let roadAmbiguous = 0;
  let roadUnknown = 0;
  for (const a of associations) {
    if (a.gpsStatus !== 'PRESENT') {
      roadUnknown += 1;
      continue;
    }
    if (a.outcome === 'CONFIRMED') roadAssociated += 1;
    else if (a.outcome === 'AMBIGUOUS') roadAmbiguous += 1;
    else roadUnknown += 1;
  }
  return { roadAssociated, roadAmbiguous, roadUnknown };
}

export async function runPhase3e1Analysis(
  repoRoot: string,
  opts: { headSha: string; allowLiveFetch: boolean },
): Promise<{
  preflight: ReturnType<typeof verifyPhase3e1Preflight>;
  teslaOsm: Awaited<ReturnType<typeof acquireOrLoadTeslaOsmSnapshot>>;
  topology: ReturnType<typeof buildTeslaTopologyContext>;
  associations: TeslaBucketAssociation[];
  associationCounts: ReturnType<typeof summarizeAssociationCounts>;
  replayedEvents: ContextualDrivingEvent[];
  replayDeltas: Phase3e1ReplayDelta[];
  graph: ReturnType<typeof buildEventGraph>;
  l3BaselineDrift: 'NONE' | 'DRIFT';
  phase3eEventsBaseline: ContextualDrivingEvent[];
}> {
  const preflight = verifyPhase3e1Preflight(repoRoot);
  const p3d = runPhase3dAnalysis(repoRoot);
  const fixture = loadCommittedFixture(repoRoot);
  const teslaOsm = await acquireOrLoadTeslaOsmSnapshot(repoRoot, {
    headSha: opts.headSha,
    allowLiveFetch: opts.allowLiveFetch,
  });
  const topology = buildTeslaTopologyContext(teslaOsm.doc);
  const associations = buildTeslaBucketAssociations(fixture.buckets, topology);
  const associationCounts = summarizeAssociationCounts(associations);

  const p3ePath = path.join(repoRoot, EVIDENCE_DIR_REL, PHASE3E_EVENTS_FILENAME);
  const phase3eEventsBaseline = (
    JSON.parse(fs.readFileSync(p3ePath, 'utf8')) as { events: ContextualDrivingEvent[] }
  ).events;

  const { replayed, deltas } = replayPhase3eEventsWithTeslaSpatial({
    phase3eEvents: phase3eEventsBaseline,
    buckets: fixture.buckets,
    associations,
    teslaOsmSha256: teslaOsm.snapshotSha256,
  });

  const graph = buildEventGraph(replayed);

  return {
    preflight,
    teslaOsm,
    topology,
    associations,
    associationCounts,
    replayedEvents: replayed,
    replayDeltas: deltas,
    graph,
    l3BaselineDrift: p3d.l3BaselineDrift,
    phase3eEventsBaseline,
  };
}

export function sha256OfFileIfExists(p: string): string | null {
  return fs.existsSync(p) ? sha256File(p) : null;
}
