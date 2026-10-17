/**
 * LDI-10D Phase 3C — GPS / L3 speed accuracy research (offline, read-only).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CALIBRATION_UNSET_V0_BUNDLE } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/calibration/CALIBRATION_UNSET_V0';
import { evaluateL3AtCenter } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/kinematics/l3-eligibility';
import { classifyPositionRows } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/position/hold-release';
import type { NormalizedPositionObservation } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/types';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import { loadLdi08Artifacts, type Ldi08Row } from './ldi09-accel-decel-signal-forensics.lib';
import { buildPhase3aTimeline } from './ldi10d-phase3a-temporal-events.lib';
import { PHASE3A_EXPECTED, verifyPhase3bPreflight } from './ldi10d-phase3b-trip-continuity.lib';

export { PHASE3A_EXPECTED };

export const PINNED_TRIP_ID = 'f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9';

export const VIDEO_EVIDENCE = {
  comparisonRel:
    'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/external-video-review-kompakt-2026-10-16/analysis/results/comparison.json',
  metricsRel:
    'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/external-video-review-kompakt-2026-10-16/analysis/results/metrics.json',
  protocolRel:
    'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/external-video-review-kompakt-2026-10-16/analysis/evaluation-protocol.json',
  pinnedSnapshotHash:
    'DI_V0_S4_EVIDENCE_V1:sha256:c703e9c41e5e65ab643f9416c469818d88a0fbfa93218885d7c5beb6fa284503',
  calibrationStand: 'EXP021_V0_2_FROZEN_PRE_DEPLOY_BASELINE',
} as const;

/** Frozen historical paired metrics (lag 0, TRUSTED L3 + tacho) — do not retune. */
export const VIDEO_BASELINE_EXPECTED = {
  pairedN: 748,
  maeKmh: 2.303091434778604,
  p95Kmh: 4.485008608925095,
  biasKmh: -2.067576220371462,
  toleranceMae: 0.02,
  toleranceP95: 0.02,
  toleranceBias: 0.02,
};

export const ALGORITHM_IDS = [
  'L3_BASELINE_PRODUCTION',
  'L3_REPLAY_FROM_PINNED_POSITIONS',
  'ADAPTIVE_DT_LEG_MEAN',
  'MEDIAN_LEG_3S',
  'CAUSAL_EMA_LEGS',
  'MOTION_GATE_DISPLACEMENT',
  'NONCAUSAL_OFFLINE_CENTERED_MEAN',
] as const;

export type AlgorithmId = (typeof ALGORITHM_IDS)[number];

export type ComparisonRow = {
  bucketLabelUtc: string;
  positionAvailability: string;
  positionState: string;
  l3SpeedKmh: number | null;
  qcTrustLevel: string;
  tachoKmh: number | null;
  videoFile: string | null;
};

export type ErrorStats = {
  n: number;
  maeKmh: number | null;
  rmseKmh: number | null;
  p95AbsKmh: number | null;
  maxAbsKmh: number | null;
  biasKmh: number | null;
};

export function verifyPhase3cPreflight(repoRoot: string): {
  ok: boolean;
  errors: string[];
  inputIntegrity: 'PASS' | 'FAIL';
  phase3aDrift: 'NONE' | 'DRIFT';
} {
  const p3b = verifyPhase3bPreflight(repoRoot);
  const errors = [...p3b.errors];
  for (const rel of [VIDEO_EVIDENCE.comparisonRel, VIDEO_EVIDENCE.metricsRel, VIDEO_EVIDENCE.protocolRel]) {
    if (!fs.existsSync(path.join(repoRoot, rel))) errors.push(`missing ${rel}`);
  }
  const replay = buildPhase3aTimeline(repoRoot);
  const drift = replay.events.length !== PHASE3A_EXPECTED.eventsTotal ? 'DRIFT' : 'NONE';
  if (drift === 'DRIFT') errors.push(`phase3a replay events=${replay.events.length}`);
  return {
    ok: errors.length === 0,
    errors,
    inputIntegrity: errors.length === 0 ? 'PASS' : 'FAIL',
    phase3aDrift: drift,
  };
}

function labelMs(label: string): number {
  return Date.parse(label);
}

