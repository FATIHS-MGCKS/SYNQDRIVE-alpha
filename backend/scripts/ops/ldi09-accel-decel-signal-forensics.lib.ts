/**
 * LDI-09 — offline accel/decel + conflict forensics (frozen LDI-08 snapshot).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import type { Ldi03Row } from './ldi04-fusion-forensics.lib';
import { analyzeConflicts, analyzeCadence } from './ldi04-fusion-forensics.lib';

export const LDI09_VEHICLE_ID = '8c850ff1-4201-432b-af2e-2711dbc7ca48';
export const LDI09_TRIP_ID = 'f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9';

export type Ldi08Row = Ldi03Row & {
  gps: Ldi03Row['gps'] & {
    latitude?: number | null;
    longitude?: number | null;
  };
  nativeEventsAtIndex?: unknown[];
};

export type Ldi08Candidate = {
  id: string;
  kind: 'ACCELERATION' | 'DECELERATION';
  startUtc: string;
  endUtc: string;
  speedStartKmh: number;
  speedEndKmh: number;
  deltaKmh: number;
  bothEndsTrustedL3: boolean;
  qcTrustStart: string;
  qcTrustEnd: string;
};

export type KinematicConfidence = 'HIGH_CONFIDENCE' | 'LIMITED' | 'CONFLICTED' | 'UNKNOWN';

function bucketMs(label: string): number {
  return Date.parse(label);
}

function isLdi03DocumentedConflict(l3Kmh: number, obdKmh: number): boolean {
  return Math.abs(obdKmh - l3Kmh) >= Math.max(5, l3Kmh * 0.25);
}

export function loadLdi08Artifacts(repoRoot: string): {
  snapshot: { rows: Ldi08Row[]; meta: Record<string, unknown> };
  candidates: Ldi08Candidate[];
  nativeOverlap: Record<string, unknown>;
} {
  const base = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-08');
  const snap = JSON.parse(
    fs.readFileSync(path.join(base, 'LDI08_COMBINED_SNAPSHOT.json'), 'utf8'),
  ) as { rows: Ldi08Row[]; [k: string]: unknown };
  const cand = JSON.parse(
    fs.readFileSync(path.join(base, 'LDI08_ACCEL_DECEL_CANDIDATES.json'), 'utf8'),
  ) as { candidates: Ldi08Candidate[] };
  const native = JSON.parse(
    fs.readFileSync(path.join(base, 'LDI08_NATIVE_EVENT_OVERLAP.json'), 'utf8'),
  ) as Record<string, unknown>;
  const { rows, ...meta } = snap;
  return { snapshot: { rows, meta }, candidates: cand.candidates, nativeOverlap: native };
}

/** Same predicate as LDI-03 `buildCoverageReport.multiStreamNumeric` (LDI-08 fusion-assessable seconds). */
export function fusionAssessableBuckets(rows: Ldi08Row[]): Ldi08Row[] {
  return rows.filter(
    (r) =>
      r.gps.availability === 'PRESENT' &&
      r.l3.speedKmh != null &&
      (r.l3.qcTrustLevel === 'TRUSTED' || r.l3.qcTrustLevel === 'TRUSTED_LIMITED') &&
      r.obd.speedKmh != null &&
      r.hf.speedKmh != null,
  );
}

export function computeCoverageIntegrity(rows: Ldi08Row[]) {
  const total = rows.length;
  let trusted = 0;
  let trustedLimited = 0;
  let untrusted = 0;
  let rowAbsent = 0;
  let unknown = 0;

  for (const r of rows) {
    if (r.gps.availability !== 'PRESENT') {
      rowAbsent += 1;
      continue;
    }
    const q = r.l3.qcTrustLevel;
    if (q === 'TRUSTED') trusted += 1;
    else if (q === 'TRUSTED_LIMITED') trustedLimited += 1;
    else if (q === 'UNTRUSTED') untrusted += 1;
    else unknown += 1;
  }

  const assessable = fusionAssessableBuckets(rows);

  return {
    shadowGridDenominator: total,
    trustedOnly: { buckets: trusted, fraction: total > 0 ? trusted / total : 0 },
    trustedOrLimited: {
      buckets: trusted + trustedLimited,
      fraction: total > 0 ? (trusted + trustedLimited) / total : 0,
    },
    untrusted: { buckets: untrusted, fraction: total > 0 ? untrusted / total : 0 },
    rowAbsent: { buckets: rowAbsent, fraction: total > 0 ? rowAbsent / total : 0 },
    unknownQc: { buckets: unknown, fraction: total > 0 ? unknown / total : 0 },
    fusionAssessable: {
      definition:
        'Single calendar bucket where gps.availability=PRESENT AND l3.speedKmh numeric AND l3.qcTrustLevel in {TRUSTED,TRUSTED_LIMITED} AND obd.speedKmh numeric AND hf.speedKmh numeric (LDI03_COVERAGE multiStreamNumeric; no interpolation)',
      denominator: 'shadow_interval_count (one row per 1s evaluation index in pin)',
      buckets: assessable.length,
      fractionOfShadowGrid: total > 0 ? assessable.length / total : 0,
      bucketLabelsUtc: assessable.map((r) => r.evaluationIndexUtc),
    },
  };
}

