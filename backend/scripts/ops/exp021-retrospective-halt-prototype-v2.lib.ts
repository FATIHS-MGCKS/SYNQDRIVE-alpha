/**
 * EXP021 retrospective halt prototype v0_2 — revised gap hypotheses, brackets, reporting.
 */
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/geo/haversine';
import { CALIBRATION_UNSET_V0_BUNDLE } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/calibration/CALIBRATION_UNSET_V0';
import { bucketLabelToMs } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import type { DiV0SpeedQcPositionSample } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc.types';
import { EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC } from './exp021-ev-ground-truth-forensic-export.lib';
import { enumerateInclusive } from './exp021-stationary-offline-prototype.lib';
import {
  classifyGeometryLeg,
  collectPresentPoints,
  findGapRuns,
  GEOMETRY_THRESHOLDS,
  legSpeedKmh,
  MIN_DISPLACEMENT_M_FOR_ANY_INFERENCE,
  MIN_DISPLACEMENT_M_FOR_MOVING_CLAIM,
  type EvidenceLine,
  type GapRun,
  type GeometryMotionClass,
  type PresentPoint,
  type RetrospectiveExplanation,
} from './exp021-retrospective-halt-prototype.lib';

export const RETROSPECTIVE_HALT_PROTOTYPE_V2_VERSION = 'EXP021_RETROSPECTIVE_HALT_PROTOTYPE_V0_2';

export const HOLD_NOISE_DISPLACEMENT_DOCUMENTATION = {
  valueM: CALIBRATION_UNSET_V0_BUNDLE.holdNoiseDisplacementM,
  source:
    'SynqDrive DI_V0 calibration bundle CALIBRATION_UNSET_V0_BUNDLE.holdNoiseDisplacementM (hold-release scatter filter; provisional pilot bundle — not a universal GPS accuracy specification).',
  codeRef: 'backend/src/modules/vehicle-intelligence/driving-intelligence/core/calibration/CALIBRATION_UNSET_V0.ts',
  usedAs: 'MIN_DISPLACEMENT_M_FOR_ANY_INFERENCE in this offline prototype only',
} as const;

export const V0_1_MISCLASSIFICATION_ROOT_CAUSE = {
  summary:
    'v0_1 treated bracket mean leg speeds (10 present points) and chord-implied average speed as contradicting halt; post-halt departure and pre-halt approach therefore forced LIKELY_MOVING_WITH_GAP when contradicts>=2.',
  rulesRetired: [
    'CONTRADICTS on approach/depart bracket mean >= movingMinKmh',
    'LIKELY_MOVING_WITH_GAP when contradicts>=2 or impliedChordKmh>=8',
    'Chord-implied km/h as CONTRADICTS standstill',
  ],
  rulesV02: [
    'Calendar-adjacent present seconds at gap edges for motion inference',
    'Bracket means reported as distant context only',
    'Composite halt+departure vs slow-roll-through vs moving-with-gap scoring',
    'Chord average labeled NEUTRAL (not locus of standstill duration)',
  ],
} as const;

export type GapBracketStructure = {
  calendarAdjacentBefore: PresentPoint | null;
  calendarAdjacentAfter: PresentPoint | null;
  calendarBracketBefore: PresentPoint[];
  calendarBracketAfter: PresentPoint[];
  distantContextBefore: PresentPoint[];
  distantContextAfter: PresentPoint[];
};