function bucketLabelPlusSeconds(label: string, seconds: number): string {
  return new Date(labelMs(label) + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function bucketLabelMinusSeconds(label: string, seconds: number): string {
  return new Date(labelMs(label) - seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function ldi08RowsToObservations(rows: Ldi08Row[]): NormalizedPositionObservation[] {
  return rows.map((r) => {
    const label = r.evaluationIndexUtc;
    if (r.gps.availability !== 'PRESENT' || r.gps.latitude == null || r.gps.longitude == null) {
      return {
        bucketLabel: label,
        intervalStart: label,
        intervalEnd: label,
        referenceTime: label,
        availability: r.gps.availability === 'SIGNAL_NULL' ? 'SIGNAL_NULL' : 'ROW_ABSENT',
        sourceFamily: 'RUPTELA_R1',
        provenance: { sourceSignal: 'LDI08_PIN', derivedFrom: ['LDI10D_PHASE3C_OFFLINE'] },
      };
    }
    return {
      bucketLabel: label,
      intervalStart: label,
      intervalEnd: label,
      referenceTime: label,
      availability: 'PRESENT',
      latitude: r.gps.latitude!,
      longitude: r.gps.longitude!,
      sourceFamily: 'RUPTELA_R1',
      provenance: { sourceSignal: 'LDI08_PIN', derivedFrom: ['LDI10D_PHASE3C_OFFLINE'] },
    };
  });
}

function legSpeedKmh(
  lat0: number,
  lon0: number,
  lat1: number,
  lon1: number,
  dtSec: number,
): number | null {
  if (dtSec <= 0 || !Number.isFinite(dtSec)) return null;
  const d = haversineMeters(lat0, lon0, lat1, lon1);
  return (d / dtSec) * 3.6;
}

function isFrozenCoord(a: { lat: number; lon: number }, b: { lat: number; lon: number }): boolean {
  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lon - b.lon) < 1e-7;
}

export type TripSpeedPoint = {
  utc: string;
  algorithm: AlgorithmId;
  speedKmh: number | null;
  abstainReason: string | null;
  causal: boolean;
};

export function fixtureRowsToObservations(
  rows: Array<{
    bucketLabelUtc: string;
    availability: string;
    latitude: number | null;
    longitude: number | null;
  }>,
): NormalizedPositionObservation[] {
  return rows.map((r) => {
    if (r.availability !== 'PRESENT' || r.latitude == null || r.longitude == null) {
      return {
        bucketLabel: r.bucketLabelUtc,
        intervalStart: r.bucketLabelUtc,
        intervalEnd: r.bucketLabelUtc,
        referenceTime: r.bucketLabelUtc,
        availability: r.availability === 'SIGNAL_NULL' ? 'SIGNAL_NULL' : 'ROW_ABSENT',
        sourceFamily: 'API_SYNTHETIC',
        provenance: { sourceSignal: 'TESLA_FIXTURE', derivedFrom: ['LDI10D_PHASE3C2'] },
      };
    }
    return {
      bucketLabel: r.bucketLabelUtc,
      intervalStart: r.bucketLabelUtc,
      intervalEnd: r.bucketLabelUtc,
      referenceTime: r.bucketLabelUtc,
      availability: 'PRESENT',
      latitude: r.latitude,
      longitude: r.longitude,
      sourceFamily: 'API_SYNTHETIC',
      provenance: { sourceSignal: 'TESLA_FIXTURE', derivedFrom: ['LDI10D_PHASE3C2'] },
    };
  });
}

export function computeCandidateSpeed(
  algo: AlgorithmId,
  classified: ReturnType<typeof classifyPositionRows>,
  centerIndex: number,
  emaState: { value: number | null },
): { speedKmh: number | null; abstainReason: string | null } {
  const center = classified[centerIndex];
  const label = center.observation.bucketLabel;

  if (algo === 'L3_BASELINE_PRODUCTION' || algo === 'L3_REPLAY_FROM_PINNED_POSITIONS') {
    const l3 = evaluateL3AtCenter(classified, centerIndex);
    return { speedKmh: l3.speedKmh, abstainReason: l3.abstentionReason };
  }

  const prevLabel = bucketLabelMinusSeconds(label, 1);
  const nextLabel = bucketLabelPlusSeconds(label, 1);
  const labelMap = new Map(classified.map((r, i) => [r.observation.bucketLabel, i]));
  const pi = labelMap.get(prevLabel);
  const ni = labelMap.get(nextLabel);
  if (pi === undefined || ni === undefined) {
    return { speedKmh: null, abstainReason: 'INCOMPLETE_SUPPORT' };
  }
  const prev = classified[pi];
  const next = classified[ni];
  const support = [prev, center, next];
  for (const row of support) {
    if (row.observation.availability !== 'PRESENT' || row.coord == null) {
      return { speedKmh: null, abstainReason: 'ROW_ABSENT_OR_INVALID' };
    }
    if (row.positionState === 'RELEASE' || row.positionState === 'FROZEN_UNRESOLVED') {
      return { speedKmh: null, abstainReason: 'POSITION_HOLD_OR_RELEASE' };
    }
  }

  const c0 = prev.coord!;
  const c1 = center.coord!;
  const c2 = next.coord!;
  if (
    isFrozenCoord(
      { lat: c0.latitude, lon: c0.longitude },
      { lat: c1.latitude, lon: c1.longitude },
    ) ||
    isFrozenCoord(
      { lat: c1.latitude, lon: c1.longitude },
      { lat: c2.latitude, lon: c2.longitude },
    )
  ) {
    return { speedKmh: null, abstainReason: 'FROZEN_COORDINATE_NO_INVENTED_STILLSTAND' };
  }

  const dt1 = (labelMs(label) - labelMs(prev.observation.bucketLabel)) / 1000;
  const dt2 = (labelMs(next.observation.bucketLabel) - labelMs(label)) / 1000;
  const v1 = legSpeedKmh(c0.latitude, c0.longitude, c1.latitude, c1.longitude, dt1);
  const v2 = legSpeedKmh(c1.latitude, c1.longitude, c2.latitude, c2.longitude, dt2);
  if (v1 == null || v2 == null) return { speedKmh: null, abstainReason: 'INVALID_LEG' };

  if (algo === 'ADAPTIVE_DT_LEG_MEAN') {
    return { speedKmh: (v1 + v2) / 2, abstainReason: null };
  }
  if (algo === 'MEDIAN_LEG_3S') {
    return { speedKmh: [v1, v2].sort((a, b) => a - b)[0], abstainReason: null };
  }
  if (algo === 'MOTION_GATE_DISPLACEMENT') {
    const d1 = haversineMeters(c0.latitude, c0.longitude, c1.latitude, c1.longitude);
    const d2 = haversineMeters(c1.latitude, c1.longitude, c2.latitude, c2.longitude);
    if (d1 < 0.5 && d2 < 0.5) {
      return { speedKmh: null, abstainReason: 'MOTION_GATE_LOW_DISPLACEMENT' };
    }
    return { speedKmh: (v1 + v2) / 2, abstainReason: null };
  }
  if (algo === 'CAUSAL_EMA_LEGS') {
    const alpha = 0.35;
    const leg = v2;
    emaState.value =
      emaState.value == null ? leg : alpha * leg + (1 - alpha) * emaState.value;
    return { speedKmh: emaState.value, abstainReason: null };
  }
  if (algo === 'NONCAUSAL_OFFLINE_CENTERED_MEAN') {
    const window: number[] = [];
    for (let k = centerIndex - 2; k <= centerIndex + 2; k++) {
      if (k < 1 || k >= classified.length) continue;
      const a = classified[k - 1];
      const b = classified[k];
      if (a.coord == null || b.coord == null) continue;
      if (a.observation.availability !== 'PRESENT' || b.observation.availability !== 'PRESENT') continue;
      const dt = (labelMs(b.observation.bucketLabel) - labelMs(a.observation.bucketLabel)) / 1000;
      const v = legSpeedKmh(a.coord.latitude, a.coord.longitude, b.coord.latitude, b.coord.longitude, dt);
      if (v != null) window.push(v);
    }
    if (window.length < 2) return { speedKmh: null, abstainReason: 'NONCAUSAL_WINDOW_TOO_SPARSE' };
    const mean = window.reduce((s, x) => s + x, 0) / window.length;
    return { speedKmh: mean, abstainReason: null };
  }

  return { speedKmh: null, abstainReason: 'UNKNOWN_ALGORITHM' };
}

export function computeErrorStats(pairs: Array<{ pred: number; ref: number }>): ErrorStats {
  if (pairs.length === 0) {
    return { n: 0, maeKmh: null, rmseKmh: null, p95AbsKmh: null, maxAbsKmh: null, biasKmh: null };
  }
  const err = pairs.map((p) => p.pred - p.ref);
  const abs = err.map((e) => Math.abs(e));
  const sorted = [...abs].sort((a, b) => a - b);
  const p95Idx = Math.min(sorted.length - 1, Math.floor(0.95 * (sorted.length - 1)));
  const mse = err.reduce((s, e) => s + e * e, 0) / err.length;
  return {
    n: pairs.length,
    maeKmh: abs.reduce((s, x) => s + x, 0) / abs.length,
    rmseKmh: Math.sqrt(mse),
    p95AbsKmh: sorted[p95Idx],
    maxAbsKmh: sorted[sorted.length - 1],
    biasKmh: err.reduce((s, x) => s + x, 0) / err.length,
  };
}

export function loadVideoComparison(repoRoot: string): ComparisonRow[] {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot, VIDEO_EVIDENCE.comparisonRel), 'utf8'),
  ) as ComparisonRow[];
}

