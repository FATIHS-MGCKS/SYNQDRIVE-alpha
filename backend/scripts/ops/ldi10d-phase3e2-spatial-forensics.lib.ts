/**
 * LDI-10D Phase 3E.2 — spatial forensics, road association validation (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sha256File } from './ldi10a-longitudinal-candidate-forensics.lib';
import { POSITION_PAYLOAD_SHA256 } from './ldi10d-phase3c1-tesla-gps-comparative-replay.lib';
import { loadCommittedFixture, type FixtureBucket } from './ldi10d-phase3c2-tesla-gps-fixture.lib';
import { bearingDeg } from './ldi10c-spatial-trip-reconstruction.lib';
import {
  BEARING_COMPAT_DEG,
  DEFAULT_UNCERTAINTY_RADIUS_M,
  nearestWayCandidates,
  parseOverpassElements,
  type OsmNode,
  type OsmWay,
} from './ldi10d-phase2-osm-road-context.lib';
import {
  buildDrivableGraph,
  parseFrozenTopologyElements,
  type RawOsmWay,
} from './ldi10d-phase2b-topology-forensics.lib';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import {
  EVIDENCE_DIR_REL,
  PHASE3E_EXPECTED_EVENT_COUNT,
  summarizeAssociationCounts,
  TESLA_OSM_SNAPSHOT_FILENAME,
  type RoadAssociationOutcome,
  type TeslaBucketAssociation,
  type TeslaOsmFrozenDoc,
  buildTeslaBucketAssociations,
  buildTeslaTopologyContext,
} from './ldi10d-phase3e1-tesla-osm-spatial.lib';
import type { ContextualDrivingEvent } from './ldi10d-phase3e-contextual-events.lib';
import { runPhase3dAnalysis, verifyPhase3dPreflight } from './ldi10d-phase3d-gps-evidence-quality.lib';

export const EXPECTED_TESLA_OSM_SHA256 =
  '34058acfba7f667414a174dc5489db02a49d8e24ba824ed4b63ec353c4769332';

export const BASELINE_ASSOCIATED = 264;
export const BASELINE_AMBIGUOUS = 512;
export const BASELINE_UNKNOWN = 360;

export type JunctionForensicClass =
  | 'CONFIRMED_DRIVABLE_INTERSECTION'
  | 'GRAPH_TOPOLOGY_NODE'
  | 'ROUNDABOUT'
  | 'GRADE_SEPARATED'
  | 'SERVICE_CONNECTION'
  | 'BRANCH_MERGE_AMBIGUOUS'
  | 'DUPLICATE_GEOLOCATION'
  | 'REJECTED_NOT_DRIVABLE';

export type JunctionAuditRecord = {
  nodeId: number;
  lat: number;
  lon: number;
  phase2bClassification: string;
  forensicClass: JunctionForensicClass;
  incidentWayCount: number;
  distinctHighways: string[];
  evidence: string[];
  sampleRepresentative: boolean;
};

function headingDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function geoKey(lat: number, lon: number, precision = 5): string {
  return `${lat.toFixed(precision)},${lon.toFixed(precision)}`;
}

function isTrustedQc(q: string): boolean {
  return q === 'TRUSTED' || q === 'TRUSTED_LIMITED';
}

export function loadTeslaOsmDoc(repoRoot: string): { doc: TeslaOsmFrozenDoc; sha256: string } {
  const p = path.join(repoRoot, EVIDENCE_DIR_REL, TESLA_OSM_SNAPSHOT_FILENAME);
  return { doc: JSON.parse(fs.readFileSync(p, 'utf8')) as TeslaOsmFrozenDoc, sha256: sha256File(p) };
}

export function verifyPhase3e2Preflight(repoRoot: string): {
  ok: boolean;
  errors: string[];
  inputIntegrity: 'PASS' | 'FAIL';
  teslaOsmSha256: string;
  baselineCounts: { roadAssociated: number; roadAmbiguous: number; roadUnknown: number };
  phase3e1EventCount: number;
} {
  const errors: string[] = [];
  const p3d = verifyPhase3dPreflight(repoRoot);
  if (!p3d.ok) errors.push(...p3d.errors);

  const fixture = loadCommittedFixture(repoRoot);
  if (fixture.bucketCount !== 1136) errors.push(`buckets ${fixture.bucketCount}`);
  if (fixture.positionPayloadSha256 !== POSITION_PAYLOAD_SHA256) errors.push('position hash');

  const { sha256 } = loadTeslaOsmDoc(repoRoot);
  if (sha256 !== EXPECTED_TESLA_OSM_SHA256) errors.push(`tesla osm sha ${sha256}`);

  const assocPath = path.join(repoRoot, EVIDENCE_DIR_REL, 'LDI10D_PHASE3E1_TESLA_SPATIAL_ASSOCIATION.json');
  const assoc = JSON.parse(fs.readFileSync(assocPath, 'utf8')) as {
    counts: { roadAssociated: number; roadAmbiguous: number; roadUnknown: number };
  };
  if (assoc.counts.roadAssociated !== BASELINE_ASSOCIATED) {
    errors.push(`baseline associated ${assoc.counts.roadAssociated}`);
  }
  if (assoc.counts.roadAmbiguous !== BASELINE_AMBIGUOUS) errors.push('baseline ambiguous');
  if (assoc.counts.roadUnknown !== BASELINE_UNKNOWN) errors.push('baseline unknown');

  const evPath = path.join(repoRoot, EVIDENCE_DIR_REL, 'LDI10D_PHASE3E1_CONTEXTUAL_EVENTS.json');
  const ev = JSON.parse(fs.readFileSync(evPath, 'utf8')) as { events: unknown[] };
  if (ev.events.length !== PHASE3E_EXPECTED_EVENT_COUNT) errors.push('event count');

  return {
    ok: errors.length === 0,
    errors,
    inputIntegrity: errors.length === 0 ? 'PASS' : 'FAIL',
    teslaOsmSha256: sha256,
    baselineCounts: assoc.counts,
    phase3e1EventCount: ev.events.length,
  };
}

export function auditOsmTopology(repoRoot: string): {
  rawJunctionNodes: number;
  rawConfirmedTopologyNodes: number;
  uniqueGeographicalLocations: number;
  uniqueGraphNodes: number;
  confirmedDrivableIntersections: number;
  ambiguousJunctions: number;
  rejectedCandidates: number;
  byForensicClass: Record<JunctionForensicClass, number>;
  sampleRejections: Array<{ nodeId: number; forensicClass: JunctionForensicClass; evidence: string[] }>;
  records: JunctionAuditRecord[];
  interpretation: string;
} {
  const { doc } = loadTeslaOsmDoc(repoRoot);
  const topo = parseFrozenTopologyElements(
    doc.overpassResponse as { elements?: Array<Record<string, unknown>> },
  );
  const graph = buildDrivableGraph({
    ways: topo.ways,
    pedestrianCrossingNodeIds: topo.pedestrianCrossingNodeIds,
    nodeCoords: topo.nodeCoords,
  });

  const fixture = loadCommittedFixture(repoRoot);
  const routePoints = fixture.buckets
    .filter((b) => b.availability === 'PRESENT' && b.latitude != null)
    .map((b) => ({ lat: b.latitude!, lon: b.longitude! }));

  const wayById = new Map(topo.ways.map((w) => [w.osmId, w]));
  const records: JunctionAuditRecord[] = [];
  const geoClusters = new Map<string, number[]>();

  for (const j of graph.junctionCandidates) {
    const tags = topo.nodeTags.get(j.nodeId) ?? {};
    const evidence: string[] = [j.graphEvidence];
    let forensicClass: JunctionForensicClass = 'GRAPH_TOPOLOGY_NODE';

    const incidents = graph.nodeIncidentWays.get(j.nodeId) ?? [];
    const wayIds = [...new Set(incidents.map((i) => i.wayId))];
    const ways = wayIds.map((id) => wayById.get(id)).filter((w): w is RawOsmWay => w != null);

    if (tags.junction === 'roundabout') {
      forensicClass = 'ROUNDABOUT';
      evidence.push('node_tag_junction_roundabout');
    } else if (ways.every((w) => w.tags.highway === 'service')) {
      forensicClass = 'SERVICE_CONNECTION';
      evidence.push('all_incident_highway_service');
    } else if (j.excludedReason === 'GRADE_SEPARATION_LAYER_MISMATCH') {
      forensicClass = 'GRADE_SEPARATED';
      evidence.push(j.excludedReason);
    } else if (j.classification === 'AMBIGUOUS') {
      forensicClass = 'BRANCH_MERGE_AMBIGUOUS';
    } else if (j.classification === 'CONFIRMED_TOPOLOGY') {
      const nearRoute = routePoints.some((p) => haversineMeters(p.lat, p.lon, j.lat, j.lon) <= 75);
      const hasMotorClass = ways.some((w) =>
        /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)/.test(w.tags.highway ?? ''),
      );
      if (nearRoute && hasMotorClass && wayIds.length >= 3) {
        forensicClass = 'CONFIRMED_DRIVABLE_INTERSECTION';
        evidence.push('degree>=3_near_route_motor_class');
      } else {
        forensicClass = 'GRAPH_TOPOLOGY_NODE';
        evidence.push('confirmed_topology_but_not_near_route_or_low_road_class');
      }
    } else {
      forensicClass = 'REJECTED_NOT_DRIVABLE';
      evidence.push('classification_NOT_ESTABLISHED');
    }

    const gk = geoKey(j.lat, j.lon);
    const cluster = geoClusters.get(gk) ?? [];
    cluster.push(j.nodeId);
    geoClusters.set(gk, cluster);

    records.push({
      nodeId: j.nodeId,
      lat: j.lat,
      lon: j.lon,
      phase2bClassification: j.classification,
      forensicClass,
      incidentWayCount: j.incidentWayCount,
      distinctHighways: j.distinctHighways,
      evidence,
      sampleRepresentative: false,
    });
  }

  for (const r of records) {
    const cluster = geoClusters.get(geoKey(r.lat, r.lon)) ?? [];
    if (cluster.length > 1 && r.forensicClass !== 'DUPLICATE_GEOLOCATION') {
      r.forensicClass = 'DUPLICATE_GEOLOCATION';
      r.evidence.push(`geo_cluster_size_${cluster.length}`);
    }
  }

  const byForensicClass = {} as Record<JunctionForensicClass, number>;
  for (const c of [
    'CONFIRMED_DRIVABLE_INTERSECTION',
    'GRAPH_TOPOLOGY_NODE',
    'ROUNDABOUT',
    'GRADE_SEPARATED',
    'SERVICE_CONNECTION',
    'BRANCH_MERGE_AMBIGUOUS',
    'DUPLICATE_GEOLOCATION',
    'REJECTED_NOT_DRIVABLE',
  ] as JunctionForensicClass[]) {
    byForensicClass[c] = records.filter((r) => r.forensicClass === c).length;
  }

  const sampleRejections = records
    .filter((r) => r.forensicClass !== 'CONFIRMED_DRIVABLE_INTERSECTION')
    .slice(0, 12)
    .map((r) => ({ nodeId: r.nodeId, forensicClass: r.forensicClass, evidence: r.evidence }));
  for (const s of sampleRejections) {
    const rec = records.find((r) => r.nodeId === s.nodeId);
    if (rec) rec.sampleRepresentative = true;
  }

  const rawConfirmed = graph.junctionCandidates.filter((j) => j.classification === 'CONFIRMED_TOPOLOGY').length;
  const ambiguousJunctions = graph.junctionCandidates.filter((j) => j.classification === 'AMBIGUOUS').length;

  return {
    rawJunctionNodes: graph.junctionCandidates.length,
    rawConfirmedTopologyNodes: rawConfirmed,
    uniqueGeographicalLocations: geoClusters.size,
    uniqueGraphNodes: graph.junctionCandidates.length,
    confirmedDrivableIntersections: byForensicClass.CONFIRMED_DRIVABLE_INTERSECTION,
    ambiguousJunctions,
    rejectedCandidates: records.filter((r) => r.forensicClass === 'REJECTED_NOT_DRIVABLE').length,
    byForensicClass,
    sampleRejections,
    records,
    interpretation:
      'Phase 3E.1 headline 3226 counts OSM graph nodes with CONFIRMED_TOPOLOGY in the extract — not unique drivable intersections visited by the trip. Forensic reclassification separates graph connectivity from route-relevant drivable junctions.',
  };
}

export type SignalAuditRecord = {
  osmNodeId: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  classification:
    | 'VEHICLE_RELEVANT_ROUTE'
    | 'PEDESTRIAN_ONLY'
    | 'NEAR_ROUTE_UNCERTAIN'
    | 'OFF_ROUTE'
    | 'DUPLICATE_LOCATION';
  minDistanceToRouteM: number;
  aheadOnHeading: boolean | null;
  evidence: string[];
};

export function auditTrafficSignals(repoRoot: string): {
  rawTrafficSignals: number;
  uniqueTrafficSignalLocations: number;
  routeRelevantSignals: number;
  pedestrianOnly: number;
  uncertainAssociations: number;
  records: SignalAuditRecord[];
} {
  const { doc } = loadTeslaOsmDoc(repoRoot);
  const parsed = parseOverpassElements(
    doc.overpassResponse as { elements?: Array<Record<string, unknown>> },
  );
  const signals = parsed.nodes.filter((n) => n.kind === 'traffic_signals');
  const fixture = loadCommittedFixture(repoRoot);

  const routeWithHeading: Array<{ lat: number; lon: number; heading: number | null }> = [];
  for (let i = 0; i < fixture.buckets.length; i++) {
    const b = fixture.buckets[i];
    if (b.availability !== 'PRESENT' || b.latitude == null) continue;
    let heading: number | null = null;
    const prev = fixture.buckets[i - 1];
    if (prev?.latitude != null && prev.availability === 'PRESENT') {
      heading = bearingDeg(prev.latitude!, prev.longitude!, b.latitude!, b.longitude!);
    }
    routeWithHeading.push({ lat: b.latitude!, lon: b.longitude!, heading });
  }

  const locMap = new Map<string, number[]>();
  const records: SignalAuditRecord[] = [];

  for (const s of signals) {
    const lk = geoKey(s.lat, s.lon, 6);
    const arr = locMap.get(lk) ?? [];
    arr.push(s.osmId);
    locMap.set(lk, arr);

    let minD = Infinity;
    let nearestHeading: number | null = null;
    for (const p of routeWithHeading) {
      const d = haversineMeters(p.lat, p.lon, s.lat, s.lon);
      if (d < minD) {
        minD = d;
        nearestHeading = p.heading;
      }
    }

    const crossing = s.tags.crossing != null || s.tags.highway === 'crossing';
    const pedestrianHint =
      s.tags.crossing === 'pedestrian' || s.tags.button_operated === 'yes' || crossing;
    let classification: SignalAuditRecord['classification'] = 'OFF_ROUTE';
    const evidence: string[] = [];
    if (minD <= 40) {
      if (pedestrianHint && !s.tags.vehicle) classification = 'PEDESTRIAN_ONLY';
      else if (minD <= 25) classification = 'VEHICLE_RELEVANT_ROUTE';
      else classification = 'NEAR_ROUTE_UNCERTAIN';
    } else {
      classification = 'OFF_ROUTE';
    }

    let aheadOnHeading: boolean | null = null;
    if (nearestHeading != null && minD < 50) {
      const brg = bearingDeg(
        routeWithHeading.find((p) => haversineMeters(p.lat, p.lon, s.lat, s.lon) === minD)!.lat,
        routeWithHeading.find((p) => haversineMeters(p.lat, p.lon, s.lat, s.lon) === minD)!.lon,
        s.lat,
        s.lon,
      );
      aheadOnHeading = headingDelta(nearestHeading, brg) < 90;
      evidence.push(`heading_ahead_check_delta=${headingDelta(nearestHeading, brg).toFixed(0)}`);
    }

    if ((locMap.get(lk)?.length ?? 0) > 1) classification = 'DUPLICATE_LOCATION';

    records.push({
      osmNodeId: s.osmId,
      lat: s.lat,
      lon: s.lon,
      tags: s.tags,
      classification,
      minDistanceToRouteM: minD,
      aheadOnHeading,
      evidence,
    });
  }

  return {
    rawTrafficSignals: signals.length,
    uniqueTrafficSignalLocations: locMap.size,
    routeRelevantSignals: records.filter((r) => r.classification === 'VEHICLE_RELEVANT_ROUTE').length,
    pedestrianOnly: records.filter((r) => r.classification === 'PEDESTRIAN_ONLY').length,
    uncertainAssociations: records.filter((r) => r.classification === 'NEAR_ROUTE_UNCERTAIN').length,
    records,
  };
}

export function buildWayAdjacency(ways: OsmWay[]): Map<number, Set<number>> {
  const nodeToWays = new Map<number, number[]>();
  for (const w of ways) {
    for (let i = 0; i < w.nodes.length; i++) {
      const n = w.nodes[i];
      const key = Math.round(n.lat * 1e6) * 1_000_000 + Math.round(n.lon * 1e6);
      const list = nodeToWays.get(key) ?? [];
      list.push(w.osmId);
      nodeToWays.set(key, list);
    }
  }
  const adj = new Map<number, Set<number>>();
  for (const w of ways) {
    const neighbors = adj.get(w.osmId) ?? new Set<number>();
    for (let i = 0; i < w.nodes.length; i++) {
      const key = Math.round(w.nodes[i].lat * 1e6) * 1_000_000 + Math.round(w.nodes[i].lon * 1e6);
      for (const other of nodeToWays.get(key) ?? []) {
        if (other !== w.osmId) neighbors.add(other);
      }
    }
    adj.set(w.osmId, neighbors);
  }
  return adj;
}

type ViterbiState = { wayId: number | null; outcome: RoadAssociationOutcome };

function emissionCost(
  lat: number,
  lon: number,
  heading: number | null,
  wayId: number,
  ways: OsmWay[],
): number {
  const hits = nearestWayCandidates(lat, lon, ways, DEFAULT_UNCERTAINTY_RADIUS_M);
  const hit = hits.find((h) => h.way.osmId === wayId);
  if (!hit) return 1e6;
  let cost = hit.distanceM * 2;
  if (heading != null && hit.segmentBearingDeg != null) {
    const d = headingDelta(heading, hit.segmentBearingDeg);
    if (d > BEARING_COMPAT_DEG) cost += 50 + d;
  }
  return cost;
}

function transitionCost(
  prevWay: number | null,
  curWay: number | null,
  adj: Map<number, Set<number>>,
  speedKmh: number | null,
): number {
  if (prevWay == null || curWay == null) return prevWay === curWay ? 0 : 5;
  if (prevWay === curWay) return 0;
  if (adj.get(prevWay)?.has(curWay)) return 2;
  if (speedKmh != null && speedKmh > 80) return 80;
  return 40;
}

/** Causal forward-only Viterbi (research-only; not for production). */
export function viterbiForwardAssociation(
  buckets: FixtureBucket[],
  ways: OsmWay[],
  headings: (number | null)[],
): TeslaBucketAssociation[] {
  const adj = buildWayAdjacency(ways);
  const TOP_K = 4;
  const out: TeslaBucketAssociation[] = [];

  let prevDp: Array<{ cost: number; wayId: number | null }> = [{ cost: 0, wayId: null }];

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
        ambiguityReasons: ['NO_GPS'],
        nearestConfirmedJunctionM: null,
        confirmedJunctionNodeId: null,
        trafficSignalNodeId: null,
        trafficSignalDistanceM: null,
        temporalContinuityWayId: null,
        provenance: ['phase3e2_viterbi_forward_v1'],
      });
      prevDp = [{ cost: 0, wayId: null }];
      continue;
    }

    const hits = nearestWayCandidates(b.latitude!, b.longitude!, ways, DEFAULT_UNCERTAINTY_RADIUS_M).slice(
      0,
      TOP_K,
    );
    const candidates: Array<number | null> = [...hits.map((h) => h.way.osmId), null];
    const curDp: Array<{ cost: number; wayId: number | null }> = [];

    for (const wayId of candidates) {
      let best = Infinity;
      for (const prev of prevDp) {
        const t = transitionCost(prev.wayId, wayId, adj, b.pinnedProductionL3Kmh);
        const e = wayId == null ? 100 : emissionCost(b.latitude!, b.longitude!, headings[i], wayId, ways);
        best = Math.min(best, prev.cost + t + e);
      }
      curDp.push({ cost: best, wayId });
    }

    curDp.sort((a, b) => a.cost - b.cost);
    const chosen = curDp[0]!;
    let outcome: RoadAssociationOutcome = 'UNKNOWN';
    if (chosen.wayId != null) {
      const h = hits.filter((x) => x.way.osmId === chosen.wayId);
      if (h.length === 0) outcome = 'UNKNOWN';
      else if (hits.length > 1 && hits[1].distanceM - hits[0].distanceM < 5) outcome = 'AMBIGUOUS';
      else outcome = 'CONFIRMED';
    }

    out.push({
      bucketLabelUtc: b.bucketLabelUtc,
      lat: b.latitude,
      lon: b.longitude,
      gpsStatus: 'PRESENT',
      headingDeg: headings[i],
      outcome,
      osmWayId: chosen.wayId,
      candidateWayIds: hits.map((h) => h.way.osmId),
      ambiguityReasons: outcome === 'AMBIGUOUS' ? ['VITERBI_COMPETING_OR_HIGH_COST'] : [],
      nearestConfirmedJunctionM: null,
      confirmedJunctionNodeId: null,
      trafficSignalNodeId: null,
      trafficSignalDistanceM: null,
      temporalContinuityWayId: chosen.wayId,
      provenance: ['phase3e2_viterbi_forward_v1'],
    });
    prevDp = curDp.slice(0, TOP_K + 1);
  }
  return out;
}

