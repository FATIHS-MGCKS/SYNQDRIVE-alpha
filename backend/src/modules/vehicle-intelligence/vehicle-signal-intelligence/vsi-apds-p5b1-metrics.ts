import { VsiApdsProfileEvidenceInterpretation } from './vsi-apds-profile-evidence-time';
import { VsiApdsDemandClassification } from './vsi-apds-p5.types';
import type {
  VsiApdsP5b1OfflineCorrelationRowV1,
  VsiApdsP5b1OfflineProductMetricsV1,
  VsiApdsP5b1OfflineReplayCoverageV1,
  VsiApdsP5b1RateV1,
  VsiApdsP5b1ScientificProductMetricsV1,
} from './vsi-apds-p5b1.types';

function rate(numerator: number, denominator: number): VsiApdsP5b1RateV1 {
  return { numerator, denominator };
}

function bumpRate(
  map: Record<string, VsiApdsP5b1RateV1>,
  key: string,
  hit: boolean,
): void {
  const current = map[key] ?? { numerator: 0, denominator: 0 };
  current.denominator += 1;
  if (hit) {
    current.numerator += 1;
  }
  map[key] = current;
}

export function buildP5b1OfflineCoverage(
  rows: readonly VsiApdsP5b1OfflineCorrelationRowV1[],
): VsiApdsP5b1OfflineReplayCoverageV1 {
  let correlated = 0;
  let skippedNoAttributableLink = 0;
  let skippedErrors = 0;
  let verifiedHistoricalProfile = 0;
  let verifiedCorrelation = 0;
  let unknownProvenance = 0;

  for (const row of rows) {
    if (row.processingStatus === 'SKIPPED_NO_ATTRIBUTABLE_LINK') {
      skippedNoAttributableLink += 1;
      unknownProvenance += 1;
      continue;
    }
    if (row.processingStatus === 'CORRELATION_ERROR') {
      skippedErrors += 1;
      unknownProvenance += 1;
      continue;
    }
    correlated += 1;
    const interpretation = row.observation?.profileEvidenceInterpretation;
    if (
      interpretation === VsiApdsProfileEvidenceInterpretation.VERIFIED_DECISION_TIME_SNAPSHOT
    ) {
      verifiedHistoricalProfile += 1;
    } else {
      unknownProvenance += 1;
    }
    if (row.processingStatus === 'VERIFIED_CORRELATION') {
      verifiedCorrelation += 1;
    }
  }

  return {
    decisionsLoaded: rows.length,
    correlated,
    skippedNoAttributableLink,
    skippedErrors,
    verifiedHistoricalProfile,
    verifiedCorrelation,
    unknownProvenance,
  };
}