export function videoPairedTrustedRows(rows: ComparisonRow[]): ComparisonRow[] {
  return rows.filter(
    (r) =>
      r.tachoKmh != null &&
      r.l3SpeedKmh != null &&
      r.qcTrustLevel === 'TRUSTED',
  );
}

export function reproduceVideoBaselineMetrics(rows: ComparisonRow[]): ErrorStats {
  const paired = videoPairedTrustedRows(rows);
  return computeErrorStats(
    paired.map((r) => ({ pred: r.l3SpeedKmh!, ref: r.tachoKmh! })),
  );
}

export function isHoldoutRow(row: ComparisonRow, holdoutClips: string[]): boolean {
  if (!row.videoFile) return false;
  return holdoutClips.some((c) => row.videoFile === c);
}

export type Phase3cResearch = {
  tripId: string;
  tripBuckets: number;
  gpsPresent: number;
  rowAbsent: number;
  l3ReplayVsPinned: ErrorStats;
  algorithmsOnTrip: Record<
    string,
    {
      numericCoverage: number;
      trustedCoverage: number;
      vsPinnedL3: ErrorStats;
      vsObdWitness: ErrorStats;
      causal: boolean;
    }
  >;
  videoValidation: {
    historicalBaselineReproduced: boolean;
    baselineStats: ErrorStats;
    independentHoldout: {
      status: 'PRELIMINARY' | 'NOT_ASSESSABLE';
      holdoutClips: string[];
      developmentSubsetStats: ErrorStats;
      holdoutSubsetStats: ErrorStats;
      note: string;
    };
    candidateVsTacho: Record<string, ErrorStats | { status: 'NOT_ASSESSABLE'; reason: string }>;
  };
  errorAnalysis: {
    frozenCoordinateRuns: number;
    frozenCoordinateBuckets: number;
    positionJumpsOver50m: number;
    unevenDtBuckets: number;
    repeatedCoordinateWithNonzeroL3: number;
    lowSpeedBelow10KmhBuckets: number;
    obdL3ConflictBuckets: number;
  };
  comparisonMatrix: Array<{
    algorithm: AlgorithmId;
    tripVsPinnedMae: number | null;
    videoVsTachoMae: number | null;
    videoCoverage: number | null;
    risks: string[];
  }>;
  bestValidatedCandidate: AlgorithmId;
};