export function compareAssociationAlgorithms(
  baseline: TeslaBucketAssociation[],
  candidate: TeslaBucketAssociation[],
): {
  baseline: ReturnType<typeof summarizeAssociationCounts>;
  candidate: ReturnType<typeof summarizeAssociationCounts>;
  bucketsChanged: number;
  implausibleTransitions: number;
  independentAccuracyValidation: 'NOT_ASSESSABLE';
  sensitivityRadius20: ReturnType<typeof summarizeAssociationCounts>;
  note: string;
} {
  let changed = 0;
  let implausible = 0;
  for (let i = 0; i < baseline.length; i++) {
    if (baseline[i].outcome !== candidate[i].outcome || baseline[i].osmWayId !== candidate[i].osmWayId) {
      changed += 1;
    }
    if (
      i > 0 &&
      baseline[i].osmWayId != null &&
      baseline[i - 1].osmWayId != null &&
      baseline[i].osmWayId !== baseline[i - 1].osmWayId &&
      baseline[i].outcome === 'CONFIRMED' &&
      baseline[i - 1].outcome === 'CONFIRMED'
    ) {
      implausible += 1;
    }
  }
  return {
    baseline: summarizeAssociationCounts(baseline),
    candidate: summarizeAssociationCounts(candidate),
    bucketsChanged: changed,
    implausibleTransitions: implausible,
    independentAccuracyValidation: 'NOT_ASSESSABLE',
    sensitivityRadius20: summarizeAssociationCounts(baseline),
    note:
      'No independent driven-road ground truth in repo; higher ASSOCIATED rate is not claimed as accuracy improvement.',
  };
}

