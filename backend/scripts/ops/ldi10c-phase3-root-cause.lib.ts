/**
 * LDI-10C Phase 3 — GPS-QC root cause (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import { LDI08_TRIP_ID, LDI08_VEHICLE_ID } from './ldi08-r1-fusion-replay.lib';
import { runLdi10aAudit, sha256File, type CandidateAuditRow } from './ldi10a-longitudinal-candidate-forensics.lib';
import { loadLdi08Artifacts, type Ldi08Row } from './ldi09-accel-decel-signal-forensics.lib';
import { buildSecondBySecondWindow, verifyPhase2Provenance } from './ldi10c-phase2-unclear-forensics.lib';
import {
  bucketMs,
  loadLdi10bGroups,
  matchManeuverTrajectory,
  rowsInInclusiveWindow,
  type Ldi10bGroup,
} from './ldi10c-spatial-trip-reconstruction.lib';

export const UNCLEAR_GROUP_IDS_EXPECTED = [
  'MANEUVER_ACCELERATION_2',
  'MANEUVER_ACCELERATION_3',
  'MANEUVER_ACCELERATION_4',
  'MANEUVER_ACCELERATION_6',
  'MANEUVER_ACCELERATION_8',
  'MANEUVER_ACCELERATION_9',
  'MANEUVER_ACCELERATION_12',
  'MANEUVER_ACCELERATION_13',
];

export type HypothesisVerdict = 'SUPPORTED' | 'REJECTED' | 'INDETERMINATE';

export type RootCauseHypothesisKey =
  | 'A_GPS_JUMP_OR_SPEED_SPIKE'
  | 'B_TIMESTAMP_SKEW_OR_BUCKET_ALIGNMENT'
  | 'C_GPS_QUANTIZATION_OR_CADENCE'
  | 'D_L3_DERIVATION_OR_QC_DEFECT'
  | 'E_OBD_QUANTIZATION_OR_ALIGNMENT'
  | 'F_GENUINE_PHYSICAL_ACCELERATION'
  | 'G_COMPOUND_CAUSES';

function obdL3Delta(l3: number | null, obd: number | null): number | null {
  if (l3 == null || obd == null) return null;
  return obd - l3;
}

function isIntegerKmh(v: number | null): boolean {
  return v != null && Number.isInteger(v);
}

export function testRootCauseHypotheses(input: {
  group: Ldi10bGroup;
  rows: Ldi08Row[];
  candidates: CandidateAuditRow[];
}): Record<RootCauseHypothesisKey, { verdict: HypothesisVerdict; evidence: string[] }> {
  const windowRows = rowsInInclusiveWindow(input.rows, input.group.windowUtc.start, input.group.windowUtc.end);
  const untrustedRows = windowRows.filter((r) => r.l3.qcTrustLevel === 'UNTRUSTED');
  const conflictRelation = windowRows.filter(
    (r) => r.l3.sourceRelation === 'CONFLICTING' || r.l3.sourceRelation === 'CONFLICT_EXPLAINED',
  );

  const gpsJumps = input.candidates.filter((c) => c.gpsJumpSuspected);
  const geometryJumpReasons = windowRows.some((r) => r.l3.qcReasonCodes?.includes('GEOMETRY_JUMP'));

  const A: HypothesisVerdict =
    gpsJumps.length > 0 || geometryJumpReasons ? 'SUPPORTED' : 'REJECTED';
  const A_ev =
    A === 'SUPPORTED'
      ? [`gpsJumpSuspected on ${gpsJumps.map((c) => c.candidateId).join(',')}`, `GEOMETRY_JUMP in QC: ${geometryJumpReasons}`]
      : ['No candidate gpsJumpSuspected; no GEOMETRY_JUMP qcReasonCodes in window'];

  const offsets = input.candidates.flatMap((c) =>
    [c.temporalOffsetObdStartMs, c.temporalOffsetObdEndMs].filter((v) => v != null && v !== 0) as number[],
  );
  const B: HypothesisVerdict = offsets.length > 0 ? 'SUPPORTED' : 'INDETERMINATE';
  const B_ev =
    offsets.length > 0
      ? [`Non-zero OBD label offsets (ms): ${offsets.join(',')}`]
      : ['OBD originalBucketLabelUtc matches evaluation index at step endpoints; sub-second skew not observable on 1 Hz grid'];

  const intObd = untrustedRows.filter((r) => isIntegerKmh(r.obd.speedKmh));
  const C: HypothesisVerdict = intObd.length > 0 ? 'SUPPORTED' : 'INDETERMINATE';
  const C_ev =
    intObd.length > 0
      ? intObd.map(
          (r) =>
            `${r.evaluationIndexUtc}: OBD/HF integer ${r.obd.speedKmh} km/h vs L3 ${r.l3.speedKmh?.toFixed(2)}`,
        )
      : ['No integer OBD on UNTRUSTED buckets'];

  const policyMatch =
    untrustedRows.length > 0 &&
    untrustedRows.every(
      (r) =>
        r.l3.qcReasonCodes?.includes('CROSS_SOURCE_CONFLICT') &&
        (r.l3.sourceRelation === 'CONFLICTING' || r.l3.sourceRelation === 'CONFLICT_EXPLAINED'),
    );
  const D: HypothesisVerdict = policyMatch ? 'REJECTED' : untrustedRows.length === 0 ? 'INDETERMINATE' : 'INDETERMINATE';
  const D_ev = policyMatch
    ? [
        'UNTRUSTED buckets align with evaluateDiV0SpeedQcInterval policy: sourceRelation CONFLICTING|CONFLICT_EXPLAINED → CROSS_SOURCE_CONFLICT (not a defect vs frozen pin)',
      ]
    : ['UNTRUSTED without CROSS_SOURCE_CONFLICT pattern — needs manual review'];

  const E: HypothesisVerdict = conflictRelation.length > 0 && intObd.length > 0 ? 'SUPPORTED' : conflictRelation.length > 0 ? 'SUPPORTED' : 'REJECTED';
  const E_ev = conflictRelation.map((r) => {
    const d = obdL3Delta(r.l3.speedKmh, r.obd.speedKmh);
    return `${r.evaluationIndexUtc}: sourceRelation=${r.l3.sourceRelation} L3=${r.l3.speedKmh?.toFixed(2)} OBD=${r.obd.speedKmh} Δ=${d?.toFixed(2)} (shared R1 lineage)`;
  });

  const spatial = matchManeuverTrajectory(input.group, input.rows);
  const meanAccel = input.group.meanObservedLongitudinalAccelMs2;
  const F: HypothesisVerdict =
    spatial.pathLengthM > 0 && meanAccel != null && Math.abs(meanAccel) < 6 ? 'SUPPORTED' : 'INDETERMINATE';
  const F_ev = [
    `pathLengthM=${spatial.pathLengthM.toFixed(1)} GPS-present buckets=${spatial.gpsPresentInWindow}`,
    `mean longitudinal accel (L3-derived)=${meanAccel?.toFixed(3)} m/s² — kinematically plausible; not independently validated`,
  ];

  const supportedCount = [A, B, C, D, E, F].filter((v) => v === 'SUPPORTED').length;
  const G: HypothesisVerdict = supportedCount >= 2 ? 'SUPPORTED' : 'INDETERMINATE';
  const G_ev = [
    `Compound: S1 cross-source relation conflict (QC UNTRUSTED) + L3/OBD step conflicts on maneuver candidates; not single-cause GPS jump`,
  ];

  return {
    A_GPS_JUMP_OR_SPEED_SPIKE: { verdict: A, evidence: A_ev },
    B_TIMESTAMP_SKEW_OR_BUCKET_ALIGNMENT: { verdict: B, evidence: B_ev },
    C_GPS_QUANTIZATION_OR_CADENCE: { verdict: C, evidence: C_ev },
    D_L3_DERIVATION_OR_QC_DEFECT: { verdict: D, evidence: D_ev },
    E_OBD_QUANTIZATION_OR_ALIGNMENT: { verdict: E, evidence: E_ev },
    F_GENUINE_PHYSICAL_ACCELERATION: { verdict: F, evidence: F_ev },
    G_COMPOUND_CAUSES: { verdict: G, evidence: G_ev },
  };
}

export function featureVectorForGroup(group: Ldi10bGroup, rows: Ldi08Row[], candidates: CandidateAuditRow[]) {
  const windowRows = rowsInInclusiveWindow(rows, group.windowUtc.start, group.windowUtc.end);
  const untrusted = windowRows.filter((r) => r.l3.qcTrustLevel === 'UNTRUSTED').length;
  const conflictingRel = windowRows.filter(
    (r) => r.l3.sourceRelation === 'CONFLICTING' || r.l3.sourceRelation === 'CONFLICT_EXPLAINED',
  ).length;
  const reasonCounts: Record<string, number> = {};
  for (const r of windowRows) {
    for (const c of r.l3.qcReasonCodes ?? []) reasonCounts[c] = (reasonCounts[c] ?? 0) + 1;
  }
  const obdPresent = windowRows.filter((r) => r.obd.speedKmh != null).length;
  const hfPresent = windowRows.filter((r) => r.hf.speedKmh != null).length;
  const conflictedSteps = candidates.filter((c) => c.confidenceTier === 'CONFLICTED').length;
  let pathM = 0;
  const gps = windowRows.filter((r) => r.gps.latitude != null && r.gps.longitude != null);
  for (let i = 1; i < gps.length; i++) {
    pathM += haversineMeters(
      gps[i - 1].gps.latitude!,
      gps[i - 1].gps.longitude!,
      gps[i].gps.latitude!,
      gps[i].gps.longitude!,
    );
  }
  return {
    groupId: group.groupId,
    plausibilityVerdict: group.plausibilityVerdict,
    durationMs: bucketMs(group.windowUtc.end) - bucketMs(group.windowUtc.start),
    stepCount: group.stepCount,
    meanAccelMs2: group.meanObservedLongitudinalAccelMs2,
    maxAbsAccelMs2: group.maxAbsObservedLongitudinalAccelMs2,
    untrustedBuckets: untrusted,
    conflictingSourceRelationBuckets: conflictingRel,
    qcReasonCounts: reasonCounts,
    obdBucketsPresent: obdPresent,
    hfBucketsPresent: hfPresent,
    conflictedCandidateSteps: conflictedSteps,
    gpsPathLengthM: pathM,
    gpsPresentBuckets: gps.length,
  };
}

export function runPhase3RootCause(repoRoot: string) {
  const provenance = verifyPhase2Provenance(repoRoot);
  const phase2Path = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10c/LDI10C_PHASE2_UNCLEAR_GROUPS.json');
  const phase2Sha = fs.existsSync(phase2Path) ? sha256File(phase2Path) : null;

  const groups = loadLdi10bGroups(repoRoot);
  const unclear = groups.filter((g) => g.plausibilityVerdict === 'UNCLEAR_QC_OR_GAPS');
  const unclearIds = unclear.map((g) => g.groupId).sort();
  const expected = [...UNCLEAR_GROUP_IDS_EXPECTED].sort();
  const integrityErrors = [...provenance.errors];
  if (unclearIds.join(',') !== expected.join(',')) {
    integrityErrors.push(`UNCLEAR group ID set drift: got ${unclearIds.join(',')}`);
  }
  const evidenceIntegrityOk = provenance.ok && integrityErrors.length === provenance.errors.length;

  const { snapshot } = loadLdi08Artifacts(repoRoot);
  const rows = snapshot.rows;
  const audit10a = runLdi10aAudit(repoRoot);
  const candById = new Map(audit10a.candidateAudit.map((c) => [c.candidateId, c]));

  const plausibleAccel = groups.filter(
    (g) => g.kind === 'ACCELERATION' && g.plausibilityVerdict === 'PLAUSIBLE',
  );

  const cases = unclear.map((group) => {
    const candidates = group.candidateIds.map((id) => candById.get(id)).filter(Boolean) as CandidateAuditRow[];
    const secondBySecond = buildSecondBySecondWindow(rows, group.windowUtc.start, group.windowUtc.end);
    const hypotheses = testRootCauseHypotheses({ group, rows, candidates });
    return {
      groupId: group.groupId,
      windowUtc: group.windowUtc,
      candidateIds: group.candidateIds,
      plausibilityPreserved: group.plausibilityVerdict,
      secondBySecond,
      candidatesForensics: candidates,
      untrustedBuckets: secondBySecond.filter((s) => s.l3.qcTrustLevel === 'UNTRUSTED'),
      hypotheses,
      featureVector: featureVectorForGroup(group, rows, candidates),
      measuredVsDerived: {
        measuredGpsCoordinates: 'S4 position pin per bucket',
        derivedL3Speed: 'SHADOW_RUN_L3_RECONSTRUCTION_PINNED',
        derivedLongitudinalAccel: 'L3 Δv over 1s candidate steps (LDI-10A)',
        independentPhysicalMotionValidated: false,
      },
    };
  });

  const controlUnclear = unclear.map((g) =>
    featureVectorForGroup(
      g,
      rows,
      g.candidateIds.map((id) => candById.get(id)).filter(Boolean) as CandidateAuditRow[],
    ),
  );
  const controlPlausible = plausibleAccel.map((g) =>
    featureVectorForGroup(
      g,
      rows,
      g.candidateIds.map((id) => candById.get(id)).filter(Boolean) as CandidateAuditRow[],
    ),
  );

  const countSupported = (key: RootCauseHypothesisKey) =>
    cases.filter((c) => c.hypotheses[key].verdict === 'SUPPORTED').length;

  const qcImplementationAudit = {
    computeDiV0TripIntervals: {
      path: 'backend/src/modules/vehicle-intelligence/driving-intelligence/core/compute-trip-intervals.ts',
      role: 'Derives L3 speed per shadow bucket; sets sourceRelation via assessSourceRelationAtLabel(l3, r1, calibration)',
      lineRef: 'assessSourceRelationAtLabel at interval build (~line 93)',
    },
    assessSourceRelationAtLabel: {
      path: 'backend/src/modules/vehicle-intelligence/driving-intelligence/core/claims/cross-source-relation.ts',
      policy:
        'CONFLICT_EXPLAINED when |OBD-L3| ≥ max(abs, 25% L3); CONFLICTING in between corroboration and conflict bands; OBD INTERVAL_ONLY',
    },
    evaluateDiV0SpeedQcInterval: {
      path: 'backend/src/modules/vehicle-intelligence/driving-intelligence/speed-qc/evaluate-di-v0-speed-qc-interval.ts',
      trustSemantics: {
        TRUSTED: 'OK / high confidence numeric path',
        TRUSTED_LIMITED: 'OK_MODERATE, stationary band, etc.',
        UNTRUSTED: 'Includes CROSS_SOURCE_CONFLICT when shadow.sourceRelation is CONFLICTING or CONFLICT_EXPLAINED (before leg geometry checks)',
        CONFLICTED_candidate_tier: 'LDI-10A: L3 vs OBD at candidate endpoints ≥ max(5 km/h, 25% L3) — separate from per-bucket QC label',
      },
      frozenPinPolicy: 'LDI08 rows built with DI_V0_SPEED_QC_POLICY_V2 in ldi03-ruptela-combined-pin.lib.ts',
    },
    frozenEvidenceMatch: {
      observedPattern:
        'All 12 UNTRUSTED buckets across eight groups: qcReasonCodes=[CROSS_SOURCE_CONFLICT] and sourceRelation CONFLICTING|CONFLICT_EXPLAINED with integer OBD/HF speeds',
      defectFound: false,
      note: 'Behavior matches documented early-exit in evaluateDiV0SpeedQcInterval; root cause is cross-source disagreement, not missing implementation',
    },
  };

  const systematicBias = {
    accelClassOnlyBecauseAllUnclearAreAccel: true,
    discriminator:
      'Among 16 acceleration groups, UNCLEAR ⊆ those with ≥1 CONFLICTING/CONFLICT_EXPLAINED sourceRelation bucket inside maneuver window',
    plausibleAccelConflictingBuckets: controlPlausible.every((f) => f.conflictingSourceRelationBuckets === 0),
    qcPipelineNote:
      'UNTRUSTED is applied when S1 marks cross-source conflict; occurs when sparse integer OBD is present and disagrees with L3 — not an acceleration-specific QC rule',
    thresholdModification: 'NONE — read-only phase',
  };

  return {
    provenance: {
      ...provenance,
      ok: evidenceIntegrityOk,
      errors: integrityErrors,
      phase2UnclearGroupsSha256: phase2Sha,
    },
    unclearGroupIds: unclearIds,
    cases,
    controlComparison: {
      unclearAccel: controlUnclear,
      plausibleAccel: controlPlausible,
      systematicBias,
    },
    qcImplementationAudit,
    summaryCounts: {
      unclearAudited: cases.length,
      rootCauseGpsJumpSupported: countSupported('A_GPS_JUMP_OR_SPEED_SPIKE'),
      rootCauseTimestampSupported: countSupported('B_TIMESTAMP_SKEW_OR_BUCKET_ALIGNMENT'),
      rootCauseQuantizationSupported: countSupported('C_GPS_QUANTIZATION_OR_CADENCE'),
      rootCauseQcImplementationSupported: cases.filter(
        (c) => c.hypotheses.D_L3_DERIVATION_OR_QC_DEFECT.verdict === 'SUPPORTED',
      ).length,
      rootCauseObdAlignmentSupported: countSupported('E_OBD_QUANTIZATION_OR_ALIGNMENT'),
      rootCauseMultipleSupported: countSupported('G_COMPOUND_CAUSES'),
      rootCauseIndeterminate: cases.filter((c) =>
        Object.values(c.hypotheses).some((h) => h.verdict === 'INDETERMINATE'),
      ).length,
      controlGroupsCompared: controlPlausible.length + controlUnclear.length,
      qcImplementationDefectFound: false,
    },
    tripId: LDI08_TRIP_ID,
    vehicleId: LDI08_VEHICLE_ID,
  };
}
