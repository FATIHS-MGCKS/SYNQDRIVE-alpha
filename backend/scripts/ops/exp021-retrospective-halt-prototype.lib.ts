/**
 * EXP021 retrospective halt / gap event prototype (offline, post-trip, no production changes).
 */
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/geo/haversine';
import { CALIBRATION_UNSET_V0_BUNDLE } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/calibration/CALIBRATION_UNSET_V0';
import { bucketLabelToMs } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import type { DiV0SpeedQcPositionSample } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc.types';
import { EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC } from './exp021-ev-ground-truth-forensic-export.lib';
import { enumerateInclusive } from './exp021-stationary-offline-prototype.lib';

export const RETROSPECTIVE_HALT_PROTOTYPE_VERSION = 'EXP021_RETROSPECTIVE_HALT_PROTOTYPE_V0_1';

/** Below this displacement (m), no movement inference (GPS noise band). */
export const MIN_DISPLACEMENT_M_FOR_ANY_INFERENCE = CALIBRATION_UNSET_V0_BUNDLE.holdNoiseDisplacementM;

/** Higher bar before claiming MOVING from a single short leg (reduces scatter false-moves). */
export const MIN_DISPLACEMENT_M_FOR_MOVING_CLAIM = Math.max(2, CALIBRATION_UNSET_V0_BUNDLE.holdNoiseDisplacementM * 2.5);

export const GEOMETRY_THRESHOLDS = {
  nearStopMaxKmh: 1.5,
  slowRollMinKmh: 1.5,
  slowRollMaxKmh: CALIBRATION_UNSET_V0_BUNDLE.stopMovingBandMinKmh,
  movingMinKmh: CALIBRATION_UNSET_V0_BUNDLE.stopMovingBandMinKmh,
} as const;

export type GeometryMotionClass =
  | 'NEAR_STOP_GEOMETRY'
  | 'SLOW_ROLL_GEOMETRY'
  | 'MOVING_GEOMETRY'
  | 'INCONCLUSIVE_SCATTER'
  | 'NO_POSITION';

export type RetrospectiveExplanation =
  | 'LIKELY_HALT'
  | 'LIKELY_SLOW_ROLL_STOP_GO'
  | 'LIKELY_MOVING_WITH_GAP'
  | 'NOT_DISTINGUISHABLE';

export type EvidenceLine = {
  tier: 'SUPPORTS' | 'WEAK_SUPPORTS' | 'CONTRADICTS' | 'NEUTRAL';
  text: string;
  epistemic: 'CONFIRMED' | 'INFERRED';
};

export type PresentPoint = {
  bucketLabelUtc: string;
  lat: number;
  lon: number;
  positionState: string | null;
};

export function collectPresentPoints(positions: DiV0SpeedQcPositionSample[]): PresentPoint[] {
  return positions
    .filter((p) => p.availability === 'PRESENT' && p.latitude != null && p.longitude != null)
    .map((p) => ({
      bucketLabelUtc: p.bucketLabel,
      lat: p.latitude!,
      lon: p.longitude!,
      positionState: p.positionState ?? null,
    }))
    .sort((a, b) => a.bucketLabelUtc.localeCompare(b.bucketLabelUtc));
}

export function legSpeedKmh(
  from: PresentPoint,
  to: PresentPoint,
  dtSec: number,
): { kmh: number | null; displacementM: number; scatterFiltered: boolean } {
  const d = haversineMeters(from.lat, from.lon, to.lat, to.lon);
  if (d < MIN_DISPLACEMENT_M_FOR_ANY_INFERENCE) {
    return { kmh: null, displacementM: d, scatterFiltered: true };
  }
  if (dtSec <= 0) return { kmh: null, displacementM: d, scatterFiltered: false };
  const kmh = (d / dtSec) * 3.6;
  return { kmh, displacementM: d, scatterFiltered: false };
}

export function classifyGeometryLeg(
  kmh: number | null,
  scatterFiltered: boolean,
  displacementM: number,
): GeometryMotionClass {
  if (scatterFiltered) return 'INCONCLUSIVE_SCATTER';
  if (kmh == null) return 'INCONCLUSIVE_SCATTER';
  if (kmh >= GEOMETRY_THRESHOLDS.movingMinKmh && displacementM < MIN_DISPLACEMENT_M_FOR_MOVING_CLAIM) {
    return 'INCONCLUSIVE_SCATTER';
  }
  if (kmh < GEOMETRY_THRESHOLDS.nearStopMaxKmh) return 'NEAR_STOP_GEOMETRY';
  if (kmh < GEOMETRY_THRESHOLDS.slowRollMaxKmh) return 'SLOW_ROLL_GEOMETRY';
  return 'MOVING_GEOMETRY';
}