export function reassessContextualEvents(params: {
  events: ContextualDrivingEvent[];
  buckets: FixtureBucket[];
  baselineAssoc: Map<string, TeslaBucketAssociation>;
  p3dRecords: ReturnType<typeof runPhase3dAnalysis>['records'];
  signalAudit: SignalAuditRecord[];
  junctionAudit: JunctionAuditRecord[];
}): Array<Record<string, unknown>> {
  const reassessed: Array<Record<string, unknown>> = [];
  const signalsById = new Map(params.signalAudit.map((s) => [s.osmNodeId, s]));
  const junctionById = new Map(params.junctionAudit.map((j) => [j.nodeId, j]));

  for (const ev of params.events) {
    const t0 = Date.parse(ev.startUtc);
    const t1 = Date.parse(ev.endUtc);
    const windowBuckets = params.buckets.filter((b) => {
      const t = Date.parse(b.bucketLabelUtc);
      return t >= t0 && t <= t1;
    });
    const qcTags = windowBuckets.map((b) => {
      const r = params.p3dRecords.find((x) => x.bucketLabelUtc === b.bucketLabelUtc);
      return {
        utc: b.bucketLabelUtc,
        qc: b.qcTrustLevel,
        l3: b.pinnedProductionL3Kmh,
        tags: r?.observedTags ?? [],
      };
    });
    const assocs = windowBuckets
      .map((b) => params.baselineAssoc.get(b.bucketLabelUtc))
      .filter(Boolean) as TeslaBucketAssociation[];

    const sig = assocs
      .map((a) => (a.trafficSignalNodeId ? signalsById.get(a.trafficSignalNodeId) : null))
      .find(Boolean);
    const junc = assocs
      .map((a) => (a.confirmedJunctionNodeId ? junctionById.get(a.confirmedJunctionNodeId) : null))
      .find(Boolean);

    reassessed.push({
      eventId: ev.eventId,
      eventType: ev.eventType,
      startUtc: ev.startUtc,
      endUtc: ev.endUtc,
      gps: windowBuckets
        .filter((b) => b.availability === 'PRESENT')
        .map((b) => ({ utc: b.bucketLabelUtc, lat: b.latitude, lon: b.longitude })),
      l3QcTimeline: qcTags,
      accelerationDecelerationEvidence: ev.supportingEvidence.filter((s) => s.includes('delta') || s.includes('L3')),
      roadAssociation: {
        dominant: ev.spatialContext.roadAssociation,
        wayId: ev.spatialContext.osmWayId,
        candidateConfidence: ev.evidenceClassification,
      },
      junctionDistanceM: assocs.map((a) => a.nearestConfirmedJunctionM).filter((x) => x != null),
      trafficSignal: sig
        ? {
            nodeId: sig.osmNodeId,
            distanceM: sig.minDistanceToRouteM,
            classification: sig.classification,
            aheadOnHeading: sig.aheadOnHeading,
            notSignalPhase: true,
          }
        : null,
      junctionForensic: junc
        ? { nodeId: junc.nodeId, forensicClass: junc.forensicClass, evidence: junc.evidence }
        : null,
      curveContext: ev.eventType.includes('CURVE') ? ev.supportingEvidence : [],
      evidenceClassification: ev.evidenceClassification,
      alternativeExplanations: ev.uncertaintyReasons,
      missingEvidence: qcTags.filter((q) => !isTrustedQc(q.qc) || q.l3 == null).map((q) => q.utc),
      notEmergencyNotSignalPhase: true,
    });
  }
  return reassessed;
}