export function runPhase3cResearch(repoRoot: string): Phase3cResearch {
  const { snapshot } = loadLdi08Artifacts(repoRoot);
  const rows = snapshot.rows;
  const observations = ldi08RowsToObservations(rows);
  const classified = classifyPositionRows(observations, CALIBRATION_UNSET_V0_BUNDLE);

  const pinnedByUtc = new Map(rows.map((r) => [r.evaluationIndexUtc, r]));

  const replayPairs: Array<{ pred: number; ref: number }> = [];
  for (let i = 0; i < classified.length; i++) {
    const utc = classified[i].observation.bucketLabel;
    const pinned = pinnedByUtc.get(utc);
    const l3 = evaluateL3AtCenter(classified, i);
    if (l3.speedKmh != null && pinned?.l3.speedKmh != null) {
      replayPairs.push({ pred: l3.speedKmh, ref: pinned.l3.speedKmh });
    }
  }
  const l3ReplayVsPinned = computeErrorStats(replayPairs);

  const algorithmsOnTrip: Phase3cResearch['algorithmsOnTrip'] = {};
  for (const algo of ALGORITHM_IDS) {
    const emaState = { value: null as number | null };
    const vsPinned: Array<{ pred: number; ref: number }> = [];
    const vsObd: Array<{ pred: number; ref: number }> = [];
    let numeric = 0;
    let trusted = 0;
    for (let i = 0; i < classified.length; i++) {
      const utc = classified[i].observation.bucketLabel;
      const pinned = pinnedByUtc.get(utc);
      const { speedKmh } = computeCandidateSpeed(algo, classified, i, emaState);
      if (speedKmh != null) {
        numeric += 1;
        if (pinned?.l3.qcTrustLevel === 'TRUSTED' || pinned?.l3.qcTrustLevel === 'TRUSTED_LIMITED') {
          trusted += 1;
        }
        if (pinned?.l3.speedKmh != null) {
          vsPinned.push({ pred: speedKmh, ref: pinned.l3.speedKmh });
        }
        if (pinned?.obd.speedKmh != null) {
          vsObd.push({ pred: speedKmh, ref: pinned.obd.speedKmh });
        }
      }
    }
    algorithmsOnTrip[algo] = {
      numericCoverage: numeric / rows.length,
      trustedCoverage: trusted / rows.length,
      vsPinnedL3: computeErrorStats(vsPinned),
      vsObdWitness: computeErrorStats(vsObd),
      causal: algo !== 'NONCAUSAL_OFFLINE_CENTERED_MEAN',
    };
  }

  const comparison = loadVideoComparison(repoRoot);
  const baselineStats = reproduceVideoBaselineMetrics(comparison);
  const protocol = JSON.parse(
    fs.readFileSync(path.join(repoRoot, VIDEO_EVIDENCE.protocolRel), 'utf8'),
  ) as { holdout_clips: string[] };
  const holdoutClips = protocol.holdout_clips ?? [];
  const devRows = videoPairedTrustedRows(comparison).filter((r) => !isHoldoutRow(r, holdoutClips));
  const holdoutRows = videoPairedTrustedRows(comparison).filter((r) => isHoldoutRow(r, holdoutClips));

  const historicalBaselineReproduced =
    baselineStats.n === VIDEO_BASELINE_EXPECTED.pairedN &&
    baselineStats.maeKmh != null &&
    Math.abs(baselineStats.maeKmh - VIDEO_BASELINE_EXPECTED.maeKmh) <= VIDEO_BASELINE_EXPECTED.toleranceMae &&
    baselineStats.p95AbsKmh != null &&
    Math.abs(baselineStats.p95AbsKmh - VIDEO_BASELINE_EXPECTED.p95Kmh) <=
      VIDEO_BASELINE_EXPECTED.toleranceP95 &&
    baselineStats.biasKmh != null &&
    Math.abs(baselineStats.biasKmh - VIDEO_BASELINE_EXPECTED.biasKmh) <= VIDEO_BASELINE_EXPECTED.toleranceBias;

  const candidateVsTacho: Phase3cResearch['videoValidation']['candidateVsTacho'] = {};
  for (const algo of ALGORITHM_IDS) {
    if (algo === 'L3_BASELINE_PRODUCTION') {
      candidateVsTacho[algo] = baselineStats;
    } else {
      candidateVsTacho[algo] = {
        status: 'NOT_ASSESSABLE',
        reason:
          'Pinned DIMO POSITION channel coordinates not present in repo (payload sha256 only); cannot recompute candidate speeds on identical video reference seconds without new fetch.',
      };
    }
  }

  let frozenRuns = 0;
  let frozenBuckets = 0;
  let jumps = 0;
  let unevenDt = 0;
  let repeatedNonzero = 0;
  let lowSpeed = 0;
  let obdConflict = 0;

  let runLen = 1;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    if (a.gps.availability === 'PRESENT' && b.gps.availability === 'PRESENT') {
      const dt = (labelMs(b.evaluationIndexUtc) - labelMs(a.evaluationIndexUtc)) / 1000;
      if (dt !== 1) unevenDt += 1;
      if (a.gps.latitude != null && b.gps.latitude != null) {
        const frozen = isFrozenCoord(
          { lat: a.gps.latitude, lon: a.gps.longitude! },
          { lat: b.gps.latitude, lon: b.gps.longitude! },
        );
        if (frozen) {
          runLen += 1;
          frozenBuckets += 1;
          if (b.l3.speedKmh != null && b.l3.speedKmh > 0.5) repeatedNonzero += 1;
        } else {
          if (runLen >= 2) frozenRuns += 1;
          runLen = 1;
          const d = haversineMeters(a.gps.latitude, a.gps.longitude!, b.gps.latitude, b.gps.longitude!);
          if (dt > 0 && d / dt > 50) jumps += 1;
        }
      }
    }
    if (b.l3.speedKmh != null && b.l3.speedKmh < 10) lowSpeed += 1;
    if (
      b.l3.speedKmh != null &&
      b.obd.speedKmh != null &&
      Math.abs(b.obd.speedKmh - b.l3.speedKmh) >= Math.max(5, b.l3.speedKmh * 0.25)
    ) {
      obdConflict += 1;
    }
  }

  const comparisonMatrix: Phase3cResearch['comparisonMatrix'] = ALGORITHM_IDS.map((algo) => {
    const trip = algorithmsOnTrip[algo];
    const videoEntry = candidateVsTacho[algo];
    const videoMae =
      'n' in videoEntry && videoEntry.maeKmh != null ? videoEntry.maeKmh : null;
    const videoCov = 'n' in videoEntry ? videoEntry.n / comparison.length : null;
    const risks: string[] = [];
    if (!trip.causal) risks.push('NONCAUSAL_OFFLINE_ONLY_NOT_FOR_PRODUCTION_STREAM');
    if (algo === 'CAUSAL_EMA_LEGS') risks.push('LAG_UNDER_ACCELERATION');
    if (algo === 'MOTION_GATE_DISPLACEMENT') risks.push('COVERAGE_LOSS_AT_CRAWL');
    if (algo === 'MEDIAN_LEG_3S') risks.push('ASYMMETRIC_LEGS_BIAS');
    return {
      algorithm: algo,
      tripVsPinnedMae: trip.vsPinnedL3.maeKmh,
      videoVsTachoMae: videoMae,
      videoCoverage: videoCov,
      risks,
    };
  });

  let bestValidated: AlgorithmId = 'L3_BASELINE_PRODUCTION';
  let bestMae = baselineStats.maeKmh ?? Infinity;
  for (const row of comparisonMatrix) {
    if (row.videoVsTachoMae != null && row.videoVsTachoMae < bestMae) {
      bestMae = row.videoVsTachoMae;
      bestValidated = row.algorithm;
    }
  }

  return {
    tripId: PINNED_TRIP_ID,
    tripBuckets: rows.length,
    gpsPresent: rows.filter((r) => r.gps.availability === 'PRESENT').length,
    rowAbsent: rows.filter((r) => r.gps.availability === 'ROW_ABSENT').length,
    l3ReplayVsPinned,
    algorithmsOnTrip,
    videoValidation: {
      historicalBaselineReproduced,
      baselineStats,
      independentHoldout: {
        status: 'PRELIMINARY',
        holdoutClips,
        developmentSubsetStats: computeErrorStats(
          devRows.map((r) => ({ pred: r.l3SpeedKmh!, ref: r.tachoKmh! })),
        ),
        holdoutSubsetStats: computeErrorStats(
          holdoutRows.map((r) => ({ pred: r.l3SpeedKmh!, ref: r.tachoKmh! })),
        ),
        note:
          'Holdout clips excluded from development subset; optimization not performed. Tacho is reference witness, not OBD ground truth. Full blind validation requires future drives.',
      },
      candidateVsTacho,
    },
    errorAnalysis: {
      frozenCoordinateRuns: frozenRuns,
      frozenCoordinateBuckets: frozenBuckets,
      positionJumpsOver50m: jumps,
      unevenDtBuckets: unevenDt,
      repeatedCoordinateWithNonzeroL3: repeatedNonzero,
      lowSpeedBelow10KmhBuckets: lowSpeed,
      obdL3ConflictBuckets: obdConflict,
    },
    comparisonMatrix,
    bestValidatedCandidate: bestValidated,
  };
}
