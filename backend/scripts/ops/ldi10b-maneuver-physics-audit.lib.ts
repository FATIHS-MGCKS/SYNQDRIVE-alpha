/**
 * LDI-10B — maneuver physics & integrity (offline LDI-08/09/10A).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  groupManeuvers,
  runLdi10aAudit,
  sha256File,
  type CandidateAuditRow,
  verifyArtifactProvenance,
} from './ldi10a-longitudinal-candidate-forensics.lib';
import {
  computeCoverageIntegrity,
  loadLdi08Artifacts,
  type Ldi08Row,
} from './ldi09-accel-decel-signal-forensics.lib';

export type ManeuverTaxonomy =
  | 'LONGITUDINAL_ACCELERATION'
  | 'LONGITUDINAL_DECELERATION'
  | 'MIXED_LONGITUDINAL_DYNAMICS'
  | 'UNCLEAR';

export type PlausibilityVerdict = 'PLAUSIBLE' | 'IMPLAUSIBLE_PEAK' | 'UNCLEAR_QC_OR_GAPS';

const DESCRIPTIVE_PEAK_MS2 = 6; // LDI-10A descriptive screen — not a production threshold

export function loadLdi10aCandidateAudit(repoRoot: string): {
  candidates: CandidateAuditRow[];
  provenance: Record<string, unknown>;
} {
  const p = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10/LDI10A_CANDIDATE_AUDIT.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as {
    candidates: CandidateAuditRow[];
    provenance: Record<string, unknown>;
  };
  return { candidates: raw.candidates, provenance: raw.provenance };
}

function bucketMs(label: string): number {
  return Date.parse(label);
}

function rowsInWindow(rows: Ldi08Row[], startUtc: string, endUtc: string): Ldi08Row[] {
  const a = bucketMs(startUtc);
  const b = bucketMs(endUtc);
  return rows.filter((r) => {
    const t = bucketMs(r.evaluationIndexUtc);
    return t >= a && t <= b;
  });
}

export type GroupPhysicsResult = {
  groupId: string;
  kind: string;
  taxonomy: ManeuverTaxonomy;
  notBrakePedalNotRegenNotIntent: true;
  windowUtc: { start: string; end: string };
  candidateIds: string[];
  stepCount: number;
  speedStartKmh: number | null;
  speedEndKmh: number | null;
  durationMs: number;
  cumulativeDeltaKmh: number;
  meanObservedLongitudinalAccelMs2: number | null;
  maxAbsObservedLongitudinalAccelMs2: number | null;
  qcInWindow: {
    bucketsInWindow: number;
    trusted: number;
    trustedLimited: number;
    untrusted: number;
    rowAbsentGps: number;
    trustedFraction: number;
  };
  stepConfidence: { highConfidence: number; conflicted: number; total: number };
  integrityFlags: {
    gpsJumpSteps: number;
    quantizedEndpoints: number;
    gapToNextGridSecondMs: number | null;
    oversplitRisk: boolean;
    undersplitNote: string | null;
  };
  plausibilityVerdict: PlausibilityVerdict;
  measurementUncertainty: string[];
};

export function analyzeGroupPhysics(
  group: { groupId: string; kind: string; candidateIds: string[]; startUtc: string; endUtc: string },
  candidatesById: Map<string, CandidateAuditRow>,
  rows: Ldi08Row[],
): GroupPhysicsResult {
  const steps = group.candidateIds.map((id) => candidatesById.get(id)).filter(Boolean) as CandidateAuditRow[];
  const windowRows = rowsInWindow(rows, group.startUtc, group.endUtc);

  const speedStart = steps[0]?.speedBeforeKmh ?? null;
  const speedEnd = steps[steps.length - 1]?.speedAfterKmh ?? null;
  const durationMs = bucketMs(group.endUtc) - bucketMs(group.startUtc);
  const cumulativeDeltaKmh = steps.reduce((s, c) => s + c.deltaVKmh, 0);
  const accels = steps.map((s) => s.accelMs2).filter((a): a is number => a != null);
  const meanAccel = accels.length ? accels.reduce((a, b) => a + b, 0) / accels.length : null;
  const maxAbsAccel = accels.length ? Math.max(...accels.map((a) => Math.abs(a))) : null;

  let trusted = 0;
  let trustedLimited = 0;
  let untrusted = 0;
  let rowAbsent = 0;
  for (const r of windowRows) {
    if (r.gps.availability !== 'PRESENT') rowAbsent += 1;
    else if (r.l3.qcTrustLevel === 'TRUSTED') trusted += 1;
    else if (r.l3.qcTrustLevel === 'TRUSTED_LIMITED') trustedLimited += 1;
    else if (r.l3.qcTrustLevel === 'UNTRUSTED') untrusted += 1;
  }

  const highConfSteps = steps.filter((s) => s.confidenceTier === 'HIGH_CONFIDENCE').length;
  const conflictedSteps = steps.filter((s) => s.confidenceTier === 'CONFLICTED').length;
  const gpsJumps = steps.filter((s) => s.gpsJumpSuspected).length;

  let taxonomy: ManeuverTaxonomy = 'UNCLEAR';
  if (conflictedSteps > steps.length / 2 || rowAbsent > windowRows.length / 2) taxonomy = 'UNCLEAR';
  else if (group.kind === 'ACCELERATION') taxonomy = 'LONGITUDINAL_ACCELERATION';
  else if (group.kind === 'DECELERATION') taxonomy = 'LONGITUDINAL_DECELERATION';
  else taxonomy = 'MIXED_LONGITUDINAL_DYNAMICS';

  let plausibility: PlausibilityVerdict = 'PLAUSIBLE';
  if (maxAbsAccel != null && maxAbsAccel > DESCRIPTIVE_PEAK_MS2) plausibility = 'IMPLAUSIBLE_PEAK';
  else if (conflictedSteps > 0 || rowAbsent > 0) plausibility = 'UNCLEAR_QC_OR_GAPS';

  const gapAfterMs =
    group.endUtc < rows[rows.length - 1]?.evaluationIndexUtc
      ? (() => {
          const endIdx = rows.findIndex((r) => r.evaluationIndexUtc === group.endUtc);
          const next = endIdx >= 0 ? rows[endIdx + 1] : undefined;
          return next ? bucketMs(next.evaluationIndexUtc) - bucketMs(group.endUtc) : null;
        })()
      : null;

  return {
    groupId: group.groupId,
    kind: group.kind,
    taxonomy,
    notBrakePedalNotRegenNotIntent: true,
    windowUtc: { start: group.startUtc, end: group.endUtc },
    candidateIds: group.candidateIds,
    stepCount: steps.length,
    speedStartKmh: speedStart,
    speedEndKmh: speedEnd,
    durationMs,
    cumulativeDeltaKmh,
    meanObservedLongitudinalAccelMs2: meanAccel,
    maxAbsObservedLongitudinalAccelMs2: maxAbsAccel,
    qcInWindow: {
      bucketsInWindow: windowRows.length,
      trusted,
      trustedLimited,
      untrusted,
      rowAbsentGps: rowAbsent,
      trustedFraction: windowRows.length ? trusted / windowRows.length : 0,
    },
    stepConfidence: { highConfidence: highConfSteps, conflicted: conflictedSteps, total: steps.length },
    integrityFlags: {
      gpsJumpSteps: gpsJumps,
      quantizedEndpoints: steps.filter((s) => s.quantizedObdOrHf).length,
      gapToNextGridSecondMs: gapAfterMs,
      oversplitRisk: steps.length === 1 && Math.abs(steps[0].deltaVKmh) < 4,
      undersplitNote: steps.length >= 4 ? 'multi_step_chain_same_sign' : null,
    },
    plausibilityVerdict: plausibility,
    measurementUncertainty: [
      '1s_calendar_bucket_L3_only_no_interpolation',
      'OBD_HF_sparse_witness_not_point_synchronous',
      'shared_DIMO_Ruptela_lineage',
    ],
  };
}

export function runLdi10bAudit(repoRoot: string) {
  const provenance10a = verifyArtifactProvenance(repoRoot);
  const ldi10aPath = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10/LDI10A_CANDIDATE_AUDIT.json');
  const ldi10aSha = fs.existsSync(ldi10aPath) ? sha256File(ldi10aPath) : null;

  const audit10a = runLdi10aAudit(repoRoot);
  const { snapshot, candidates: frozenCandidates } = loadLdi08Artifacts(repoRoot);
  const rows = snapshot.rows;
  const coverage = computeCoverageIntegrity(rows);

  const maneuver = groupManeuvers(frozenCandidates);
  const candidatesById = new Map(audit10a.candidateAudit.map((c) => [c.candidateId, c]));

  const groups = maneuver.groups.map((g) => analyzeGroupPhysics(g, candidatesById, rows));

  const sizeDist: Record<string, number> = {};
  for (const g of groups) {
    const k = String(g.stepCount);
    sizeDist[k] = (sizeDist[k] ?? 0) + 1;
  }

  const plausible = groups.filter((g) => g.plausibilityVerdict === 'PLAUSIBLE').length;
  const implausible = groups.filter((g) => g.plausibilityVerdict === 'IMPLAUSIBLE_PEAK').length;
  const unclear = groups.filter((g) => g.plausibilityVerdict === 'UNCLEAR_QC_OR_GAPS').length;

  const highConf = audit10a.candidateAudit.filter((c) => c.confidenceTier === 'HIGH_CONFIDENCE');
  const conflicted = audit10a.candidateAudit.filter((c) => c.confidenceTier === 'CONFLICTED');

  const obdWitnessCandidates = audit10a.candidateAudit.filter((c) => c.obdCorroboratedBothEnds);
  const hfWitnessCandidates = audit10a.candidateAudit.filter((c) => c.hfCorroboratedBothEnds);

  const untrustedBucketCount = coverage.untrusted.buckets;
  const rowAbsentBucketCount = coverage.rowAbsent.buckets;

  const groupsTouchingUntrusted = groups.filter((g) => {
    const w = rowsInWindow(rows, g.windowUtc.start as string, g.windowUtc.end as string);
    return w.some((r) => r.l3.qcTrustLevel === 'UNTRUSTED');
  }).length;

  const groupsTouchingAbsent = groups.filter((g) => {
    const w = rowsInWindow(rows, g.windowUtc.start as string, g.windowUtc.end as string);
    return w.some((r) => r.gps.availability !== 'PRESENT');
  }).length;

  const sensitivityNotActivated = {
    note: 'Parameters documented only — not applied to grouping or QC',
    hypotheticalMergePauseMs: 2000,
    hypotheticalMinStepsPerManeuver: 2,
    effectIfActivated: 'would_merge_some_single_step_groups_with_gap_lt_2s — not computed',
  };

  return {
    reproduction: {
      candidateCount: maneuver.independentCandidateCount,
      groupCount: maneuver.groupedManeuverCount,
      matchesLdi10aGrouping: maneuver.groupedManeuverCount === 32,
      hashes: {
        ldi08CombinedSnapshotSha256: provenance10a.ldi08CombinedSnapshotSha256,
        ldi08CandidatesSha256: provenance10a.ldi08AccelDecelCandidatesSha256,
        ldi10aCandidateAuditSha256: ldi10aSha,
      },
      pinnedSnapshotHash: provenance10a.pinnedSnapshotHash,
    },
    coverage: {
      denominatorShadowGridSeconds: coverage.shadowGridDenominator,
      strictTrustedPct: (coverage.trustedOnly.fraction * 100).toFixed(2),
      trustedOrLimitedPct: (coverage.trustedOrLimited.fraction * 100).toFixed(2),
      untrustedBuckets: coverage.untrusted.buckets,
      rowAbsentGpsBuckets: coverage.rowAbsent.buckets,
      fusionAssessableSeconds: coverage.fusionAssessable.buckets,
    },
    groups,
    groupSizeDistribution: sizeDist,
    plausibilitySummary: { plausible, implausible, unclear },
    highConfidenceCandidateReview: {
      count: highConf.length,
      unrealisticPeak: highConf.filter((c) => c.unrealisticAccelSpike).length,
      gpsJump: highConf.filter((c) => c.gpsJumpSuspected).length,
      quantized: highConf.filter((c) => c.quantizedObdOrHf).length,
      notIndependentGroundTruth: true,
    },
    conflictedCandidates: conflicted.map((c) => ({
      candidateId: c.candidateId,
      kind: c.kind,
      window: { start: c.startUtc, end: c.endUtc },
      qc: [c.qcClassStart, c.qcClassEnd],
      conflictAtStart: c.conflictAtStart,
      conflictAtEnd: c.conflictAtEnd,
      rationale: c.confidenceRationale,
    })),
    crossSource: {
      sharedLineage: 'DIMO_TELEMETRY_EVENTS_and_S4_R1_pin_same_vehicle_session',
      obdWitnessCandidates: obdWitnessCandidates.map((c) => ({
        candidateId: c.candidateId,
        startUtc: c.startUtc,
        endUtc: c.endUtc,
        temporalOffsetObdStartMs: c.temporalOffsetObdStartMs,
        temporalOffsetObdEndMs: c.temporalOffsetObdEndMs,
        notIndependentWitness: true,
        doubleCountingRisk: 'OBD_and_HF_from_same_R1_payload_when_both_true',
      })),
      hfWitnessCandidates: hfWitnessCandidates.map((c) => ({
        candidateId: c.candidateId,
        hfCorroboratedBothEnds: true,
        obdAlso: c.obdCorroboratedBothEnds,
      })),
      distinctWitnessStepCount: new Set([
        ...obdWitnessCandidates.map((c) => c.candidateId),
        ...hfWitnessCandidates.map((c) => c.candidateId),
      ]).size,
    },
    boundaryImpact: {
      untrustedBucketCount,
      rowAbsentBucketCount,
      untrustedDefinition: 'gps.availability=PRESENT AND l3.qcTrustLevel=UNTRUSTED (same as LDI-09 coverage)',
      groupsWithAnyUntrustedBucketInWindow: groupsTouchingUntrusted,
      groupsWithAnyRowAbsentInWindow: groupsTouchingAbsent,
      interpretabilityNote:
        'Maneuver windows overlapping UNTRUSTED or ROW_ABSENT buckets reduce promotion-grade interpretability without invalidating kinematic delta arithmetic on L3 numeric steps',
    },
    sensitivityAnalysis: sensitivityNotActivated,
  };
}