function classifyCandidateConfidence(
  start: Ldi08Row | undefined,
  end: Ldi08Row | undefined,
  gpsJumpSuspected: boolean,
  consecutiveGrid: boolean,
): { confidence: KinematicConfidence; reasons: string[] } {
  const reasons: string[] = [];
  if (!start || !end) {
    return { confidence: 'UNKNOWN', reasons: ['missing_start_or_end_row'] };
  }
  if (!consecutiveGrid) {
    reasons.push('non_consecutive_evaluation_indices');
  }
  if (start.gps.availability !== 'PRESENT' || end.gps.availability !== 'PRESENT') {
    reasons.push('position_row_absent_at_endpoint');
    return { confidence: 'UNKNOWN', reasons };
  }
  if (start.l3.speedKmh == null || end.l3.speedKmh == null) {
    reasons.push('missing_l3_numeric_at_endpoint');
    return { confidence: 'UNKNOWN', reasons };
  }
  if (gpsJumpSuspected) reasons.push('gps_path_implies_speed_above_l3_band');

  const conflictAtEndpoint =
    (start.obd.speedKmh != null &&
      start.l3.speedKmh != null &&
      isLdi03DocumentedConflict(start.l3.speedKmh, start.obd.speedKmh)) ||
    (end.obd.speedKmh != null &&
      end.l3.speedKmh != null &&
      isLdi03DocumentedConflict(end.l3.speedKmh, end.obd.speedKmh));

  if (
    start.l3.qcTrustLevel === 'UNTRUSTED' ||
    end.l3.qcTrustLevel === 'UNTRUSTED' ||
    conflictAtEndpoint ||
    gpsJumpSuspected
  ) {
    if (start.l3.qcReasonCodes?.includes('CROSS_SOURCE_CONFLICT')) {
      reasons.push('l3_cross_source_conflict_at_start');
    }
    if (end.l3.qcReasonCodes?.includes('CROSS_SOURCE_CONFLICT')) {
      reasons.push('l3_cross_source_conflict_at_end');
    }
    return { confidence: 'CONFLICTED', reasons };
  }

  const startOk = start.l3.qcTrustLevel === 'TRUSTED' || start.l3.qcTrustLevel === 'TRUSTED_LIMITED';
  const endOk = end.l3.qcTrustLevel === 'TRUSTED' || end.l3.qcTrustLevel === 'TRUSTED_LIMITED';
  if (!startOk || !endOk) {
    return { confidence: 'UNKNOWN', reasons: [...reasons, 'qc_not_trusted_or_limited'] };
  }

  if (start.l3.qcTrustLevel === 'TRUSTED' && end.l3.qcTrustLevel === 'TRUSTED' && consecutiveGrid) {
    return { confidence: 'HIGH_CONFIDENCE', reasons: [...reasons, 'both_endpoints_TRUSTED_consecutive_1s'] };
  }

  return {
    confidence: 'LIMITED',
    reasons: [...reasons, 'TRUSTED_LIMITED_at_one_or_both_endpoints'],
  };
}

export function analyzeAccelDecelForensics(rows: Ldi08Row[], candidates: Ldi08Candidate[]) {
  const byIndex = new Map(rows.map((r) => [r.evaluationIndexUtc, r]));
  const analyzed = candidates.map((c) => {
    const start = byIndex.get(c.startUtc);
    const end = byIndex.get(c.endUtc);
    const deltaTMs = bucketMs(c.endUtc) - bucketMs(c.startUtc);
    const consecutiveGrid = deltaTMs === 1000;

    let gpsJumpSuspected = false;
    let impliedSpeedKmh: number | null = null;
    if (
      start?.gps.latitude != null &&
      start.gps.longitude != null &&
      end?.gps.latitude != null &&
      end.gps.longitude != null &&
      deltaTMs > 0
    ) {
      const distM = haversineMeters(
        start.gps.latitude!,
        start.gps.longitude!,
        end.gps.latitude!,
        end.gps.longitude!,
      );
      impliedSpeedKmh = (distM / (deltaTMs / 1000)) * 3.6;
      const l3Max = Math.max(c.speedStartKmh, c.speedEndKmh);
      if (impliedSpeedKmh > l3Max * 1.6 + 15) gpsJumpSuspected = true;
    }

    const deltaVKmh = c.deltaKmh;
    const deltaVMs = deltaVKmh / 3.6;
    const accelMs2 = consecutiveGrid && deltaTMs > 0 ? deltaVMs / (deltaTMs / 1000) : null;

    const { confidence, reasons } = classifyCandidateConfidence(start, end, gpsJumpSuspected, consecutiveGrid);

    return {
      ...c,
      kinematics: {
        deltaVKmh,
        deltaTMs,
        deltaTSources: 'evaluationIndexUtc_calendar_seconds',
        longitudinalAccelMs2: accelMs2,
        note: 'Longitudinal accel from L3 speed delta over bucket interval — not brake pedal or regen',
      },
      qcCompatibility: {
        consecutiveValidSamples: consecutiveGrid,
        startQc: start?.l3.qcTrustLevel ?? null,
        endQc: end?.l3.qcTrustLevel ?? null,
      },
      gpsJumpScreening: {
        suspected: gpsJumpSuspected,
        impliedPathSpeedKmh: impliedSpeedKmh,
      },
      confidenceTier: confidence,
      confidenceRationale: reasons,
      notBrakePedalApplication: true,
      notRegenInference: true,
    };
  });

  const countTier = (kind: 'ACCELERATION' | 'DECELERATION', tier: KinematicConfidence) =>
    analyzed.filter((a) => a.kind === kind && a.confidenceTier === tier).length;

  return {
    schema: 'LDI09_ACCEL_DECEL_FORENSICS_V1',
    candidateCount: analyzed.length,
    accelerationCount: analyzed.filter((a) => a.kind === 'ACCELERATION').length,
    decelerationCount: analyzed.filter((a) => a.kind === 'DECELERATION').length,
    highConfidenceAcceleration: countTier('ACCELERATION', 'HIGH_CONFIDENCE'),
    highConfidenceDeceleration: countTier('DECELERATION', 'HIGH_CONFIDENCE'),
    candidates: analyzed,
  };
}