export function buildP5b1ScientificProductMetrics(
  rows: readonly VsiApdsP5b1OfflineCorrelationRowV1[],
): VsiApdsP5b1ScientificProductMetricsV1 {
  const policyVersionCounts: Record<string, number> = {};
  const apdsReasonCodeCounts: Record<string, number> = {};
  const declaredSignalCoverage: Record<string, VsiApdsP5b1RateV1> = {};
  const empiricalSignalCoverage: Record<string, VsiApdsP5b1RateV1> = {};
  const verifiedHistoricalSignalEvidence: Record<string, VsiApdsP5b1RateV1> = {};
  const currentProfileOnlySignalObservations: Record<string, VsiApdsP5b1RateV1> = {};
  const genuineInsufficientCapability: Record<string, VsiApdsP5b1RateV1> = {};

  let unattributable = 0;
  let verifiedHistoricalDecisions = 0;
  let currentProfileOnlyDecisions = 0;
  let approvedDemandHits = 0;
  let approvedDemandTotal = 0;
  let pendingDemandHits = 0;
  let pendingDemandTotal = 0;
  let designOnlyHits = 0;
  let designOnlyTotal = 0;
  let insufficientHits = 0;
  let insufficientTotal = 0;
  let notAssessableHits = 0;
  let notAssessableTotal = 0;

  for (const row of rows) {
    const policy = row.decisionIdentity.policyVersion;
    policyVersionCounts[policy] = (policyVersionCounts[policy] ?? 0) + 1;
    apdsReasonCodeCounts[row.originalApdsReason] =
      (apdsReasonCodeCounts[row.originalApdsReason] ?? 0) + 1;

    if (row.processingStatus === 'SKIPPED_NO_ATTRIBUTABLE_LINK') {
      unattributable += 1;
      continue;
    }

    const interpretation = row.observation?.profileEvidenceInterpretation;
    const verifiedHistorical =
      interpretation === VsiApdsProfileEvidenceInterpretation.VERIFIED_DECISION_TIME_SNAPSHOT;
    const currentProfileOnly =
      interpretation === VsiApdsProfileEvidenceInterpretation.CURRENT_PROFILE_REVIEW;

    if (verifiedHistorical) {
      verifiedHistoricalDecisions += 1;
    } else if (currentProfileOnly) {
      currentProfileOnlyDecisions += 1;
    }

    for (const signal of row.observation?.signals ?? []) {
      const key = signal.canonicalSignalKey;
      bumpRate(declaredSignalCoverage, key, signal.declaredSupport === 'LISTED');
      bumpRate(empiricalSignalCoverage, key, signal.empiricalObservation === 'OBSERVED');
      if (verifiedHistorical) {
        bumpRate(
          verifiedHistoricalSignalEvidence,
          key,
          signal.empiricalObservation === 'OBSERVED',
        );
      }
      if (currentProfileOnly) {
        bumpRate(
          currentProfileOnlySignalObservations,
          key,
          signal.empiricalObservation === 'OBSERVED',
        );
      }
    }

    for (const demand of row.observation?.consumerDemand ?? []) {
      if (demand.demandClassification === VsiApdsDemandClassification.PENDING_DOMAIN_APPROVAL) {
        pendingDemandTotal += 1;
        pendingDemandHits += 1;
        continue;
      }
      if (demand.demandClassification === VsiApdsDemandClassification.DESIGN_CONTRACT_ONLY) {
        designOnlyTotal += 1;
        designOnlyHits += 1;
        continue;
      }
      if (
        demand.demandClassification === VsiApdsDemandClassification.DOMAIN_APPROVED_REQUIREMENT ||
        demand.demandClassification === VsiApdsDemandClassification.DECLARED_REQUIREMENT
      ) {
        approvedDemandTotal += 1;
        if (demand.assessmentStatus === 'SATISFIED') {
          approvedDemandHits += 1;
        }
        if (demand.assessmentStatus === 'INSUFFICIENT') {
          insufficientTotal += 1;
          insufficientHits += 1;
          bumpRate(genuineInsufficientCapability, demand.consumerModule, true);
        }
        if (demand.assessmentStatus === 'NOT_ASSESSABLE') {
          notAssessableTotal += 1;
          notAssessableHits += 1;
        }
      }
    }
  }

  const decisionsTotal = rows.length;
  return {
    decisionsTotal,
    unattributableApdsDecisions: rate(unattributable, decisionsTotal),
    verifiedHistoricalProfileDecisions: rate(verifiedHistoricalDecisions, decisionsTotal),
    currentProfileOnlyDecisions: rate(currentProfileOnlyDecisions, decisionsTotal),
    declaredSignalCoverage,
    empiricalSignalCoverage,
    verifiedHistoricalSignalEvidence,
    currentProfileOnlySignalObservations,
    approvedConsumerDemand: rate(approvedDemandHits, approvedDemandTotal),
    pendingConsumerDemand: rate(pendingDemandHits, pendingDemandTotal),
    designOnlyContracts: rate(designOnlyHits, designOnlyTotal),
    genuineInsufficientCapability,
    notAssessableDueToApprovalOrEvidence: rate(notAssessableHits, notAssessableTotal),
    policyVersionCounts,
    apdsReasonCodeCounts,
  };
}

/** @deprecated Use scientific metrics; kept for backward-compatible summaries. */
export function buildP5b1ProductMetrics(
  rows: readonly VsiApdsP5b1OfflineCorrelationRowV1[],
): VsiApdsP5b1OfflineProductMetricsV1 {
  const scientific = buildP5b1ScientificProductMetrics(rows);
  const signalCoverageByCanonicalKey: Record<string, number> = {};
  for (const [key, r] of Object.entries(scientific.empiricalSignalCoverage)) {
    signalCoverageByCanonicalKey[key] = r.numerator;
  }
  const capabilityGapsByDomain: Record<string, number> = {};
  for (const [key, r] of Object.entries(scientific.genuineInsufficientCapability)) {
    capabilityGapsByDomain[key] = r.numerator;
  }
  return {
    decisionsAvailable: scientific.decisionsTotal,
    attributedDecisions:
      scientific.decisionsTotal - scientific.unattributableApdsDecisions.numerator,
    verifiedHistoricalProfileEvidence: scientific.verifiedHistoricalProfileDecisions.numerator,
    unknownOrMissingProvenance:
      scientific.decisionsTotal - scientific.verifiedHistoricalProfileDecisions.numerator,
    signalCoverageByCanonicalKey,
    pendingConsumerRequirements: scientific.pendingConsumerDemand.numerator,
    approvedConsumerRequirements: scientific.approvedConsumerDemand.numerator,
    capabilityGapsByDomain,
    policyVersionCounts: scientific.policyVersionCounts,
    apdsReasonCodeCounts: scientific.apdsReasonCodeCounts,
    profileFingerprintCoverage: rows.filter((r) => r.observation?.profileContentFingerprint).length,
  };
}