export function classifyAllPresentLegs(
  points: PresentPoint[],
  allPositions?: DiV0SpeedQcPositionSample[],
) {
  const posByLabel = allPositions ? new Map(allPositions.map((p) => [p.bucketLabel, p])) : null;
  const perSecond: Array<{
    bucketLabelUtc: string;
    geometryClass: GeometryMotionClass;
    maxLegKmh: number | null;
    legs: { prevToCenter: number | null; centerToNext: number | null };
    legBasis: 'PRESENT_CHAIN' | 'CALENDAR_1S';
  }> = [];

  for (let i = 0; i < points.length; i += 1) {
    const center = points[i];
    const prevLabel = new Date(bucketLabelToMs(center.bucketLabelUtc) - 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');
    const nextLabel = new Date(bucketLabelToMs(center.bucketLabelUtc) + 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');
    let prev: PresentPoint | null = null;
    let next: PresentPoint | null = null;
    let legBasis: 'CALENDAR_1S' | 'PRESENT_CHAIN' = 'PRESENT_CHAIN';
    if (posByLabel?.get(prevLabel)?.availability === 'PRESENT' && posByLabel?.get(nextLabel)?.availability === 'PRESENT') {
      const p = posByLabel.get(prevLabel)!;
      const n = posByLabel.get(nextLabel)!;
      prev = { bucketLabelUtc: prevLabel, lat: p.latitude!, lon: p.longitude!, positionState: p.positionState ?? null };
      next = { bucketLabelUtc: nextLabel, lat: n.latitude!, lon: n.longitude!, positionState: n.positionState ?? null };
      legBasis = 'CALENDAR_1S';
    } else {
      prev = i > 0 ? points[i - 1] : null;
      next = i < points.length - 1 ? points[i + 1] : null;
    }
    let maxLeg: number | null = null;
    const legs = { prevToCenter: null as number | null, centerToNext: null as number | null };
    const classes: GeometryMotionClass[] = [];
    if (prev) {
      const dt = (bucketLabelToMs(center.bucketLabelUtc) - bucketLabelToMs(prev.bucketLabelUtc)) / 1000;
      const leg = legSpeedKmh(prev, center, dt);
      legs.prevToCenter = leg.scatterFiltered ? null : leg.kmh;
      classes.push(classifyGeometryLeg(leg.kmh, leg.scatterFiltered, leg.displacementM));
      if (leg.kmh != null) maxLeg = Math.max(maxLeg ?? 0, leg.kmh);
    }
    if (next) {
      const dt = (bucketLabelToMs(next.bucketLabelUtc) - bucketLabelToMs(center.bucketLabelUtc)) / 1000;
      const leg = legSpeedKmh(center, next, dt);
      legs.centerToNext = leg.scatterFiltered ? null : leg.kmh;
      classes.push(classifyGeometryLeg(leg.kmh, leg.scatterFiltered, leg.displacementM));
      if (leg.kmh != null) maxLeg = Math.max(maxLeg ?? 0, leg.kmh);
    }
    let geometryClass: GeometryMotionClass = 'INCONCLUSIVE_SCATTER';
    if (classes.includes('MOVING_GEOMETRY')) geometryClass = 'MOVING_GEOMETRY';
    else if (classes.includes('SLOW_ROLL_GEOMETRY')) geometryClass = 'SLOW_ROLL_GEOMETRY';
    else if (classes.includes('NEAR_STOP_GEOMETRY')) geometryClass = 'NEAR_STOP_GEOMETRY';
    perSecond.push({
      bucketLabelUtc: center.bucketLabelUtc,
      geometryClass,
      maxLegKmh: maxLeg,
      legs,
      legBasis,
    });
  }
  return perSecond;
}

export type GapRun = { fromUtc: string; toUtc: string; durationSec: number; labels: string[] };

export function findGapRuns(sortedLabels: string[], posByLabel: Map<string, DiV0SpeedQcPositionSample>): GapRun[] {
  const runs: GapRun[] = [];
  let start: string | null = null;
  const labels: string[] = [];
  for (const label of sortedLabels) {
    const av = posByLabel.get(label)?.availability ?? 'MISSING';
    const isGap = av === 'ROW_ABSENT' || av === 'SIGNAL_NULL' || av === 'MISSING';
    if (isGap) {
      if (!start) start = label;
      labels.push(label);
    } else if (start && labels.length > 0) {
      runs.push({
        fromUtc: start,
        toUtc: labels[labels.length - 1]!,
        durationSec: labels.length,
        labels: [...labels],
      });
      start = null;
      labels.length = 0;
    }
  }
  if (start && labels.length > 0) {
    runs.push({
      fromUtc: start,
      toUtc: labels[labels.length - 1]!,
      durationSec: labels.length,
      labels: [...labels],
    });
  }
  return runs;
}

function takeBracketBefore(points: PresentPoint[], beforeLabel: string, n: number): PresentPoint[] {
  return points.filter((p) => p.bucketLabelUtc < beforeLabel).slice(-n);
}

function takeBracketAfter(points: PresentPoint[], afterLabel: string, n: number): PresentPoint[] {
  return points.filter((p) => p.bucketLabelUtc > afterLabel).slice(0, n);
}

function meanLegSpeedKmh(seq: PresentPoint[]): number | null {
  if (seq.length < 2) return null;
  const speeds: number[] = [];
  for (let i = 1; i < seq.length; i += 1) {
    const dt = (bucketLabelToMs(seq[i].bucketLabelUtc) - bucketLabelToMs(seq[i - 1].bucketLabelUtc)) / 1000;
    const leg = legSpeedKmh(seq[i - 1], seq[i], dt);
    if (leg.kmh != null) speeds.push(leg.kmh);
  }
  if (speeds.length === 0) return null;
  return speeds.reduce((a, b) => a + b, 0) / speeds.length;
}

function pathLengthM(seq: PresentPoint[]): number {
  let sum = 0;
  for (let i = 1; i < seq.length; i += 1) {
    sum += haversineMeters(seq[i - 1].lat, seq[i - 1].lon, seq[i].lat, seq[i].lon);
  }
  return sum;
}

function bearingDeg(a: PresentPoint, b: PresentPoint): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function analyzeGapCandidate(
  gap: GapRun,
  presentPoints: PresentPoint[],
  r1ByLabel: Map<string, number | null>,
  bracketSize = 10,
): {
  gap: GapRun;
  bracketBefore: PresentPoint[];
  bracketAfter: PresentPoint[];
  metrics: Record<string, number | null>;
  explanation: RetrospectiveExplanation;
  evidence: EvidenceLine[];
  durationClaim: 'UNKNOWN' | 'GAP_SECONDS_ONLY_NOT_STANDSTILL_DURATION';
  retrospectiveStatementPossibleAtUtc: string | null;
} {
  const before = takeBracketBefore(presentPoints, gap.fromUtc, bracketSize);
  const after = takeBracketAfter(presentPoints, gap.toUtc, bracketSize);
  const evidence: EvidenceLine[] = [];

  const firstBefore = before[before.length - 1];
  const firstAfter = after[0];
  let endpointDisplacementM: number | null = null;
  if (firstBefore && firstAfter) {
    endpointDisplacementM = haversineMeters(
      firstBefore.lat,
      firstBefore.lon,
      firstAfter.lat,
      firstAfter.lon,
    );
  }

  const approachKmh = meanLegSpeedKmh(before);
  const departKmh = meanLegSpeedKmh(after);
  const pathBefore = pathLengthM(before);
  const pathAfter = pathLengthM(after);
  const impliedChordKmh =
    endpointDisplacementM != null && gap.durationSec > 0
      ? (endpointDisplacementM / gap.durationSec) * 3.6
      : null;

  if (firstBefore && firstAfter) {
    const b1 = bearingDeg(
      before.length >= 2 ? before[before.length - 2]! : firstBefore,
      firstBefore,
    );
    const b2 = bearingDeg(firstAfter, after.length >= 2 ? after[1]! : firstAfter);
    const bearingDelta = Math.abs(b2 - b1);
    evidence.push({
      tier: 'NEUTRAL',
      text: `Bearing change across gap ~${bearingDelta.toFixed(0)}° (route turn possible).`,
      epistemic: 'INFERRED',
    });
  }

  if (approachKmh != null && approachKmh >= GEOMETRY_THRESHOLDS.movingMinKmh) {
    evidence.push({
      tier: 'CONTRADICTS',
      text: `Approach bracket mean leg ${approachKmh.toFixed(1)} km/h ≥ moving threshold.`,
      epistemic: 'INFERRED',
    });
  }
  if (departKmh != null && departKmh >= GEOMETRY_THRESHOLDS.movingMinKmh) {
    evidence.push({
      tier: 'CONTRADICTS',
      text: `Depart bracket mean leg ${departKmh.toFixed(1)} km/h ≥ moving threshold.`,
      epistemic: 'INFERRED',
    });
  }
  if (endpointDisplacementM != null && endpointDisplacementM < 8 && gap.durationSec >= 5) {
    evidence.push({
      tier: 'SUPPORTS',
      text: `Endpoint chord ${endpointDisplacementM.toFixed(1)} m over ${gap.durationSec}s gap (small vs gap length).`,
      epistemic: 'INFERRED',
    });
  }
  if (impliedChordKmh != null && impliedChordKmh >= GEOMETRY_THRESHOLDS.movingMinKmh) {
    evidence.push({
      tier: 'CONTRADICTS',
      text: `Chord-implied speed ${impliedChordKmh.toFixed(1)} km/h across gap suggests travel, not standstill.`,
      epistemic: 'INFERRED',
    });
  }
  if (pathBefore + pathAfter > (endpointDisplacementM ?? 0) * 2.5 && (endpointDisplacementM ?? 0) < 20) {
    evidence.push({
      tier: 'WEAK_SUPPORTS',
      text: 'Path length before+after exceeds chord — possible stop-and-go or loop (not chord distance alone).',
      epistemic: 'INFERRED',
    });
  }

  const r1InGap = gap.labels.map((l) => r1ByLabel.get(l)).filter((v) => v != null && Number.isFinite(v)) as number[];
  if (r1InGap.length > 0) {
    evidence.push({
      tier: 'NEUTRAL',
      text: `R1 numeric in gap labels (${r1InGap.length}) — unexpected for ROW_ABSENT; inspect pin.`,
      epistemic: 'CONFIRMED',
    });
  }

  let explanation: RetrospectiveExplanation = 'NOT_DISTINGUISHABLE';
  const contradicts = evidence.filter((e) => e.tier === 'CONTRADICTS').length;
  const supportsHalt = evidence.filter((e) => e.tier === 'SUPPORTS' && e.text.includes('Endpoint chord')).length;

  if (contradicts >= 2 || (impliedChordKmh != null && impliedChordKmh >= 8)) {
    explanation = 'LIKELY_MOVING_WITH_GAP';
  } else if (
    (approachKmh != null && approachKmh >= GEOMETRY_THRESHOLDS.slowRollMinKmh && approachKmh < GEOMETRY_THRESHOLDS.movingMinKmh) ||
    (departKmh != null && departKmh >= GEOMETRY_THRESHOLDS.slowRollMinKmh && departKmh < GEOMETRY_THRESHOLDS.movingMinKmh)
  ) {
    explanation = 'LIKELY_SLOW_ROLL_STOP_GO';
  } else if (supportsHalt >= 1 && gap.durationSec >= 5 && (approachKmh == null || approachKmh < 3) && (departKmh == null || departKmh < 3)) {
    explanation = 'LIKELY_HALT';
  } else if (gap.durationSec < 3) {
    explanation = 'NOT_DISTINGUISHABLE';
    evidence.push({ tier: 'NEUTRAL', text: 'Gap < 3s — duration alone not halt evidence.', epistemic: 'CONFIRMED' });
  }

  const lastAfter = after[after.length - 1];
  const retrospectiveStatementPossibleAtUtc = lastAfter?.bucketLabelUtc ?? null;

  return {
    gap,
    bracketBefore: before,
    bracketAfter: after,
    metrics: {
      endpointDisplacementM,
      approachMeanLegKmh: approachKmh,
      departMeanLegKmh: departKmh,
      pathBeforeM: pathBefore,
      pathAfterM: pathAfter,
      impliedChordKmh,
    },
    explanation,
    evidence,
    durationClaim: 'GAP_SECONDS_ONLY_NOT_STANDSTILL_DURATION',
    retrospectiveStatementPossibleAtUtc,
  };
}

export function buildGapEvents(
  gaps: GapRun[],
  presentPoints: PresentPoint[],
  r1ByLabel: Map<string, number | null>,
  minGapSec = 3,
) {
  return gaps
    .filter((g) => g.durationSec >= minGapSec)
    .map((g, idx) => {
      const analysis = analyzeGapCandidate(g, presentPoints, r1ByLabel);
      return {
        eventId: `GAP_EVT_${String(idx + 1).padStart(3, '0')}`,
        kind: 'POSITION_GAP',
        consideredWindowUtc: { from: g.fromUtc, to: g.toUtc },
        gapDurationSec: g.durationSec,
        standstillDurationSec: null as number | null,
        durationUncertainty: 'Gap length known; standstill duration NOT inferred from gap alone.',
        classification: analysis.explanation,
        rulesApplied: [
          'BRACKET_MEAN_LEG_GEOMETRY',
          'ENDPOINT_CHORD_NOT_PATH_LENGTH',
          `MIN_DISPLACEMENT_M_FOR_ANY_INFERENCE=${MIN_DISPLACEMENT_M_FOR_ANY_INFERENCE}`,
        ],
        measurementsUsed: ['pinned POSITION coordinates', 'optional R1_OBD at labels'],
        supportingAndContradicting: analysis.evidence,
        metrics: analysis.metrics,
        retrospectiveStatementPossibleAtUtc: analysis.retrospectiveStatementPossibleAtUtc,
        mapContextVariantB: null as Record<string, unknown> | null,
      };
    });
}

export function buildSlowRollSegments(geometryPerSecond: ReturnType<typeof classifyAllPresentLegs>) {
  const segments: Array<{
    fromUtc: string;
    toUtc: string;
    seconds: number;
    eventId: string;
  }> = [];
  let cur: string | null = null;
  let labels: string[] = [];
  for (const row of geometryPerSecond) {
    if (row.geometryClass === 'SLOW_ROLL_GEOMETRY') {
      if (!cur) cur = row.bucketLabelUtc;
      labels.push(row.bucketLabelUtc);
    } else if (cur && labels.length) {
      segments.push({
        fromUtc: cur,
        toUtc: labels[labels.length - 1]!,
        seconds: labels.length,
        eventId: `SLOW_EVT_${String(segments.length + 1).padStart(3, '0')}`,
      });
      cur = null;
      labels = [];
    }
  }
  if (cur && labels.length) {
    segments.push({
      fromUtc: cur,
      toUtc: labels[labels.length - 1]!,
      seconds: labels.length,
      eventId: `SLOW_EVT_${String(segments.length + 1).padStart(3, '0')}`,
    });
  }
  return segments.map((s) => ({
    ...s,
    kind: 'SLOW_ROLL_GEOMETRY_SEGMENT',
    classification: 'LIKELY_SLOW_ROLL_STOP_GO' as RetrospectiveExplanation,
    durationUncertainty: 'Measured present-second span; not video standstill claim.',
    rulesApplied: ['LEG_GEOMETRY_1_5_TO_5_KMH', 'SCATTER_FILTER'],
  }));
}

export type OsmSignal = { id: number; lat: number; lon: number };

export function applyMapContextVariantB<T extends { eventId: string; mapContextVariantB?: Record<string, unknown> | null }>(
  events: T[],
  brackets: Map<string, { before: PresentPoint[]; after: PresentPoint[] }>,
  signals: OsmSignal[],
): void {
  for (const ev of events) {
    const br = brackets.get(ev.eventId);
    if (!br || signals.length === 0) {
      ev.mapContextVariantB = { available: false, reason: 'no_signals_in_bbox' };
      continue;
    }
    const mid =
      br.before[br.before.length - 1] ??
      br.after[0];
    if (!mid) {
      ev.mapContextVariantB = { available: false, reason: 'no_bracket' };
      continue;
    }
    let nearestM = Infinity;
    let nearestId: number | null = null;
    for (const s of signals) {
      const d = haversineMeters(mid.lat, mid.lon, s.lat, s.lon);
      if (d < nearestM) {
        nearestM = d;
        nearestId = s.id;
      }
    }
    ev.mapContextVariantB = {
      available: true,
      nearestTrafficSignalM: nearestM,
      nearestTrafficSignalId: nearestId,
      note: 'Proximity does not prove halt or red phase; absence does not exclude halt.',
      epistemic: 'INFERRED',
    };
  }
}

export function evaluateAgainstVideo(
  events: Array<{ eventId: string; consideredWindowUtc: { from: string; to: string }; classification: string; kind: string }>,
  videoByLabel: Map<string, { tachoKmh: number | null }>,
) {
  const knownHalts = EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC.map((w, i) => ({
    id: `LONG_HALT_${i + 1}`,
    fromUtc: w.from,
    toUtc: w.to,
  }));

  const haltHits = knownHalts.map((h) => {
    const overlapping = events.filter((e) => intervalsOverlap(e.consideredWindowUtc.from, e.consideredWindowUtc.to, h.fromUtc, h.toUtc));
    const labels = enumerateInclusive(h.fromUtc, h.toUtc);
    const tacho0 = labels.filter((l) => videoByLabel.get(l)?.tachoKmh === 0).length;
    return {
      knownHaltId: h.id,
      window: h,
      detectorEventsOverlapping: overlapping.map((e) => ({
        eventId: e.eventId,
        kind: e.kind,
        classification: e.classification,
      })),
      videoTacho0Seconds: tacho0,
      foundAsGapOrSlowEvent: overlapping.length > 0,
    };
  });

  const extraEvents = events.filter((e) => {
    return !knownHalts.some((h) =>
      intervalsOverlap(e.consideredWindowUtc.from, e.consideredWindowUtc.to, h.fromUtc, h.toUtc),
    );
  });

  const haltClassificationVsVideo = haltHits.map((h) => ({
    knownHaltId: h.knownHaltId,
    videoTacho0Seconds: h.videoTacho0Seconds,
    detectorClassifications: h.detectorEventsOverlapping.map((e) => e.classification),
    videoConflictNote:
      h.videoTacho0Seconds >= 5 && h.detectorEventsOverlapping.some((e) => e.classification === 'LIKELY_MOVING_WITH_GAP')
        ? 'Video annotates stop (tacho 0) but gap metrics favor moving-with-gap — slow roll / stop-go not ruled out.'
        : null,
  }));

  return {
    knownHalts: haltHits,
    knownHaltsFoundCount: haltHits.filter((h) => h.foundAsGapOrSlowEvent).length,
    knownHaltsTotal: knownHalts.length,
    haltClassificationVsVideo,
    extraCandidatesCount: extraEvents.length,
    extraCandidatesSample: extraEvents.slice(0, 15).map((e) => ({
      eventId: e.eventId,
      window: e.consideredWindowUtc,
      classification: e.classification,
      videoNote: 'Evaluate tacho overlay post-hoc only',
    })),
    developmentMaterialDisclaimer:
      'This trip is tuning/evaluation material for PR #2051 — not a blind holdout.',
  };
}

function intervalsOverlap(a0: string, a1: string, b0: string, b1: string): boolean {
  return a0 <= b1 && b0 <= a1;
}

export function syntheticGapStressTest(
  presentPoints: PresentPoint[],
  sortedLabels: string[],
  posByLabel: Map<string, DiV0SpeedQcPositionSample>,
) {
  const movingLabels = sortedLabels.filter((l) => {
    const p = posByLabel.get(l);
    if (p?.availability !== 'PRESENT') return false;
    const idx = presentPoints.findIndex((x) => x.bucketLabelUtc === l);
    if (idx < 2) return false;
    const leg = legSpeedKmh(presentPoints[idx - 1], presentPoints[idx], 1);
    return leg.kmh != null && leg.kmh >= GEOMETRY_THRESHOLDS.movingMinKmh;
  });
  if (movingLabels.length < 30) {
    return { epistemic: 'CONFIRMED', synthetic: false, reason: 'insufficient moving present span' };
  }
  const startIdx = Math.floor(movingLabels.length / 3);
  const syntheticLabels = movingLabels.slice(startIdx, startIdx + 6);
  const fakeGap: GapRun = {
    fromUtc: syntheticLabels[0]!,
    toUtc: syntheticLabels[syntheticLabels.length - 1]!,
    durationSec: syntheticLabels.length,
    labels: syntheticLabels,
  };
  const analysis = analyzeGapCandidate(fakeGap, presentPoints, new Map());
  return {
    epistemic: 'CONFIRMED',
    synthetic: true,
    label: 'SYNTHETIC_STRESS_MASK_IN_MOVING_SECTION',
    injectedGap: fakeGap,
    expectedNotHalt: true,
    classification: analysis.explanation,
    pass: analysis.explanation !== 'LIKELY_HALT',
  };
}

export function roundCoord(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