export function buildConflictClassification(rows: Ldi08Row[]) {
  const conflicts = analyzeConflicts(rows as Ldi03Row[]);
  const enriched = conflicts.map((c) => {
    const row = rows.find((r) => r.evaluationIndexUtc === c.evaluationIndexUtc);
    const hfAvailable = row?.hf.speedKmh != null;
    const resolvable =
      c.disposition === 'EXPLAINED' ||
      c.disposition === 'NOT_COMPARABLE'
        ? 'YES_without_interpolation'
        : 'NO_automatic_resolution_requires_independent_sample_or_owner_policy';
    return {
      ...c,
      hfAvailable,
      hfSpeedKmh: row?.hf.speedKmh ?? null,
      temporalAlignmentUncertainty:
        'INTERVAL_ONLY_OBD_bucket_label; calendar co-index not point-synchronous',
      resolvableWithoutInterpolation: resolvable,
      possibleCauseSummary: [...c.possibleTimeShiftCause, ...c.possiblePhysicalDeviationCause],
    };
  });
  return {
    schema: 'LDI09_CONFLICT_CLASSIFICATION_V1',
    conflictRule: 'LDI03_documented: abs(obd-l3) >= max(5 km/h, 25% of L3)',
    total: enriched.length,
    explained: enriched.filter((c) => c.disposition === 'EXPLAINED').length,
    unresolved: enriched.filter((c) => c.disposition === 'UNRESOLVED').length,
    notComparable: enriched.filter((c) => c.disposition === 'NOT_COMPARABLE').length,
    conflicts: enriched,
  };
}

export function buildLdi09ResultLines(input: {
  strictTrustedPct: number;
  trustedLimitedPct: number;
  fusionAssessable: number;
  accelCandidates: number;
  accelHigh: number;
  decelCandidates: number;
  decelHigh: number;
  conflictsTotal: number;
  conflictsExplained: number;
  conflictsUnresolved: number;
  nativeCorners: number;
}): string[] {
  return [
    'LDI09_RESULT=OFFLINE_FORENSICS_COMPLETE',
    `STRICT_TRUSTED_COVERAGE=${input.strictTrustedPct.toFixed(1)}pct`,
    `TRUSTED_LIMITED_COVERAGE=${input.trustedLimitedPct.toFixed(1)}pct`,
    `FUSION_ASSESSABLE_SECONDS=${input.fusionAssessable}`,
    `ACCEL_CANDIDATES=${input.accelCandidates}`,
    `ACCEL_HIGH_CONFIDENCE=${input.accelHigh}`,
    `DECEL_CANDIDATES=${input.decelCandidates}`,
    `DECEL_HIGH_CONFIDENCE=${input.decelHigh}`,
    `CONFLICTS_TOTAL=${input.conflictsTotal}`,
    `CONFLICTS_EXPLAINED=${input.conflictsExplained}`,
    `CONFLICTS_UNRESOLVED=${input.conflictsUnresolved}`,
    `NATIVE_CORNER_EVENTS=${input.nativeCorners}`,
    'BRAKE_PEDAL_CONFIRMED=NO_not_in_pin',
    'REGEN_CONFIRMED=NO_not_in_pin',
    'PRODUCTION_MUTATIONS=NONE',
    'NEXT_SAFE_ACTION=Owner_review_unresolved_conflicts_and_capture_dense_GPS_trip_for_event_matrix',
  ];
}

export { analyzeCadence };
