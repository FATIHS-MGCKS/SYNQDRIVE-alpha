/**
 * LDI-10D Phase 3A — temporal driving event reconstruction (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import { loadLdi08Artifacts, type Ldi08Row } from './ldi09-accel-decel-signal-forensics.lib';
import {
  bearingDeg,
  loadLdi10bGroups,
  matchManeuverTrajectory,
  rowsInInclusiveWindow,
  type Ldi10bGroup,
} from './ldi10c-spatial-trip-reconstruction.lib';
import {
  DEFAULT_UNCERTAINTY_RADIUS_M,
  nearestWayCandidates,
  parseOverpassElements,
} from './ldi10d-phase2-osm-road-context.lib';
import {
  buildDrivableGraph,
  nearestJunctionDistanceM,
  parseFrozenTopologyElements,
  verifyPhase2bPreflight,
} from './ldi10d-phase2b-topology-forensics.lib';

export const EVENT_TYPES = [
  'DECELERATION_APPROACH',
  'ACCELERATION_EXIT',
  'OBSERVED_STANDSTILL',
  'STOP_AND_GO_CANDIDATE',
  'CURVE_TRAVERSAL',
  'JUNCTION_APPROACH',
  'TURN_CANDIDATE',
  'UNRESOLVED_EVENT',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
export type EventCertainty = 'CONFIRMED' | 'CANDIDATE' | 'UNKNOWN';

export type DrivingEvent = {
  eventId: string;
  eventType: EventType;
  certainty: EventCertainty;
  windowUtc: { start: string; end: string };
  gpsBuckets: Array<{
    utc: string;
    lat: number | null;
    lon: number | null;
    gpsAvailability: string;
    speedKmh: number | null;
    l3Qc: string;
  }>;
  speedProfile: { minKmh: number | null; maxKmh: number | null; startKmh: number | null; endKmh: number | null };
  qcSummary: { trusted: number; trustedLimited: number; untrusted: number; rowAbsent: number };
  roadRefs: { osmWayId: number | null; junctionNodeId: number | null; associationOutcome: string | null };
  uncertainty: {
    class: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
    reasons: string[];
  };
  linkedManeuverGroupId: string | null;
  notDriverIntentNotScore: true;
  evidenceProvenance: string[];
};

function headingDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function isQcTrustedForConfirmation(qc: string): boolean {
  return qc === 'TRUSTED' || qc === 'TRUSTED_LIMITED';
}

function rowToBucket(r: Ldi08Row): DrivingEvent['gpsBuckets'][0] {
  return {
    utc: r.evaluationIndexUtc,
    lat: r.gps.latitude ?? null,
    lon: r.gps.longitude ?? null,
    gpsAvailability: String(r.gps.availability),
    speedKmh: r.l3.speedKmh ?? null,
    l3Qc: String(r.l3.qcTrustLevel),
  };
}

function summarizeBuckets(buckets: DrivingEvent['gpsBuckets']) {
  const speeds = buckets.map((b) => b.speedKmh).filter((s): s is number => s != null);
  let trusted = 0;
  let trustedLimited = 0;
  let untrusted = 0;
  let rowAbsent = 0;
  for (const b of buckets) {
    if (b.gpsAvailability !== 'PRESENT') rowAbsent += 1;
    if (b.l3Qc === 'TRUSTED') trusted += 1;
    else if (b.l3Qc === 'TRUSTED_LIMITED') trustedLimited += 1;
    else untrusted += 1;
  }
  return {
    speedProfile: {
      minKmh: speeds.length ? Math.min(...speeds) : null,
      maxKmh: speeds.length ? Math.max(...speeds) : null,
      startKmh: speeds[0] ?? null,
      endKmh: speeds[speeds.length - 1] ?? null,
    },
    qcSummary: { trusted, trustedLimited, untrusted, rowAbsent },
  };
}

export function detectStandstillSequences(rows: Ldi08Row[]): DrivingEvent[] {
  const events: DrivingEvent[] = [];
  let i = 0;
  while (i < rows.length) {
    const r = rows[i];
    const speed = r.l3.speedKmh;
    const gpsOk = r.gps.availability === 'PRESENT' && r.gps.latitude != null;
    const low = speed != null && speed <= 3;
    if (!gpsOk || !low) {
      i += 1;
      continue;
    }
    const start = i;
    while (
      i < rows.length &&
      rows[i].gps.availability === 'PRESENT' &&
      rows[i].l3.speedKmh != null &&
      rows[i].l3.speedKmh! <= 3
    ) {
      i += 1;
    }
    const slice = rows.slice(start, i);
    const buckets = slice.map(rowToBucket);
    const { speedProfile, qcSummary } = summarizeBuckets(buckets);
    const allTrusted = slice.every((x) => isQcTrustedForConfirmation(x.l3.qcTrustLevel));
    const certainty: EventCertainty =
      slice.length >= 2 && allTrusted ? 'CONFIRMED' : slice.length >= 1 ? 'CANDIDATE' : 'UNKNOWN';
    const reasons: string[] = [];
    if (slice.length < 2) reasons.push('SINGLE_BUCKET_STANDSTILL');
    if (!allTrusted) reasons.push('QC_NOT_FULLY_TRUSTED_AT_LOW_SPEED');
    events.push({
      eventId: `EVT_STANDSTILL_${slice[0].evaluationIndexUtc.replace(/[:]/g, '')}`,
      eventType: 'OBSERVED_STANDSTILL',
      certainty,
      windowUtc: { start: slice[0].evaluationIndexUtc, end: slice[slice.length - 1].evaluationIndexUtc },
      gpsBuckets: buckets,
      speedProfile,
      qcSummary,
      roadRefs: { osmWayId: null, junctionNodeId: null, associationOutcome: null },
      uncertainty: {
        class: certainty === 'CONFIRMED' ? 'LOW' : certainty === 'CANDIDATE' ? 'MEDIUM' : 'HIGH',
        reasons,
      },
      linkedManeuverGroupId: null,
      notDriverIntentNotScore: true,
      evidenceProvenance: ['LDI08_COMBINED_SNAPSHOT'],
    });
  }
  return events;
}

export function detectStopAndGoCandidates(
  rows: Ldi08Row[],
  standstills: DrivingEvent[],
): DrivingEvent[] {
  const out: DrivingEvent[] = [];
  for (const st of standstills) {
    const endMs = Date.parse(st.windowUtc.end);
    const follow = rows.filter((r) => {
      const t = Date.parse(r.evaluationIndexUtc);
      return t > endMs && t <= endMs + 15_000;
    });
    if (follow.length < 2) continue;
    const speeds = follow.map((r) => r.l3.speedKmh).filter((s): s is number => s != null);
    const rise = speeds.length >= 2 && speeds[speeds.length - 1] - speeds[0] >= 8;
    const decelBefore = rows.filter((r) => {
      const t = Date.parse(r.evaluationIndexUtc);
      return t < Date.parse(st.windowUtc.start) && t >= Date.parse(st.windowUtc.start) - 10_000;
    });
    const decelDrop =
      decelBefore.length >= 2 &&
      (decelBefore[0].l3.speedKmh ?? 99) - (decelBefore[decelBefore.length - 1].l3.speedKmh ?? 0) >= 5;

    const buckets = [...st.gpsBuckets, ...follow.slice(0, 5).map(rowToBucket)];
    const { speedProfile, qcSummary } = summarizeBuckets(buckets);
    const certainty: EventCertainty = rise && decelDrop && st.certainty === 'CONFIRMED' ? 'CONFIRMED' : 'CANDIDATE';
    out.push({
      eventId: `EVT_STOPGO_${st.windowUtc.start.replace(/[:]/g, '')}`,
      eventType: 'STOP_AND_GO_CANDIDATE',
      certainty,
      windowUtc: { start: st.windowUtc.start, end: follow[Math.min(4, follow.length - 1)].evaluationIndexUtc },
      gpsBuckets: buckets,
      speedProfile,
      qcSummary,
      roadRefs: { osmWayId: null, junctionNodeId: null, associationOutcome: null },
      uncertainty: {
        class: certainty === 'CONFIRMED' ? 'MEDIUM' : 'HIGH',
        reasons: [
          rise ? 'POST_STANDSTILL_SPEED_RISE' : 'INSUFFICIENT_POST_RISE',
          decelDrop ? 'PRE_STOP_DECEL_PATTERN' : 'WEAK_PRE_DECEL',
          `standstill_certainty=${st.certainty}`,
        ],
      },
      linkedManeuverGroupId: null,
      notDriverIntentNotScore: true,
      evidenceProvenance: ['LDI08_COMBINED_SNAPSHOT'],
    });
  }
  return out;
}

export function maneuverLinkedEvents(
  group: Ldi10bGroup,
  rows: Ldi08Row[],
  assocByGroup: Map<string, { associationOutcome: string; nearestWayId: number | null }>,
  confirmedJunctions: Array<{ nodeId: number; lat: number; lon: number }>,
): DrivingEvent[] {
  const windowRows = rowsInInclusiveWindow(rows, group.windowUtc.start, group.windowUtc.end);
  const buckets = windowRows.map(rowToBucket);
  const { speedProfile, qcSummary } = summarizeBuckets(buckets);
  const spatial = matchManeuverTrajectory(group, rows);
  const assoc = assocByGroup.get(group.groupId);
  const centroid = spatial.centroid;
  let junctionNodeId: number | null = null;
  let minJ = Infinity;
  if (centroid) {
    for (const j of confirmedJunctions) {
      const d = haversineMeters(centroid.latitude, centroid.longitude, j.lat, j.lon);
      if (d < minJ) {
        minJ = d;
        junctionNodeId = j.nodeId;
      }
    }
  }
  const trustedFrac = qcSummary.trusted / Math.max(1, buckets.length - qcSummary.rowAbsent);
  const type: EventType =
    group.kind === 'DECELERATION' ? 'DECELERATION_APPROACH' : 'ACCELERATION_EXIT';
  const certainty: EventCertainty =
    trustedFrac >= 0.8 && qcSummary.rowAbsent === 0 ? 'CONFIRMED' : trustedFrac >= 0.5 ? 'CANDIDATE' : 'UNKNOWN';

  const base: DrivingEvent = {
    eventId: `EVT_${type}_${group.groupId}`,
    eventType: type,
    certainty,
    windowUtc: group.windowUtc,
    gpsBuckets: buckets,
    speedProfile,
    qcSummary,
    roadRefs: {
      osmWayId: assoc?.nearestWayId ?? null,
      junctionNodeId: minJ <= 45 ? junctionNodeId : null,
      associationOutcome: assoc?.associationOutcome ?? null,
    },
    uncertainty: {
      class: certainty === 'CONFIRMED' ? 'MEDIUM' : 'HIGH',
      reasons: [
        group.plausibilityVerdict,
        assoc?.associationOutcome === 'UNKNOWN' ? 'ROAD_ASSOCIATION_UNKNOWN' : 'ROAD_ASSOCIATION_PRESENT',
      ],
    },
    linkedManeuverGroupId: group.groupId,
    notDriverIntentNotScore: true,
    evidenceProvenance: ['LDI08_COMBINED_SNAPSHOT', 'LDI10B_MANEUVER_PHYSICS', 'LDI10D_MANEUVER_ROAD_ASSOCIATION'],
  };
  return [base];
}

export function detectCurveTraversals(rows: Ldi08Row[]): DrivingEvent[] {
  const gpsRows = rows.filter((r) => r.gps.availability === 'PRESENT' && r.gps.latitude != null);
  const events: DrivingEvent[] = [];
  for (let i = 2; i < gpsRows.length; i++) {
    const a = gpsRows[i - 2];
    const b = gpsRows[i - 1];
    const c = gpsRows[i];
    const h1 = bearingDeg(a.gps.latitude!, a.gps.longitude!, b.gps.latitude!, b.gps.longitude!);
    const h2 = bearingDeg(b.gps.latitude!, b.gps.longitude!, c.gps.latitude!, c.gps.longitude!);
    const delta = headingDelta(h1, h2);
    if (delta < 20) continue;
    const slice = [a, b, c];
    const buckets = slice.map(rowToBucket);
    const { speedProfile, qcSummary } = summarizeBuckets(buckets);
    const allTrusted = slice.every((x) => isQcTrustedForConfirmation(x.l3.qcTrustLevel));
    const certainty: EventCertainty = delta >= 35 && allTrusted ? 'CONFIRMED' : delta >= 20 ? 'CANDIDATE' : 'UNKNOWN';
    events.push({
      eventId: `EVT_CURVE_${b.evaluationIndexUtc.replace(/[:]/g, '')}`,
      eventType: 'CURVE_TRAVERSAL',
      certainty,
      windowUtc: { start: a.evaluationIndexUtc, end: c.evaluationIndexUtc },
      gpsBuckets: buckets,
      speedProfile,
      qcSummary,
      roadRefs: { osmWayId: null, junctionNodeId: null, associationOutcome: null },
      uncertainty: {
        class: allTrusted ? 'MEDIUM' : 'HIGH',
        reasons: [`heading_step_delta_deg=${delta.toFixed(1)}`, 'no_lateral_accel_measurement'],
      },
      linkedManeuverGroupId: null,
      notDriverIntentNotScore: true,
      evidenceProvenance: ['LDI08_COMBINED_SNAPSHOT.gps'],
    });
  }
  return mergeAdjacentEvents(events, 'CURVE_TRAVERSAL', 3);
}

function mergeAdjacentEvents(events: DrivingEvent[], type: EventType, maxGapSec: number): DrivingEvent[] {
  const filtered = events.filter((e) => e.eventType === type).sort((a, b) => Date.parse(a.windowUtc.start) - Date.parse(b.windowUtc.start));
  if (filtered.length === 0) return [];
  const merged: DrivingEvent[] = [];
  let cur = filtered[0];
  for (let i = 1; i < filtered.length; i++) {
    const n = filtered[i];
    const gap = (Date.parse(n.windowUtc.start) - Date.parse(cur.windowUtc.end)) / 1000;
    if (gap <= maxGapSec) {
      cur = {
        ...cur,
        windowUtc: { start: cur.windowUtc.start, end: n.windowUtc.end },
        gpsBuckets: [...cur.gpsBuckets, ...n.gpsBuckets],
      };
    } else {
      merged.push(cur);
      cur = n;
    }
  }
  merged.push(cur);
  return merged;
}

export function detectJunctionApproaches(
  rows: Ldi08Row[],
  confirmedJunctions: Array<{ nodeId: number; lat: number; lon: number }>,
  ways: ReturnType<typeof parseOverpassElements>['ways'],
): DrivingEvent[] {
  const events: DrivingEvent[] = [];
  const radiusM = 35;
  for (const r of rows) {
    if (r.gps.availability !== 'PRESENT' || r.gps.latitude == null) continue;
    let best: { nodeId: number; d: number } | null = null;
    for (const j of confirmedJunctions) {
      const d = haversineMeters(r.gps.latitude!, r.gps.longitude!, j.lat, j.lon);
      if (d <= radiusM && (!best || d < best.d)) best = { nodeId: j.nodeId, d };
    }
    if (!best) continue;
    const wayHits = nearestWayCandidates(r.gps.latitude!, r.gps.longitude!, ways, DEFAULT_UNCERTAINTY_RADIUS_M);
    const buckets = [rowToBucket(r)];
    const { speedProfile, qcSummary } = summarizeBuckets(buckets);
    const certainty: EventCertainty = isQcTrustedForConfirmation(r.l3.qcTrustLevel) ? 'CONFIRMED' : 'CANDIDATE';
    events.push({
      eventId: `EVT_JUNCTION_${r.evaluationIndexUtc.replace(/[:]/g, '')}_${best.nodeId}`,
      eventType: 'JUNCTION_APPROACH',
      certainty,
      windowUtc: { start: r.evaluationIndexUtc, end: r.evaluationIndexUtc },
      gpsBuckets: buckets,
      speedProfile,
      qcSummary,
      roadRefs: {
        osmWayId: wayHits[0]?.way.osmId ?? null,
        junctionNodeId: best.nodeId,
        associationOutcome: null,
      },
      uncertainty: {
        class: best.d <= 20 ? 'MEDIUM' : 'HIGH',
        reasons: [`distance_to_confirmed_junction_m=${best.d.toFixed(1)}`, 'ambiguous_nodes_excluded'],
      },
      linkedManeuverGroupId: null,
      notDriverIntentNotScore: true,
      evidenceProvenance: ['LDI08_COMBINED_SNAPSHOT', 'LDI10D_PHASE2B_CONFIRMED_JUNCTIONS'],
    });
  }
  return mergeAdjacentEvents(events, 'JUNCTION_APPROACH', 2);
}

export function detectTurnCandidates(
  junctionEvents: DrivingEvent[],
  curveEvents: DrivingEvent[],
): DrivingEvent[] {
  const out: DrivingEvent[] = [];
  for (const j of junctionEvents) {
    if (j.certainty === 'UNKNOWN') continue;
    const t0 = Date.parse(j.windowUtc.start);
    const curve = curveEvents.find((c) => {
      const t = Date.parse(c.windowUtc.start);
      return Math.abs(t - t0) <= 4000;
    });
    if (!curve) continue;
    const buckets = [...j.gpsBuckets, ...curve.gpsBuckets];
    const { speedProfile, qcSummary } = summarizeBuckets(buckets);
    out.push({
      eventId: `EVT_TURN_${j.windowUtc.start.replace(/[:]/g, '')}`,
      eventType: 'TURN_CANDIDATE',
      certainty: curve.certainty === 'CONFIRMED' && j.certainty === 'CONFIRMED' ? 'CANDIDATE' : 'UNKNOWN',
      windowUtc: { start: j.windowUtc.start, end: curve.windowUtc.end },
      gpsBuckets: buckets,
      speedProfile,
      qcSummary,
      roadRefs: j.roadRefs,
      uncertainty: {
        class: 'HIGH',
        reasons: ['junction_plus_heading_change', 'not_confirmed_turn_without_independent_geometry'],
      },
      linkedManeuverGroupId: null,
      notDriverIntentNotScore: true,
      evidenceProvenance: j.evidenceProvenance,
    });
  }
  return out;
}

export function detectUnresolvedGaps(rows: Ldi08Row[]): DrivingEvent[] {
  const events: DrivingEvent[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].gps.availability !== 'ROW_ABSENT') {
      i += 1;
      continue;
    }
    const start = i;
    while (i < rows.length && rows[i].gps.availability === 'ROW_ABSENT') i += 1;
    const slice = rows.slice(start, i);
    const buckets = slice.map(rowToBucket);
    const { speedProfile, qcSummary } = summarizeBuckets(buckets);
    events.push({
      eventId: `EVT_UNRESOLVED_GAP_${slice[0].evaluationIndexUtc.replace(/[:]/g, '')}`,
      eventType: 'UNRESOLVED_EVENT',
      certainty: 'UNKNOWN',
      windowUtc: { start: slice[0].evaluationIndexUtc, end: slice[slice.length - 1].evaluationIndexUtc },
      gpsBuckets: buckets,
      speedProfile,
      qcSummary,
      roadRefs: { osmWayId: null, junctionNodeId: null, associationOutcome: null },
      uncertainty: { class: 'UNKNOWN', reasons: ['ROW_ABSENT_GPS', 'no_interpolation'] },
      linkedManeuverGroupId: null,
      notDriverIntentNotScore: true,
      evidenceProvenance: ['LDI08_COMBINED_SNAPSHOT'],
    });
  }
  return events;
}

export function auditStopAndGoZero(rows: Ldi08Row[]): {
  phase2bStopGoSupported: 0;
  whyZeroConfirmed: string[];
  lowSpeedBucketCounts: { lte3Trusted: number; lte5Trusted: number; lte8Any: number };
  nearMissExamples: Array<Record<string, unknown>>;
  maneuverWindowOnlyLimitation: string;
} {
  let lte3Trusted = 0;
  let lte5Trusted = 0;
  let lte8Any = 0;
  const nearMiss: Array<Record<string, unknown>> = [];
  for (const r of rows) {
    const s = r.l3.speedKmh;
    if (s == null) continue;
    if (s <= 8) lte8Any += 1;
    if (s <= 5 && isQcTrustedForConfirmation(r.l3.qcTrustLevel)) lte5Trusted += 1;
    if (s <= 3 && isQcTrustedForConfirmation(r.l3.qcTrustLevel)) lte3Trusted += 1;
    if (s <= 8 && s > 3) {
      nearMiss.push({
        utc: r.evaluationIndexUtc,
        speedKmh: s,
        qc: r.l3.qcTrustLevel,
        reason: 'above_3kph_standstill_threshold',
      });
    }
  }
  return {
    phase2bStopGoSupported: 0,
    whyZeroConfirmed: [
      'Phase 2B tested stop-and-go only inside 32 maneuver windows with rule minSpeed<8 and before/after rebound within same window.',
      'Trip-wide standstill requires speed<=3kph; trip minimum trusted speeds largely remain above 3kph during motion.',
      'No 2+ second trusted standstill sequence with confirmed post-rise and pre-decel in same reconstructed chain.',
      'QC UNTRUSTED buckets at low speed prevent CONFIRMED classification where speed dips occur.',
    ],
    lowSpeedBucketCounts: { lte3Trusted, lte5Trusted, lte8Any },
    nearMissExamples: nearMiss.slice(0, 12),
    maneuverWindowOnlyLimitation:
      'Maneuver-centric windows miss trip-level stop-and-go spanning gap between groups.',
  };
}

export function buildPhase3aTimeline(repoRoot: string): {
  events: DrivingEvent[];
  counts: Record<EventType, { confirmed: number; candidate: number; unknown: number }>;
  stopAndGoAudit: ReturnType<typeof auditStopAndGoZero>;
  controlComparison: Record<string, unknown>;
} {
  const { snapshot } = loadLdi08Artifacts(repoRoot);
  const rows = snapshot.rows;
  const groups = loadLdi10bGroups(repoRoot);
  const base10d = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');
  const frozen = JSON.parse(
    fs.readFileSync(path.join(base10d, 'LDI10D_OSM_FROZEN_SNAPSHOT.json'), 'utf8'),
  ) as { overpassResponse: unknown };
  const topo = parseFrozenTopologyElements(
    frozen.overpassResponse as { elements?: Array<Record<string, unknown>> },
  );
  const graph = buildDrivableGraph({
    ways: topo.ways,
    pedestrianCrossingNodeIds: topo.pedestrianCrossingNodeIds,
    nodeCoords: topo.nodeCoords,
  });
  const confirmedJunctions = graph.junctionCandidates
    .filter((j) => j.classification === 'CONFIRMED_TOPOLOGY')
    .map((j) => ({ nodeId: j.nodeId, lat: j.lat, lon: j.lon }));

  const parsed = parseOverpassElements(frozen.overpassResponse as { elements?: Array<Record<string, unknown>> });
  const assocDoc = JSON.parse(
    fs.readFileSync(path.join(base10d, 'LDI10D_MANEUVER_ROAD_ASSOCIATION.json'), 'utf8'),
  ) as {
    associations: Array<{ groupId: string; associationOutcome: string; nearestWay?: { osmWayId: number } }>;
  };
  const assocByGroup = new Map(
    assocDoc.associations.map((a) => [
      a.groupId,
      {
        associationOutcome: a.associationOutcome,
        nearestWayId: a.nearestWay?.osmWayId ?? null,
      },
    ]),
  );

  const standstills = detectStandstillSequences(rows);
  const stopGo = detectStopAndGoCandidates(rows, standstills);
  const maneuverEvents = groups.flatMap((g) =>
    maneuverLinkedEvents(g, rows, assocByGroup, confirmedJunctions),
  );
  const curves = detectCurveTraversals(rows);
  const junctions = detectJunctionApproaches(rows, confirmedJunctions, parsed.ways);
  const turns = detectTurnCandidates(junctions, curves);
  const unresolved = detectUnresolvedGaps(rows);

  const events = [
    ...maneuverEvents,
    ...standstills,
    ...stopGo,
    ...curves,
    ...junctions,
    ...turns,
    ...unresolved,
  ].sort((a, b) => Date.parse(a.windowUtc.start) - Date.parse(b.windowUtc.start));

  const counts = {} as Record<EventType, { confirmed: number; candidate: number; unknown: number }>;
  for (const t of EVENT_TYPES) counts[t] = { confirmed: 0, candidate: 0, unknown: 0 };
  for (const e of events) counts[e.eventType][e.certainty.toLowerCase() as 'confirmed' | 'candidate' | 'unknown'] += 1;

  const unclear = groups.filter((g) => g.kind === 'ACCELERATION' && g.plausibilityVerdict === 'UNCLEAR_QC_OR_GAPS');
  const plausible = groups.filter((g) => g.kind === 'ACCELERATION' && g.plausibilityVerdict === 'PLAUSIBLE');

  const controlComparison = {
    unclearAccelerationIds: unclear.map((g) => g.groupId),
    plausibleAccelerationIds: plausible.map((g) => g.groupId),
    pairs: unclear.map((u) => {
      const ev = maneuverEvents.find((e) => e.linkedManeuverGroupId === u.groupId);
      const junc = ev?.roadRefs.junctionNodeId;
      return {
        unclearGroup: u.groupId,
        maneuverEventCertainty: ev?.certainty,
        roadAssociation: ev?.roadRefs.associationOutcome,
        junctionNodeId: junc,
        spatialTemporalAddsQcExplanation: false,
        spatialTemporalAddsMapContext: junc != null || ev?.roadRefs.osmWayId != null,
      };
    }),
    qcNotOverwritten: true,
  };

  return {
    events,
    counts,
    stopAndGoAudit: auditStopAndGoZero(rows),
    controlComparison,
  };
}

export function verifyPhase3aPreflight(repoRoot: string): ReturnType<typeof verifyPhase2bPreflight> {
  return verifyPhase2bPreflight(repoRoot);
}