function labelAtOffset(label: string, deltaSec: number): string {
  return new Date(bucketLabelToMs(label) + deltaSec * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function presentPointAt(
  label: string,
  posByLabel: Map<string, DiV0SpeedQcPositionSample>,
): PresentPoint | null {
  const p = posByLabel.get(label);
  if (!p || p.availability !== 'PRESENT' || p.latitude == null || p.longitude == null) return null;
  return {
    bucketLabelUtc: label,
    lat: p.latitude,
    lon: p.longitude,
    positionState: p.positionState ?? null,
  };
}

export function buildGapBrackets(
  gap: GapRun,
  presentPoints: PresentPoint[],
  posByLabel: Map<string, DiV0SpeedQcPositionSample>,
  calendarBracketSec = 5,
  maxCalendarSearchSec = 15,
): GapBracketStructure {
  let calendarAdjacentBefore: PresentPoint | null = null;
  for (let d = 1; d <= maxCalendarSearchSec; d += 1) {
    const lab = labelAtOffset(gap.fromUtc, -d);
    const pt = presentPointAt(lab, posByLabel);
    if (pt) {
      calendarAdjacentBefore = pt;
      break;
    }
  }
  let calendarAdjacentAfter: PresentPoint | null = null;
  for (let d = 1; d <= maxCalendarSearchSec; d += 1) {
    const lab = labelAtOffset(gap.toUtc, d);
    const pt = presentPointAt(lab, posByLabel);
    if (pt) {
      calendarAdjacentAfter = pt;
      break;
    }
  }

  const calendarBracketBefore: PresentPoint[] = [];
  if (calendarAdjacentBefore) {
    for (let d = 0; d < calendarBracketSec; d += 1) {
      const lab = labelAtOffset(calendarAdjacentBefore.bucketLabelUtc, -d);
      const pt = presentPointAt(lab, posByLabel);
      if (pt) calendarBracketBefore.unshift(pt);
    }
  }
  const calendarBracketAfter: PresentPoint[] = [];
  if (calendarAdjacentAfter) {
    for (let d = 0; d < calendarBracketSec; d += 1) {
      const lab = labelAtOffset(calendarAdjacentAfter.bucketLabelUtc, d);
      const pt = presentPointAt(lab, posByLabel);
      if (pt) calendarBracketAfter.push(pt);
    }
  }

  const distantContextBefore = presentPoints
    .filter((p) => p.bucketLabelUtc < gap.fromUtc)
    .filter((p) => !calendarBracketBefore.some((c) => c.bucketLabelUtc === p.bucketLabelUtc))
    .slice(-8);
  const distantContextAfter = presentPoints
    .filter((p) => p.bucketLabelUtc > gap.toUtc)
    .filter((p) => !calendarBracketAfter.some((c) => c.bucketLabelUtc === p.bucketLabelUtc))
    .slice(0, 8);

  return {
    calendarAdjacentBefore,
    calendarAdjacentAfter,
    calendarBracketBefore,
    calendarBracketAfter,
    distantContextBefore,
    distantContextAfter,
  };
}

function legClassBetween(a: PresentPoint, b: PresentPoint): {
  kmh: number | null;
  displacementM: number;
  geometryClass: GeometryMotionClass;
  dtSec: number;
} {
  const dtSec = (bucketLabelToMs(b.bucketLabelUtc) - bucketLabelToMs(a.bucketLabelUtc)) / 1000;
  const leg = legSpeedKmh(a, b, dtSec);
  return {
    kmh: leg.kmh,
    displacementM: leg.displacementM,
    geometryClass: classifyGeometryLeg(leg.kmh, leg.scatterFiltered, leg.displacementM),
    dtSec,
  };
}

export type CompositeHypothesisScores = {
  LIKELY_HALT: number;
  LIKELY_SLOW_ROLL_STOP_GO: number;
  LIKELY_MOVING_WITH_GAP: number;
};

export function analyzeGapCandidateV2(
  gap: GapRun,
  presentPoints: PresentPoint[],
  posByLabel: Map<string, DiV0SpeedQcPositionSample>,
  r1ByLabel: Map<string, number | null>,
): {
  gap: GapRun;
  brackets: GapBracketStructure;
  metrics: Record<string, number | null | string>;
  explanation: RetrospectiveExplanation;
  evidence: EvidenceLine[];
  hypothesisScores: CompositeHypothesisScores;
  decisiveFeatures: Array<{ feature: string; value: string | number | null; role: string }>;
  durationClaim: 'UNKNOWN' | 'GAP_SECONDS_ONLY_NOT_STANDSTILL_DURATION';
  retrospectiveStatementPossibleAtUtc: string | null;
  v01WouldHaveClass: RetrospectiveExplanation | null;
} {
  const brackets = buildGapBrackets(gap, presentPoints, posByLabel);
  const evidence: EvidenceLine[] = [];
  const decisiveFeatures: Array<{ feature: string; value: string | number | null; role: string }> = [];

  const adjBefore = brackets.calendarAdjacentBefore;
  const adjAfter = brackets.calendarAdjacentAfter;
  let endpointDisplacementM: number | null = null;
  let impliedChordKmh: number | null = null;
  let legIntoGap: ReturnType<typeof legClassBetween> | null = null;
  let legOutOfGap: ReturnType<typeof legClassBetween> | null = null;
  let chordAcrossGap: ReturnType<typeof legClassBetween> | null = null;

  if (adjBefore && adjAfter) {
    endpointDisplacementM = haversineMeters(adjBefore.lat, adjBefore.lon, adjAfter.lat, adjAfter.lon);
    impliedChordKmh =
      gap.durationSec > 0 && endpointDisplacementM != null ? (endpointDisplacementM / gap.durationSec) * 3.6 : null;
    chordAcrossGap = legClassBetween(adjBefore, adjAfter);
    decisiveFeatures.push({
      feature: 'endpointChordM',
      value: endpointDisplacementM,
      role: 'gap endpoints (calendar-adjacent present)',
    });
    decisiveFeatures.push({ feature: 'gapDurationSec', value: gap.durationSec, role: 'ROW_ABSENT span' });
    decisiveFeatures.push({
      feature: 'impliedChordKmh',
      value: impliedChordKmh != null ? Math.round(impliedChordKmh * 10) / 10 : null,
      role: 'average over gap — not standstill duration',
    });
  }

  if (brackets.calendarBracketBefore.length >= 2) {
    const a = brackets.calendarBracketBefore[brackets.calendarBracketBefore.length - 2]!;
    const b = brackets.calendarBracketBefore[brackets.calendarBracketBefore.length - 1]!;
    legIntoGap = legClassBetween(a, b);
    decisiveFeatures.push({
      feature: 'legIntoGapKmh',
      value: legIntoGap.kmh != null ? Math.round(legIntoGap.kmh * 10) / 10 : null,
      role: `calendar leg ${a.bucketLabelUtc}→${b.bucketLabelUtc}`,
    });
  }
  if (brackets.calendarBracketAfter.length >= 2) {
    const a = brackets.calendarBracketAfter[0]!;
    const b = brackets.calendarBracketAfter[1]!;
    legOutOfGap = legClassBetween(a, b);
    decisiveFeatures.push({
      feature: 'legOutOfGapKmh',
      value: legOutOfGap.kmh != null ? Math.round(legOutOfGap.kmh * 10) / 10 : null,
      role: `calendar leg ${a.bucketLabelUtc}→${b.bucketLabelUtc}`,
    });
  }

  if (impliedChordKmh != null) {
    evidence.push({
      tier: 'NEUTRAL',
      text: `Chord-implied ${impliedChordKmh.toFixed(1)} km/h averages displacement over entire ${gap.durationSec}s gap — compatible with halt+departure inside gap.`,
      epistemic: 'INFERRED',
    });
  }
  if (endpointDisplacementM != null && endpointDisplacementM < 12 && gap.durationSec >= 5) {
    evidence.push({
      tier: 'SUPPORTS',
      text: `Small endpoint chord ${endpointDisplacementM.toFixed(1)} m across ${gap.durationSec}s gap.`,
      epistemic: 'INFERRED',
    });
  }
  if (legOutOfGap?.geometryClass === 'MOVING_GEOMETRY' && endpointDisplacementM != null && endpointDisplacementM < 25) {
    evidence.push({
      tier: 'SUPPORTS',
      text: 'Post-gap calendar leg shows departure while chord remains small — halt-then-depart pattern.',
      epistemic: 'INFERRED',
    });
  }
  if (legIntoGap?.geometryClass === 'MOVING_GEOMETRY' && legOutOfGap?.geometryClass === 'MOVING_GEOMETRY') {
    if (endpointDisplacementM != null && endpointDisplacementM >= gap.durationSec * 0.8) {
      evidence.push({
        tier: 'CONTRADICTS',
        text: `Both gap-edge legs moving and chord ${endpointDisplacementM.toFixed(0)} m large vs gap — sustained roll-through plausible.`,
        epistemic: 'INFERRED',
      });
    } else {
      evidence.push({
        tier: 'NEUTRAL',
        text: 'Gap-edge legs both moving-class but chord small — stop-go or measurement gap not ruled out.',
        epistemic: 'INFERRED',
      });
    }
  }
  if (legIntoGap?.geometryClass === 'SLOW_ROLL_GEOMETRY' || legOutOfGap?.geometryClass === 'SLOW_ROLL_GEOMETRY') {
    evidence.push({
      tier: 'WEAK_SUPPORTS',
      text: 'Slow-roll geometry adjacent to gap.',
      epistemic: 'INFERRED',
    });
  }

  const distantBeforeMean =
    brackets.distantContextBefore.length >= 2
      ? meanLegSpeed(brackets.distantContextBefore)
      : null;
  const distantAfterMean =
    brackets.distantContextAfter.length >= 2 ? meanLegSpeed(brackets.distantContextAfter) : null;
  if (distantBeforeMean != null) {
    evidence.push({
      tier: 'NEUTRAL',
      text: `Distant approach context mean leg ${distantBeforeMean.toFixed(1)} km/h (not gap-edge).`,
      epistemic: 'INFERRED',
    });
  }
  if (distantAfterMean != null) {
    evidence.push({
      tier: 'NEUTRAL',
      text: `Distant depart context mean leg ${distantAfterMean.toFixed(1)} km/h (includes post-halt driving).`,
      epistemic: 'INFERRED',
    });
  }

  const r1InGap = gap.labels.map((l) => r1ByLabel.get(l)).filter((v) => v != null && Number.isFinite(v)) as number[];
  if (r1InGap.length > 0) {
    evidence.push({
      tier: 'NEUTRAL',
      text: `R1 numeric in gap (${r1InGap.length}) — inspect pin.`,
      epistemic: 'CONFIRMED',
    });
  }

  const scores: CompositeHypothesisScores = {
    LIKELY_HALT: 0,
    LIKELY_SLOW_ROLL_STOP_GO: 0,
    LIKELY_MOVING_WITH_GAP: 0,
  };

  if (endpointDisplacementM != null && endpointDisplacementM < 12 && gap.durationSec >= 5) scores.LIKELY_HALT += 3;
  if (legOutOfGap?.geometryClass === 'MOVING_GEOMETRY' && endpointDisplacementM != null && endpointDisplacementM < 25) {
    scores.LIKELY_HALT += 2;
  }
  if (legIntoGap?.geometryClass === 'NEAR_STOP_GEOMETRY' || legIntoGap?.geometryClass === 'SLOW_ROLL_GEOMETRY') {
    scores.LIKELY_HALT += 1;
    scores.LIKELY_SLOW_ROLL_STOP_GO += 1;
  }
  if (legIntoGap?.geometryClass === 'SLOW_ROLL_GEOMETRY' && legOutOfGap?.geometryClass === 'SLOW_ROLL_GEOMETRY') {
    scores.LIKELY_SLOW_ROLL_STOP_GO += 3;
  }
  if (
    legIntoGap?.geometryClass === 'MOVING_GEOMETRY' &&
    legOutOfGap?.geometryClass === 'MOVING_GEOMETRY' &&
    endpointDisplacementM != null &&
    endpointDisplacementM >= Math.max(15, gap.durationSec * 0.6)
  ) {
    scores.LIKELY_MOVING_WITH_GAP += 4;
  }
  if (gap.durationSec < 3) {
    evidence.push({ tier: 'NEUTRAL', text: 'Gap < 3s — weak halt evidence.', epistemic: 'CONFIRMED' });
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]) as [RetrospectiveExplanation, number][];
  const top = ranked[0];
  const second = ranked[1];
  let explanation: RetrospectiveExplanation = 'NOT_DISTINGUISHABLE';
  if (top[1] >= 3 && top[1] - second[1] >= 2) {
    explanation = top[0];
  } else if (top[1] >= 4 && top[1] - second[1] >= 1) {
    explanation = top[0];
  }

  const retrospectiveStatementPossibleAtUtc = brackets.calendarBracketAfter[brackets.calendarBracketAfter.length - 1]?.bucketLabelUtc ?? adjAfter?.bucketLabelUtc ?? null;

  return {
    gap,
    brackets,
    metrics: {
      endpointDisplacementM,
      impliedChordKmh,
      legIntoGapKmh: legIntoGap?.kmh ?? null,
      legOutOfGapKmh: legOutOfGap?.kmh ?? null,
      legIntoGapClass: legIntoGap?.geometryClass ?? null,
      legOutOfGapClass: legOutOfGap?.geometryClass ?? null,
      distantBeforeMeanKmh: distantBeforeMean,
      distantAfterMeanKmh: distantAfterMean,
    },
    explanation,
    evidence,
    hypothesisScores: scores,
    decisiveFeatures,
    durationClaim: 'GAP_SECONDS_ONLY_NOT_STANDSTILL_DURATION',
    retrospectiveStatementPossibleAtUtc,
    v01WouldHaveClass: null,
  };
}

function meanLegSpeed(seq: PresentPoint[]): number | null {
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

export function buildGapEventsV2(
  gaps: GapRun[],
  presentPoints: PresentPoint[],
  posByLabel: Map<string, DiV0SpeedQcPositionSample>,
  r1ByLabel: Map<string, number | null>,
  minGapSec = 3,
) {
  return gaps
    .filter((g) => g.durationSec >= minGapSec)
    .map((g, idx) => {
      const analysis = analyzeGapCandidateV2(g, presentPoints, posByLabel, r1ByLabel);
      return {
        eventId: `GAP_EVT_${String(idx + 1).padStart(3, '0')}`,
        kind: 'POSITION_GAP',
        consideredWindowUtc: { from: g.fromUtc, to: g.toUtc },
        gapDurationSec: g.durationSec,
        standstillDurationSec: null as number | null,
        durationUncertainty: 'Gap length known; standstill duration NOT inferred from gap alone.',
        classification: analysis.explanation,
        rulesApplied: [
          'V0_2_COMPOSITE_HYPOTHESIS',
          'CALENDAR_ADJACENT_GAP_EDGES',
          'DISTANT_CONTEXT_REPORTED_SEPARATELY',
          `MIN_DISPLACEMENT_M=${MIN_DISPLACEMENT_M_FOR_ANY_INFERENCE}`,
        ],
        measurementsUsed: ['pinned POSITION coordinates', 'optional R1_OBD at labels'],
        supportingAndContradicting: analysis.evidence,
        metrics: analysis.metrics,
        hypothesisScores: analysis.hypothesisScores,
        decisiveFeatures: analysis.decisiveFeatures,
        bracketStructure: {
          calendarAdjacentBefore: analysis.brackets.calendarAdjacentBefore?.bucketLabelUtc ?? null,
          calendarAdjacentAfter: analysis.brackets.calendarAdjacentAfter?.bucketLabelUtc ?? null,
          calendarBracketBeforeLabels: analysis.brackets.calendarBracketBefore.map((p) => p.bucketLabelUtc),
          calendarBracketAfterLabels: analysis.brackets.calendarBracketAfter.map((p) => p.bucketLabelUtc),
          distantContextBeforeLabels: analysis.brackets.distantContextBefore.map((p) => p.bucketLabelUtc),
          distantContextAfterLabels: analysis.brackets.distantContextAfter.map((p) => p.bucketLabelUtc),
        },
        retrospectiveStatementPossibleAtUtc: analysis.retrospectiveStatementPossibleAtUtc,
        mapContextVariantB: null as Record<string, unknown> | null,
      };
    });
}

export function classifyAllPresentLegsV2(
  points: PresentPoint[],
  allPositions: DiV0SpeedQcPositionSample[],
) {
  const posByLabel = new Map(allPositions.map((p) => [p.bucketLabel, p]));
  const rows: Array<{
    bucketLabelUtc: string;
    geometryClass: GeometryMotionClass;
    maxLegKmh: number | null;
    legBasis: 'PRESENT_CHAIN' | 'CALENDAR_1S';
    presentChainSpanSec: number | null;
    countsForSlowRollAggregate: boolean;
    legs: { prevToCenter: number | null; centerToNext: number | null };
  }> = [];

  for (let i = 0; i < points.length; i += 1) {
    const center = points[i];
    const prevLabel = labelAtOffset(center.bucketLabelUtc, -1);
    const nextLabel = labelAtOffset(center.bucketLabelUtc, 1);
    let prev: PresentPoint | null = null;
    let next: PresentPoint | null = null;
    let legBasis: 'CALENDAR_1S' | 'PRESENT_CHAIN' = 'PRESENT_CHAIN';
    let presentChainSpanSec: number | null = null;
    if (posByLabel.get(prevLabel)?.availability === 'PRESENT' && posByLabel.get(nextLabel)?.availability === 'PRESENT') {
      const p = posByLabel.get(prevLabel)!;
      const n = posByLabel.get(nextLabel)!;
      prev = { bucketLabelUtc: prevLabel, lat: p.latitude!, lon: p.longitude!, positionState: p.positionState ?? null };
      next = { bucketLabelUtc: nextLabel, lat: n.latitude!, lon: n.longitude!, positionState: n.positionState ?? null };
      legBasis = 'CALENDAR_1S';
      presentChainSpanSec = 1;
    } else {
      prev = i > 0 ? points[i - 1] : null;
      next = i < points.length - 1 ? points[i + 1] : null;
      if (prev) presentChainSpanSec = (bucketLabelToMs(center.bucketLabelUtc) - bucketLabelToMs(prev.bucketLabelUtc)) / 1000;
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
    const countsForSlowRollAggregate =
      geometryClass === 'SLOW_ROLL_GEOMETRY' && legBasis === 'CALENDAR_1S' && (presentChainSpanSec ?? 99) <= 2;

    rows.push({
      bucketLabelUtc: center.bucketLabelUtc,
      geometryClass,
      maxLegKmh: maxLeg,
      legBasis,
      presentChainSpanSec,
      countsForSlowRollAggregate,
      legs,
    });
  }
  return rows;
}

export function slowRollVideoCrossTab(
  geometryRows: ReturnType<typeof classifyAllPresentLegsV2>,
  videoByLabel: Map<string, { tachoKmh: number | null }>,
) {
  const slowSeconds = geometryRows.filter((r) => r.geometryClass === 'SLOW_ROLL_GEOMETRY');
  const aggregateEligible = slowSeconds.filter((r) => r.countsForSlowRollAggregate);
  type Bucket = 'tacho_0' | 'tacho_1_3' | 'tacho_gt_3' | 'tacho_unknown';
  function bucket(tacho: number | null | undefined): Bucket {
    if (tacho == null || !Number.isFinite(tacho)) return 'tacho_unknown';
    if (tacho === 0) return 'tacho_0';
    if (tacho >= 1 && tacho <= 3) return 'tacho_1_3';
    if (tacho > 3) return 'tacho_gt_3';
    return 'tacho_unknown';
  }
  const countBy: Record<Bucket, number> = { tacho_0: 0, tacho_1_3: 0, tacho_gt_3: 0, tacho_unknown: 0 };
  const countByEligible: Record<Bucket, number> = { tacho_0: 0, tacho_1_3: 0, tacho_gt_3: 0, tacho_unknown: 0 };
  const perSecond: Array<{ label: string; bucket: Bucket; tacho: number | null; legBasis: string; chainSpanSec: number | null; aggregateEligible: boolean }> = [];
  for (const r of slowSeconds) {
    const tacho = videoByLabel.get(r.bucketLabelUtc)?.tachoKmh ?? null;
    const b = bucket(tacho);
    countBy[b] += 1;
    if (r.countsForSlowRollAggregate) countByEligible[b] += 1;
    perSecond.push({
      label: r.bucketLabelUtc,
      bucket: b,
      tacho,
      legBasis: r.legBasis,
      chainSpanSec: r.presentChainSpanSec,
      aggregateEligible: r.countsForSlowRollAggregate,
    });
  }
  const chainSpanGt2 = slowSeconds.filter((r) => r.legBasis === 'PRESENT_CHAIN' && (r.presentChainSpanSec ?? 0) > 2);
  return {
    totalSlowRollGeometrySeconds: slowSeconds.length,
    aggregateEligibleSeconds: aggregateEligible.length,
    presentChainSpanGt2SecCount: chainSpanGt2.length,
    videoCrossTabAllSlowRoll: countBy,
    videoCrossTabAggregateEligibleOnly: countByEligible,
    perSecondSample: perSecond.slice(0, 80),
    perSecondFullFile: 'SLOW_ROLL_VIDEO_CROSS_TAB.json',
    note: 'Unknown tacho not counted as hits in aggregate scoring; chain-span>2s legs excluded from slow-roll aggregate.',
  };
}

export type MainHaltRow = {
  knownHaltId: string;
  videoWindowUtc: { from: string; to: string };
  videoTachoZeroDurationSec: number;
  candidateCoverage: {
    overlappingEventIds: string[];
    overlapMeansCandidateFound: boolean;
    classificationCorrect: boolean | null;
  };
  matchedCandidateWindow: { from: string; to: string; eventId: string; classification: string } | null;
  predictedClass: string | null;
  decisiveFeatures: Array<{ feature: string; value: string | number | null; role: string }>;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  videoComparisonOutcome: string;
  v01MisclassificationNote: string;
};

export function buildMainHaltClassificationTable(
  gapEvents: ReturnType<typeof buildGapEventsV2>,
  videoByLabel: Map<string, { tachoKmh: number | null }>,
): MainHaltRow[] {
  return EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC.map((w, i) => {
    const labels = enumerateInclusive(w.from, w.to);
    const videoTacho0 = labels.filter((l) => videoByLabel.get(l)?.tachoKmh === 0).length;
    const overlapping = gapEvents.filter((e) => intervalsOverlap(e.consideredWindowUtc.from, e.consideredWindowUtc.to, w.from, w.to));
    const primary = overlapping.find((e) => e.kind === 'POSITION_GAP') ?? overlapping[0] ?? null;
    const classification = primary?.classification ?? null;
    const correct =
      classification != null ? classification === 'LIKELY_HALT' || classification === 'LIKELY_SLOW_ROLL_STOP_GO' : null;
    const evidence = primary?.supportingAndContradicting ?? [];
    return {
      knownHaltId: `LONG_HALT_${i + 1}`,
      videoWindowUtc: { from: w.from, to: w.to },
      videoTachoZeroDurationSec: videoTacho0,
      candidateCoverage: {
        overlappingEventIds: overlapping.map((e) => e.eventId),
        overlapMeansCandidateFound: overlapping.length > 0,
        classificationCorrect: correct,
      },
      matchedCandidateWindow: primary
        ? {
            from: primary.consideredWindowUtc.from,
            to: primary.consideredWindowUtc.to,
            eventId: primary.eventId,
            classification: primary.classification,
          }
        : null,
      predictedClass: classification,
      decisiveFeatures: primary?.decisiveFeatures ?? [],
      supportingEvidence: evidence.filter((e) => e.tier === 'SUPPORTS' || e.tier === 'WEAK_SUPPORTS').map((e) => e.text),
      contradictingEvidence: evidence.filter((e) => e.tier === 'CONTRADICTS').map((e) => e.text),
      videoComparisonOutcome:
        videoTacho0 >= 5 && classification === 'LIKELY_HALT'
          ? 'ALIGNED_HALT_CLASS'
          : videoTacho0 >= 5 && classification === 'LIKELY_SLOW_ROLL_STOP_GO'
            ? 'PARTIAL_SLOW_ROLL_VS_TACHO_0'
            : videoTacho0 >= 5 && classification === 'LIKELY_MOVING_WITH_GAP'
              ? 'CONFLICT_VIDEO_STOP_DETECTOR_MOVING'
              : videoTacho0 >= 5 && classification === 'NOT_DISTINGUISHABLE'
                ? 'VIDEO_STOP_DETECTOR_UNCLEAR'
                : 'INSUFFICIENT_VIDEO_LABELS',
      v01MisclassificationNote:
        'v0_1 used bracket mean speeds + chord contradicts; v0_2 uses calendar-adjacent legs and composite halt+departure scoring.',
    };
  });
}

export function evaluateVideoCoverageVsClassification(
  gapEvents: ReturnType<typeof buildGapEventsV2>,
  videoByLabel: Map<string, { tachoKmh: number | null }>,
) {
  const mainTable = buildMainHaltClassificationTable(gapEvents, videoByLabel);
  return {
    disclaimer: 'knownHaltsFoundCount is CANDIDATE COVERAGE (overlap), not classification accuracy.',
    knownHaltsTotal: mainTable.length,
    knownHaltsCandidateCoverageCount: mainTable.filter((r) => r.candidateCoverage.overlapMeansCandidateFound).length,
    knownHaltsClassificationAlignedCount: mainTable.filter((r) => r.candidateCoverage.classificationCorrect === true).length,
    mainHaltRows: mainTable,
    referenceDurationsSec: [31, 40, 8, 20, 26],
    referenceDurationsNote: 'Per-window tacho-0 second counts from video overlay (not a single 31–40s band).',
  };
}

function intervalsOverlap(a0: string, a1: string, b0: string, b1: string): boolean {
  return a0 <= b1 && b0 <= a1;
}

export function evaluateNaturalMovementGaps(
  gapEvents: ReturnType<typeof buildGapEventsV2>,
  videoByLabel: Map<string, { tachoKmh: number | null }>,
) {
  return gapEvents.map((e) => {
    const labels = enumerateInclusive(e.consideredWindowUtc.from, e.consideredWindowUtc.to);
    let t0 = 0;
    let t13 = 0;
    let tgt3 = 0;
    let unk = 0;
    for (const l of labels) {
      const t = videoByLabel.get(l)?.tachoKmh;
      if (t == null || !Number.isFinite(t)) unk += 1;
      else if (t === 0) t0 += 1;
      else if (t >= 1 && t <= 3) t13 += 1;
      else if (t > 3) tgt3 += 1;
    }
    return {
      eventId: e.eventId,
      window: e.consideredWindowUtc,
      classification: e.classification,
      videoInGap: { tacho0: t0, tacho1to3: t13, tachoGt3: tgt3, unknown: unk },
    };
  });
}

export type SyntheticGapCase = {
  id: string;
  context: string;
  synthetic: boolean;
  injectedGap: GapRun;
  classification: RetrospectiveExplanation;
  hypothesisScores: CompositeHypothesisScores;
  expectation: string;
  pass: boolean;
};

export function runSyntheticGapBattery(
  presentPoints: PresentPoint[],
  sortedLabels: string[],
  posByLabel: Map<string, DiV0SpeedQcPositionSample>,
): { natural: false; cases: SyntheticGapCase[] } {
  const cases: SyntheticGapCase[] = [];
  const movingIdx = presentPoints
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => {
      if (i < 2) return false;
      const leg = legSpeedKmh(presentPoints[i - 1], p, 1);
      return leg.kmh != null && leg.kmh >= GEOMETRY_THRESHOLDS.movingMinKmh;
    });

  function pushCase(id: string, context: string, labels: string[], expectation: string, passFn: (c: RetrospectiveExplanation) => boolean) {
    if (labels.length < 3) return;
    const fakeGap: GapRun = {
      fromUtc: labels[0]!,
      toUtc: labels[labels.length - 1]!,
      durationSec: labels.length,
      labels,
    };
    const analysis = analyzeGapCandidateV2(fakeGap, presentPoints, posByLabel, new Map());
    cases.push({
      id,
      context,
      synthetic: true,
      injectedGap: fakeGap,
      classification: analysis.explanation,
      hypothesisScores: analysis.hypothesisScores,
      expectation,
      pass: passFn(analysis.explanation),
    });
  }

  if (movingIdx.length >= 40) {
    const mid = Math.floor(movingIdx.length / 2);
    pushCase('SYN_MOVING_MASK_6S', 'steady moving section', movingIdx.slice(mid, mid + 6).map((x) => x.p.bucketLabelUtc), 'should not be LIKELY_HALT', (c) => c !== 'LIKELY_HALT');
    pushCase('SYN_MOVING_MASK_12S', 'steady moving section', movingIdx.slice(mid, mid + 12).map((x) => x.p.bucketLabelUtc), 'should not be LIKELY_HALT', (c) => c !== 'LIKELY_HALT');
  }

  const slowIdx = presentPoints
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => {
      if (i < 2) return false;
      const leg = legSpeedKmh(presentPoints[i - 1], presentPoints[i], 1);
      return leg.kmh != null && leg.kmh >= GEOMETRY_THRESHOLDS.slowRollMinKmh && leg.kmh < GEOMETRY_THRESHOLDS.movingMinKmh;
    });
  if (slowIdx.length >= 8) {
    pushCase(
      'SYN_SLOW_ROLL_MASK_8S',
      'slow roll geometry',
      slowIdx.slice(2, 10).map((x) => x.p.bucketLabelUtc),
      'not LIKELY_HALT on masked moving labels',
      (c) => c !== 'LIKELY_HALT',
    );
  }

  const gapRuns = findGapRuns(sortedLabels, posByLabel).filter((g) => g.durationSec >= 5);
  if (gapRuns[0]) {
    const g = gapRuns[0];
    const analysis = analyzeGapCandidateV2(g, presentPoints, posByLabel, new Map());
    cases.push({
      id: 'NATURAL_GAP_REPLAY_0',
      context: 'first natural gap replay',
      synthetic: false,
      injectedGap: g,
      classification: analysis.explanation,
      hypothesisScores: analysis.hypothesisScores,
      expectation: 'document natural classification',
      pass: true,
    });
  }

  return { natural: false, cases };
}

export function bearingDeg(a: PresentPoint, b: PresentPoint): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function applyMapContextVariantBEnhanced<
  T extends { eventId: string; mapContextVariantB?: Record<string, unknown> | null; bracketStructure?: { calendarAdjacentBefore: string | null; calendarAdjacentAfter: string | null } },
>(
  events: T[],
  brackets: Map<string, GapBracketStructure>,
  signals: Array<{ id: number; lat: number; lon: number }>,
  osmMeta: { fetchedAtUtc: string; source: string; requestMethod: string },
): void {
  for (const ev of events) {
    const br = brackets.get(ev.eventId);
    if (!br || signals.length === 0) {
      ev.mapContextVariantB = {
        available: false,
        reason: signals.length === 0 ? 'no_signals_fetched' : 'no_bracket',
        osmMeta,
      };
      continue;
    }
    const mid = br.calendarAdjacentBefore ?? br.calendarAdjacentAfter;
    if (!mid) {
      ev.mapContextVariantB = { available: false, reason: 'no_calendar_adjacent_point', osmMeta };
      continue;
    }
    let nearestM = Infinity;
    let nearestId: number | null = null;
    let bearingToSignal: number | null = null;
    for (const s of signals) {
      const d = haversineMeters(mid.lat, mid.lon, s.lat, s.lon);
      if (d < nearestM) {
        nearestM = d;
        nearestId = s.id;
        bearingToSignal = bearingDeg(mid, { bucketLabelUtc: '', lat: s.lat, lon: s.lon, positionState: null });
      }
    }
    const travelBearing =
      br.calendarAdjacentBefore && br.calendarAdjacentAfter
        ? bearingDeg(br.calendarAdjacentBefore, br.calendarAdjacentAfter)
        : null;
    let bearingDelta: number | null = null;
    if (travelBearing != null && bearingToSignal != null) {
      bearingDelta = Math.abs(travelBearing - bearingToSignal);
      if (bearingDelta > 180) bearingDelta = 360 - bearingDelta;
    }
    ev.mapContextVariantB = {
      available: true,
      osmMeta,
      nearestTrafficSignalM: nearestM,
      nearestTrafficSignalId: nearestId,
      travelBearingDeg: travelBearing,
      bearingToNearestSignalDeg: bearingToSignal,
      bearingDeltaDeg: bearingDelta,
      roadAssociation: 'not_resolved_v0_2',
      note: 'Proximity + bearing hint only; no red-phase knowledge; street graph not joined in v0_2.',
      epistemic: 'INFERRED',
    };
  }
}

export function buildSlowRollSegmentsV2(geometryPerSecond: ReturnType<typeof classifyAllPresentLegsV2>) {
  const segments: Array<{ fromUtc: string; toUtc: string; seconds: number; eventId: string }> = [];
  let cur: string | null = null;
  let labels: string[] = [];
  for (const row of geometryPerSecond) {
    if (row.geometryClass === 'SLOW_ROLL_GEOMETRY' && row.countsForSlowRollAggregate) {
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
    durationUncertainty: 'Calendar 1s leg basis only; present-chain span>2 excluded.',
    rulesApplied: ['LEG_GEOMETRY_1_5_TO_5_KMH', 'SCATTER_FILTER', 'V0_2_NO_CHAIN_SPAN_AGGREGATE'],
  }));
}

export { collectPresentPoints, findGapRuns } from './exp021-retrospective-halt-prototype.lib';