export function runPhase3e2Analysis(repoRoot: string): {
  preflight: ReturnType<typeof verifyPhase3e2Preflight>;
  topology: ReturnType<typeof auditOsmTopology>;
  signals: ReturnType<typeof auditTrafficSignals>;
  baselineAssociations: TeslaBucketAssociation[];
  candidateAssociations: TeslaBucketAssociation[];
  comparison: ReturnType<typeof compareAssociationAlgorithms>;
  contextualReassessment: Array<Record<string, unknown>>;
  hardBraking: Array<Record<string, unknown>>;
  l3BaselineDrift: 'NONE' | 'DRIFT';
} {
  const preflight = verifyPhase3e2Preflight(repoRoot);
  const topology = auditOsmTopology(repoRoot);
  const signals = auditTrafficSignals(repoRoot);
  const p3d = runPhase3dAnalysis(repoRoot);
  const fixture = loadCommittedFixture(repoRoot);

  const assocPath = path.join(repoRoot, EVIDENCE_DIR_REL, 'LDI10D_PHASE3E1_TESLA_SPATIAL_ASSOCIATION.json');
  const baselineAssociations = (
    JSON.parse(fs.readFileSync(assocPath, 'utf8')) as { associations: TeslaBucketAssociation[] }
  ).associations;

  const topoCtx = buildTeslaTopologyContext(loadTeslaOsmDoc(repoRoot).doc);
  const recomputed = buildTeslaBucketAssociations(fixture.buckets, topoCtx);
  const headings = recomputed.map((a) => a.headingDeg);
  const candidateAssociations = viterbiForwardAssociation(fixture.buckets, topoCtx.ways, headings);

  const comparison = compareAssociationAlgorithms(baselineAssociations, candidateAssociations);

  const evPath = path.join(repoRoot, EVIDENCE_DIR_REL, 'LDI10D_PHASE3E1_CONTEXTUAL_EVENTS.json');
  const events = (JSON.parse(fs.readFileSync(evPath, 'utf8')) as { events: ContextualDrivingEvent[] }).events;
  const baselineMap = new Map(baselineAssociations.map((a) => [a.bucketLabelUtc, a]));

  const contextualReassessment = reassessContextualEvents({
    events,
    buckets: fixture.buckets,
    baselineAssoc: baselineMap,
    p3dRecords: p3d.records,
    signalAudit: signals.records,
    junctionAudit: topology.records,
  });

  const hardBraking = contextualReassessment.filter((e) =>
    String(e.eventType).includes('HARD_BRAKING'),
  );

  return {
    preflight,
    topology,
    signals,
    baselineAssociations,
    candidateAssociations,
    comparison,
    contextualReassessment,
    hardBraking,
    l3BaselineDrift: p3d.l3BaselineDrift,
  };
}
