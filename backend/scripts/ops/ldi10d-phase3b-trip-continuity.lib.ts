/**
 * LDI-10D Phase 3B — trip-wide continuity & stop-and-go forensics.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import { loadLdi08Artifacts, type Ldi08Row } from './ldi09-accel-decel-signal-forensics.lib';
import { bearingDeg, loadLdi10bGroups } from './ldi10c-spatial-trip-reconstruction.lib';
import {
  DEFAULT_UNCERTAINTY_RADIUS_M,
  nearestWayCandidates,
  parseOverpassElements,
} from './ldi10d-phase2-osm-road-context.lib';
import {
  buildDrivableGraph,
  parseFrozenTopologyElements,
  verifyPhase2bPreflight,
} from './ldi10d-phase2b-topology-forensics.lib';
import {
  buildPhase3aTimeline,
  type DrivingEvent,
} from './ldi10d-phase3a-temporal-events.lib';

export const EVIDENCE_CLASSES = [
  'OBSERVED_STANDSTILL',
  'LOW_SPEED_CANDIDATE',
  'STOP_AND_GO_CANDIDATE',
  'QC_BLOCKED',
  'GAP_INTERRUPTED',
  'NO_EVIDENCE',
] as const;

export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export const PHASE3A_EXPECTED = {
  eventsTotal: 69,
  confirmed: 31,
  candidate: 24,
  unknown: 14,
  standstillConfirmed: 0,
  stopGoConfirmed: 0,
};

function isTrusted(qc: string): boolean {
  return qc === 'TRUSTED' || qc === 'TRUSTED_LIMITED';
}

export type TripBucket = {
  utc: string;
  gpsAvailability: string;
  lat: number | null;
  lon: number | null;
  speedKmh: number | null;
  speedDeltaKmh: number | null;
  l3Qc: string;
  rowAbsent: boolean;
  maneuverGroupIds: string[];
  nearestConfirmedJunctionM: number | null;
  nearestConfirmedJunctionNodeId: number | null;
  nearestOsmWayId: number | null;
};

export type LowSpeedInterval = {
  intervalId: string;
  windowUtc: { start: string; end: string };
  durationSec: number;
  bucketCount: number;
  minSpeedKmh: number;
  maxSpeedKmh: number;
  speedSequence: Array<{ utc: string; speedKmh: number | null; qc: string; gps: string }>;
  evidenceClass: EvidenceClass;
  classificationReasons: string[];
  gapAdjacent: boolean;
  qcBlockedBuckets: number;
  linkedManeuverGroupIds: string[];
  stopGoCandidate: boolean;
  notInferredRealStop: true;
};

export function verifyPhase3bPreflight(repoRoot: string): {
  ok: boolean;
  errors: string[];
  inputIntegrity: 'PASS' | 'FAIL';
  phase3aDrift: 'NONE' | 'DRIFT';
} {
  const errors: string[] = [];
  const p2 = verifyPhase2bPreflight(repoRoot);
  if (!p2.ok) errors.push(...p2.errors);

  const p3aPath = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3A_EVENT_TIMELINE.json',
  );
  if (!fs.existsSync(p3aPath)) {
    errors.push('missing phase3a timeline');
    return { ok: false, errors, inputIntegrity: 'FAIL', phase3aDrift: 'DRIFT' };
  }
  const p3a = JSON.parse(fs.readFileSync(p3aPath, 'utf8')) as {
    totals: { confirmed: number; candidate: number; unknown: number };
    events: unknown[];
    maneuverGroupsUnchanged: number;
  };
  if (p3a.events.length !== PHASE3A_EXPECTED.eventsTotal) {
    errors.push(`phase3a events ${p3a.events.length}`);
  }
  if (p3a.totals.confirmed !== PHASE3A_EXPECTED.confirmed) errors.push('phase3a confirmed drift');
  if (p3a.totals.candidate !== PHASE3A_EXPECTED.candidate) errors.push('phase3a candidate drift');
  if (p3a.totals.unknown !== PHASE3A_EXPECTED.unknown) errors.push('phase3a unknown drift');

  const replay = buildPhase3aTimeline(repoRoot);
  const rc = replay.events.length;
  const drift =
    rc !== PHASE3A_EXPECTED.eventsTotal
      ? 'DRIFT'
      : 'NONE';
  if (drift === 'DRIFT') errors.push(`phase3a replay events=${rc}`);

  return {
    ok: errors.length === 0,
    errors,
    inputIntegrity: errors.length === 0 ? 'PASS' : 'FAIL',
    phase3aDrift: drift,
  };
}

function maneuverOverlaps(groups: ReturnType<typeof loadLdi10bGroups>, utc: string): string[] {
  const t = Date.parse(utc);
  return groups
    .filter((g) => t >= Date.parse(g.windowUtc.start) && t <= Date.parse(g.windowUtc.end))
    .map((g) => g.groupId);
}

export function buildTripBuckets(repoRoot: string): TripBucket[] {
  const { snapshot } = loadLdi08Artifacts(repoRoot);
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

  const out: TripBucket[] = [];
  let prevSpeed: number | null = null;
  for (const r of snapshot.rows) {
    const speed = r.l3.speedKmh ?? null;
    const delta = speed != null && prevSpeed != null ? speed - prevSpeed : null;
    if (speed != null) prevSpeed = speed;
    let nearestJunctionM: number | null = null;
    let junctionNodeId: number | null = null;
    let wayId: number | null = null;
    if (r.gps.availability === 'PRESENT' && r.gps.latitude != null) {
      for (const j of confirmedJunctions) {
        const d = haversineMeters(r.gps.latitude!, r.gps.longitude!, j.lat, j.lon);
        if (nearestJunctionM == null || d < nearestJunctionM) {
          nearestJunctionM = d;
          junctionNodeId = j.nodeId;
        }
      }
      const hits = nearestWayCandidates(
        r.gps.latitude!,
        r.gps.longitude!,
        parsed.ways,
        DEFAULT_UNCERTAINTY_RADIUS_M,
      );
      wayId = hits[0]?.way.osmId ?? null;
    }
    out.push({
      utc: r.evaluationIndexUtc,
      gpsAvailability: String(r.gps.availability),
      lat: r.gps.latitude ?? null,
      lon: r.gps.longitude ?? null,
      speedKmh: speed,
      speedDeltaKmh: delta,
      l3Qc: String(r.l3.qcTrustLevel),
      rowAbsent: r.gps.availability === 'ROW_ABSENT',
      maneuverGroupIds: maneuverOverlaps(groups, r.evaluationIndexUtc),
      nearestConfirmedJunctionM: nearestJunctionM,
      nearestConfirmedJunctionNodeId: junctionNodeId,
      nearestOsmWayId: wayId,
    });
  }
  return out;
}

function hasGapAdjacent(rows: Ldi08Row[], startIdx: number, endIdx: number): boolean {
  const lo = Math.max(0, startIdx - 1);
  const hi = Math.min(rows.length - 1, endIdx + 1);
  for (let i = lo; i <= hi; i++) {
    if (rows[i].gps.availability === 'ROW_ABSENT') return true;
  }
  return false;
}

export function detectLowSpeedIntervals(
  rows: Ldi08Row[],
  groups: ReturnType<typeof loadLdi10bGroups>,
  speedThresholdKmh: number,
  minDurationSec: number,
): LowSpeedInterval[] {
  const intervals: LowSpeedInterval[] = [];
  let i = 0;
  while (i < rows.length) {
    const r = rows[i];
    const sp = r.l3.speedKmh;
    const gpsOk = r.gps.availability === 'PRESENT';
    if (!gpsOk || sp == null || sp > speedThresholdKmh) {
      i += 1;
      continue;
    }
    const startIdx = i;
    while (
      i < rows.length &&
      rows[i].gps.availability === 'PRESENT' &&
      rows[i].l3.speedKmh != null &&
      rows[i].l3.speedKmh! <= speedThresholdKmh
    ) {
      i += 1;
    }
    const slice = rows.slice(startIdx, i);
    const speeds = slice.map((x) => x.l3.speedKmh!).filter((s) => s != null);
    const durationSec = slice.length - 1;
    const seq = slice.map((x) => ({
      utc: x.evaluationIndexUtc,
      speedKmh: x.l3.speedKmh,
      qc: String(x.l3.qcTrustLevel),
      gps: String(x.gps.availability),
    }));
    const qcBlocked = slice.filter((x) => !isTrusted(String(x.l3.qcTrustLevel))).length;
    const allTrusted = qcBlocked === 0;
    const gapAdj = hasGapAdjacent(rows, startIdx, i - 1);
    const minSp = Math.min(...speeds);
    const linked = [
      ...new Set(slice.flatMap((x) => maneuverOverlaps(groups, x.evaluationIndexUtc))),
    ];

    let evidenceClass: EvidenceClass = 'LOW_SPEED_CANDIDATE';
    const reasons: string[] = [];

    if (slice.some((x) => x.l3.speedKmh == null)) {
      evidenceClass = 'NO_EVIDENCE';
      reasons.push('MISSING_SPEED_NUMERIC');
    } else if (gapAdj) {
      evidenceClass = 'GAP_INTERRUPTED';
      reasons.push('ROW_ABSENT_ADJACENT_OR_INTERNAL');
    } else if (qcBlocked > 0 && qcBlocked === slice.length) {
      evidenceClass = 'QC_BLOCKED';
      reasons.push('ALL_BUCKETS_UNTRUSTED_QC');
    } else if (
      speedThresholdKmh <= 3 &&
      allTrusted &&
      durationSec >= minDurationSec &&
      minSp <= 3
    ) {
      evidenceClass = 'OBSERVED_STANDSTILL';
      reasons.push('MEETS_3KPH_2S_TRUSTED_RULE');
    } else if (minSp > 3 && speedThresholdKmh <= 3) {
      evidenceClass = 'NO_EVIDENCE';
      reasons.push('THRESHOLD_3KPH_NEVER_MET_WITH_TRUSTED_GPS');
    } else if (qcBlocked > 0) {
      evidenceClass = 'QC_BLOCKED';
      reasons.push('PARTIAL_UNTRUSTED_QC_IN_INTERVAL');
    } else {
      evidenceClass = 'LOW_SPEED_CANDIDATE';
      reasons.push(`LOW_SPEED_LEQ_${speedThresholdKmh}KPH`);
    }

    const pre = rows.slice(Math.max(0, startIdx - 5), startIdx);
    const post = rows.slice(i, Math.min(rows.length, i + 5));
    const preDrop =
      pre.length >= 2 &&
      (pre[0].l3.speedKmh ?? 0) - (pre[pre.length - 1].l3.speedKmh ?? 0) >= 4;
    const postRise =
      post.length >= 2 &&
      (post[post.length - 1].l3.speedKmh ?? 0) - (post[0].l3.speedKmh ?? 0) >= 4;
    const stopGoCandidate =
      evidenceClass === 'LOW_SPEED_CANDIDATE' && preDrop && postRise && durationSec >= 1;

    if (stopGoCandidate) reasons.push('PRE_DECEL_POST_ACCEL_PATTERN');

    intervals.push({
      intervalId: `LSI_${slice[0].evaluationIndexUtc.replace(/[:]/g, '')}`,
      windowUtc: { start: slice[0].evaluationIndexUtc, end: slice[slice.length - 1].evaluationIndexUtc },
      durationSec,
      bucketCount: slice.length,
      minSpeedKmh: minSp,
      maxSpeedKmh: Math.max(...speeds),
      speedSequence: seq,
      evidenceClass: stopGoCandidate && evidenceClass === 'LOW_SPEED_CANDIDATE'
        ? 'STOP_AND_GO_CANDIDATE'
        : evidenceClass,
      classificationReasons: reasons,
      gapAdjacent: gapAdj,
      qcBlockedBuckets: qcBlocked,
      linkedManeuverGroupIds: linked,
      stopGoCandidate,
      notInferredRealStop: true,
    });
  }
  return intervals;
}

export type ThresholdSensitivityRow = {
  speedThresholdKmh: number;
  minDurationSec: number;
  intervalsFound: number;
  byClass: Record<EvidenceClass, number>;
  qcBlocked: number;
  falsePositiveRiskNote: string;
};

export function thresholdSensitivity(rows: Ldi08Row[], groups: ReturnType<typeof loadLdi10bGroups>): ThresholdSensitivityRow[] {
  const thresholds = [3, 5, 8];
  const durations = [1, 2];
  const out: ThresholdSensitivityRow[] = [];
  for (const sp of thresholds) {
    for (const dur of durations) {
      const ints = detectLowSpeedIntervals(rows, groups, sp, dur);
      const byClass: Record<string, number> = {};
      for (const c of EVIDENCE_CLASSES) byClass[c] = 0;
      for (const x of ints) byClass[x.evidenceClass] = (byClass[x.evidenceClass] ?? 0) + 1;
      out.push({
        speedThresholdKmh: sp,
        minDurationSec: dur,
        intervalsFound: ints.length,
        byClass: byClass as Record<EvidenceClass, number>,
        qcBlocked: ints.filter((x) => x.evidenceClass === 'QC_BLOCKED').length,
        falsePositiveRiskNote:
          sp >= 8
            ? 'Creep/traffic-roll without full stop — high FP for true standstill'
            : sp >= 5
              ? 'Parking-lot speeds — medium FP'
              : 'No trusted samples at <=3 on this trip — zero standstill confirmations expected',
      });
    }
  }
  return out;
}

export function analyzeGaps(rows: Ldi08Row[]): Array<{
  startUtc: string;
  endUtc: string;
  bucketCount: number;
  adjacentLowSpeed: boolean;
}> {
  const gaps: Array<{ startUtc: string; endUtc: string; bucketCount: number; adjacentLowSpeed: boolean }> = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].gps.availability !== 'ROW_ABSENT') {
      i += 1;
      continue;
    }
    const s = i;
    while (i < rows.length && rows[i].gps.availability === 'ROW_ABSENT') i += 1;
    const slice = rows.slice(s, i);
    const before = s > 0 ? rows[s - 1] : null;
    const after = i < rows.length ? rows[i] : null;
    const adjLow =
      (before?.l3.speedKmh != null && before.l3.speedKmh <= 8) ||
      (after?.l3.speedKmh != null && after.l3.speedKmh <= 8);
    gaps.push({
      startUtc: slice[0].evaluationIndexUtc,
      endUtc: slice[slice.length - 1].evaluationIndexUtc,
      bucketCount: slice.length,
      adjacentLowSpeed: adjLow,
    });
  }
  return gaps;
}

export type CaseStudy = {
  caseId: string;
  theme: string;
  windowUtc: { start: string; end: string };
  durationSec: number;
  gpsPoints: Array<{ utc: string; lat: number | null; lon: number | null }>;
  speedSequence: Array<{ utc: string; speedKmh: number | null; qc: string }>;
  maneuverGroupId: string | null;
  osmWayId: number | null;
  junctionNodeId: number | null;
  evidenceClass: EvidenceClass | string;
  rationale: string;
  openQuestions: string[];
};

export function buildCaseStudies(
  buckets: TripBucket[],
  intervals: LowSpeedInterval[],
  phase3aEvents: DrivingEvent[],
  assoc: Map<string, { outcome: string; wayId: number | null }>,
): CaseStudy[] {
  const cases: CaseStudy[] = [];

  const decel = phase3aEvents.find((e) => e.eventType === 'DECELERATION_APPROACH' && e.certainty === 'CONFIRMED');
  if (decel) {
    cases.push({
      caseId: 'CS_DECEL_CONFIRMED',
      theme: 'Verzögerung',
      windowUtc: decel.windowUtc,
      durationSec: (Date.parse(decel.windowUtc.end) - Date.parse(decel.windowUtc.start)) / 1000,
      gpsPoints: decel.gpsBuckets.map((b) => ({ utc: b.utc, lat: b.lat, lon: b.lon })),
      speedSequence: decel.gpsBuckets.map((b) => ({ utc: b.utc, speedKmh: b.speedKmh, qc: b.l3Qc })),
      maneuverGroupId: decel.linkedManeuverGroupId,
      osmWayId: decel.roadRefs.osmWayId,
      junctionNodeId: decel.roadRefs.junctionNodeId,
      evidenceClass: 'DECELERATION_APPROACH_CONFIRMED',
      rationale: 'Manöverfenster mit überwiegend TRUSTED L3 und negativem Geschwindigkeitsgradient.',
      openQuestions: ['Bremspedal/regen nicht beobachtbar', 'Signalphase UNKNOWN'],
    });
  }

  const unclearAccel = phase3aEvents.find(
    (e) =>
      e.eventType === 'ACCELERATION_EXIT' &&
      e.linkedManeuverGroupId &&
      assoc.get(e.linkedManeuverGroupId!)?.outcome === 'UNKNOWN',
  );
  if (unclearAccel) {
    cases.push({
      caseId: 'CS_ACCEL_QC_UNCLEAR',
      theme: 'Beschleunigung + QC-Konflikt',
      windowUtc: unclearAccel.windowUtc,
      durationSec: (Date.parse(unclearAccel.windowUtc.end) - Date.parse(unclearAccel.windowUtc.start)) / 1000,
      gpsPoints: unclearAccel.gpsBuckets.map((b) => ({ utc: b.utc, lat: b.lat, lon: b.lon })),
      speedSequence: unclearAccel.gpsBuckets.map((b) => ({ utc: b.utc, speedKmh: b.speedKmh, qc: b.l3Qc })),
      maneuverGroupId: unclearAccel.linkedManeuverGroupId,
      osmWayId: unclearAccel.roadRefs.osmWayId,
      junctionNodeId: unclearAccel.roadRefs.junctionNodeId,
      evidenceClass: 'ACCELERATION_EXIT_UNKNOWN_ROAD',
      rationale: 'UNCLEAR_QC_OR_GAPS Manöver; Straßenassoziation UNKNOWN trotz GPS.',
      openQuestions: ['L3 QC Konflikt vs Karte unabhängig', 'Kein Ampelstatus'],
    });
  }

  const curve = phase3aEvents.find((e) => e.eventType === 'CURVE_TRAVERSAL');
  if (curve) {
    cases.push({
      caseId: 'CS_CURVE_CANDIDATE',
      theme: 'Kurve',
      windowUtc: curve.windowUtc,
      durationSec: (Date.parse(curve.windowUtc.end) - Date.parse(curve.windowUtc.start)) / 1000,
      gpsPoints: curve.gpsBuckets.map((b) => ({ utc: b.utc, lat: b.lat, lon: b.lon })),
      speedSequence: curve.gpsBuckets.map((b) => ({ utc: b.utc, speedKmh: b.speedKmh, qc: b.l3Qc })),
      maneuverGroupId: null,
      osmWayId: null,
      junctionNodeId: null,
      evidenceClass: 'CURVE_TRAVERSAL_CANDIDATE',
      rationale: 'GPS-Richtungsänderung ohne Querbeschleunigungsmessung.',
      openQuestions: ['OSM-Krümmung nicht metrisch verifiziert in 3B'],
    });
  }

  const junc = phase3aEvents.find((e) => e.eventType === 'JUNCTION_APPROACH' && e.certainty === 'CONFIRMED');
  if (junc) {
    cases.push({
      caseId: 'CS_JUNCTION_APPROACH',
      theme: 'Kreuzungsannäherung',
      windowUtc: junc.windowUtc,
      durationSec: 0,
      gpsPoints: junc.gpsBuckets.map((b) => ({ utc: b.utc, lat: b.lat, lon: b.lon })),
      speedSequence: junc.gpsBuckets.map((b) => ({ utc: b.utc, speedKmh: b.speedKmh, qc: b.l3Qc })),
      maneuverGroupId: null,
      osmWayId: junc.roadRefs.osmWayId,
      junctionNodeId: junc.roadRefs.junctionNodeId,
      evidenceClass: 'JUNCTION_APPROACH_CONFIRMED',
      rationale: 'Bucket innerhalb 35 m eines CONFIRMED_TOPOLOGY-Knotens (Phase 2B).',
      openQuestions: ['Kein Nachweis vollständigen Halt an Kreuzung', '114 ambiguous nodes excluded'],
    });
  }

  const plausibleAccel = phase3aEvents.find(
    (e) => e.eventType === 'ACCELERATION_EXIT' && e.certainty === 'CONFIRMED',
  );
  if (plausibleAccel) {
    cases.push({
      caseId: 'CS_ACCEL_PLAUSIBLE',
      theme: 'Beschleunigung (PLAUSIBLE Kontrolle)',
      windowUtc: plausibleAccel.windowUtc,
      durationSec: (Date.parse(plausibleAccel.windowUtc.end) - Date.parse(plausibleAccel.windowUtc.start)) / 1000,
      gpsPoints: plausibleAccel.gpsBuckets.map((b) => ({ utc: b.utc, lat: b.lat, lon: b.lon })),
      speedSequence: plausibleAccel.gpsBuckets.map((b) => ({ utc: b.utc, speedKmh: b.speedKmh, qc: b.l3Qc })),
      maneuverGroupId: plausibleAccel.linkedManeuverGroupId,
      osmWayId: plausibleAccel.roadRefs.osmWayId,
      junctionNodeId: plausibleAccel.roadRefs.junctionNodeId,
      evidenceClass: 'ACCELERATION_EXIT_CONFIRMED',
      rationale: 'PLAUSIBLE Manöver mit überwiegend TRUSTED QC — Kontrollgruppe zu UNCLEAR.',
      openQuestions: ['Fahrstil-Score nicht abgeleitet', 'Kausalität Kreuzung UNKNOWN'],
    });
  }

  const gapBucket = buckets.find((b) => b.rowAbsent);
  if (gapBucket) {
    cases.push({
      caseId: 'CS_ROW_ABSENT_GAP',
      theme: 'Fehlende GPS-Buckets',
      windowUtc: { start: gapBucket.utc, end: gapBucket.utc },
      durationSec: 0,
      gpsPoints: [{ utc: gapBucket.utc, lat: null, lon: null }],
      speedSequence: [{ utc: gapBucket.utc, speedKmh: gapBucket.speedKmh, qc: gapBucket.l3Qc }],
      maneuverGroupId: gapBucket.maneuverGroupIds[0] ?? null,
      osmWayId: null,
      junctionNodeId: null,
      evidenceClass: 'GAP_INTERRUPTED',
      rationale: 'ROW_ABSENT — keine Interpolation, zeitliche Kontinuität unterbrochen.',
      openQuestions: ['Ereignis in Lücke nicht rekonstruierbar'],
    });
  }

  const low = intervals.find((x) => x.minSpeedKmh <= 6) ?? intervals[0];
  if (low) {
    cases.push({
      caseId: 'CS_LOW_SPEED_QC',
      theme: 'Niedriggeschwindigkeit / QC',
      windowUtc: low.windowUtc,
      durationSec: low.durationSec,
      gpsPoints: low.speedSequence.map((s) => {
        const b = buckets.find((x) => x.utc === s.utc);
        return { utc: s.utc, lat: b?.lat ?? null, lon: b?.lon ?? null };
      }),
      speedSequence: low.speedSequence,
      maneuverGroupId: low.linkedManeuverGroupIds[0] ?? null,
      osmWayId: buckets.find((x) => x.utc === low.windowUtc.start)?.nearestOsmWayId ?? null,
      junctionNodeId: buckets.find((x) => x.utc === low.windowUtc.start)?.nearestConfirmedJunctionNodeId ?? null,
      evidenceClass: low.evidenceClass,
      rationale: low.classificationReasons.join('; '),
      openQuestions: [
        'Trip-min trusted speed ~5.07 km/h — kein <=3 km/h Stillstand',
        'UNTRUSTED QC korreliert mit einigen Minima',
      ],
    });
  }

  return cases;
}

export function runPhase3bForensics(repoRoot: string): {
  buckets: TripBucket[];
  intervalsProduction: LowSpeedInterval[];
  sensitivity: ThresholdSensitivityRow[];
  gaps: ReturnType<typeof analyzeGaps>;
  caseStudies: CaseStudy[];
  counts: {
    observedStandstills: number;
    stopGoConfirmed: number;
    stopGoCandidates: number;
    qcBlockedIntervals: number;
    gapInterruptedIntervals: number;
    lowSpeedIntervals: number;
    junctionContextCases: number;
    curveContextCases: number;
  };
} {
  const { snapshot } = loadLdi08Artifacts(repoRoot);
  const groups = loadLdi10bGroups(repoRoot);
  const buckets = buildTripBuckets(repoRoot);
  const intervalsProduction = detectLowSpeedIntervals(snapshot.rows, groups, 3, 2);
  const sensitivity = thresholdSensitivity(snapshot.rows, groups);
  const gaps = analyzeGaps(snapshot.rows);
  const phase3a = buildPhase3aTimeline(repoRoot);

  const base10d = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');
  const assocDoc = JSON.parse(
    fs.readFileSync(path.join(base10d, 'LDI10D_MANEUVER_ROAD_ASSOCIATION.json'), 'utf8'),
  ) as { associations: Array<{ groupId: string; associationOutcome: string; nearestWay?: { osmWayId: number } }> };
  const assoc = new Map(
    assocDoc.associations.map((a) => [
      a.groupId,
      { outcome: a.associationOutcome, wayId: a.nearestWay?.osmWayId ?? null },
    ]),
  );

  const caseStudies = buildCaseStudies(buckets, intervalsProduction, phase3a.events, assoc);

  const ints8 = detectLowSpeedIntervals(snapshot.rows, groups, 8, 1);

  return {
    buckets,
    intervalsProduction,
    sensitivity,
    gaps,
    caseStudies,
    counts: {
      observedStandstills: intervalsProduction.filter((x) => x.evidenceClass === 'OBSERVED_STANDSTILL').length,
      stopGoConfirmed: 0,
      stopGoCandidates: ints8.filter((x) => x.evidenceClass === 'STOP_AND_GO_CANDIDATE').length,
      qcBlockedIntervals: ints8.filter((x) => x.evidenceClass === 'QC_BLOCKED').length,
      gapInterruptedIntervals: ints8.filter((x) => x.evidenceClass === 'GAP_INTERRUPTED').length,
      lowSpeedIntervals: ints8.filter((x) => x.evidenceClass === 'LOW_SPEED_CANDIDATE').length,
      junctionContextCases: phase3a.events.filter((e) => e.eventType === 'JUNCTION_APPROACH').length,
      curveContextCases: phase3a.events.filter((e) => e.eventType === 'CURVE_TRAVERSAL').length,
    },
  };
}
