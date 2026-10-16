import { VsiApdsProfileEvidenceInterpretation } from './vsi-apds-profile-evidence-time';
import { VsiApdsDemandClassification } from './vsi-apds-p5.types';
import type {
  VsiApdsP5b1OfflineCorrelationRowV1,
  VsiApdsP5b1OfflineProductMetricsV1,
  VsiApdsP5b1OfflineReplayCoverageV1,
} from './vsi-apds-p5b1.types';

export function buildP5b1OfflineCoverage(
  rows: readonly VsiApdsP5b1OfflineCorrelationRowV1[],
): VsiApdsP5b1OfflineReplayCoverageV1 {
  let correlated = 0;
  let skippedNoAttributableLink = 0;
  let skippedErrors = 0;
  let verifiedHistoricalProfile = 0;
  let unknownProvenance = 0;

  for (const row of rows) {
    if (row.skippedReason) {
      if (row.skippedReason.includes('NO_ATTRIBUTABLE')) {
        skippedNoAttributableLink += 1;
      } else {
        skippedErrors += 1;
      }
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
  }

  return {
    decisionsLoaded: rows.length,
    correlated,
    skippedNoAttributableLink,
    skippedErrors,
    verifiedHistoricalProfile,
    unknownProvenance,
  };
}

export function buildP5b1ProductMetrics(
  rows: readonly VsiApdsP5b1OfflineCorrelationRowV1[],
): VsiApdsP5b1OfflineProductMetricsV1 {
  const signalCoverageByCanonicalKey: Record<string, number> = {};
  const capabilityGapsByDomain: Record<string, number> = {};
  const policyVersionCounts: Record<string, number> = {};
  const apdsReasonCodeCounts: Record<string, number> = {};
  let attributedDecisions = 0;
  let verifiedHistoricalProfileEvidence = 0;
  let unknownOrMissingProvenance = 0;
  let pendingConsumerRequirements = 0;
  let approvedConsumerRequirements = 0;
  let profileFingerprintCoverage = 0;

  for (const row of rows) {
    const policy = row.decisionIdentity.policyVersion;
    policyVersionCounts[policy] = (policyVersionCounts[policy] ?? 0) + 1;
    apdsReasonCodeCounts[row.originalApdsReason] =
      (apdsReasonCodeCounts[row.originalApdsReason] ?? 0) + 1;

    if (row.sourceLinkAttribution.status === 'UNIQUE_ATTRIBUTED') {
      attributedDecisions += 1;
    } else {
      unknownOrMissingProvenance += 1;
    }

    const interpretation = row.observation?.profileEvidenceInterpretation;
    if (
      interpretation === VsiApdsProfileEvidenceInterpretation.VERIFIED_DECISION_TIME_SNAPSHOT
    ) {
      verifiedHistoricalProfileEvidence += 1;
    } else if (row.observation) {
      unknownOrMissingProvenance += 1;
    }

    if (row.observation?.profileContentFingerprint) {
      profileFingerprintCoverage += 1;
    }

    for (const signal of row.observation?.signals ?? []) {
      if (signal.empiricalObservation === 'OBSERVED') {
        signalCoverageByCanonicalKey[signal.canonicalSignalKey] =
          (signalCoverageByCanonicalKey[signal.canonicalSignalKey] ?? 0) + 1;
      }
    }

    for (const demand of row.observation?.consumerDemand ?? []) {
      if (demand.demandClassification === VsiApdsDemandClassification.PENDING_DOMAIN_APPROVAL) {
        pendingConsumerRequirements += 1;
      }
      if (
        demand.demandClassification === VsiApdsDemandClassification.DOMAIN_APPROVED_REQUIREMENT ||
        demand.demandClassification === VsiApdsDemandClassification.DECLARED_REQUIREMENT
      ) {
        approvedConsumerRequirements += 1;
      }
      if (demand.assessmentStatus === 'INSUFFICIENT' || demand.assessmentStatus === 'NOT_ASSESSABLE') {
        capabilityGapsByDomain[demand.consumerModule] =
          (capabilityGapsByDomain[demand.consumerModule] ?? 0) + 1;
      }
    }
  }

  return {
    decisionsAvailable: rows.length,
    attributedDecisions,
    verifiedHistoricalProfileEvidence,
    unknownOrMissingProvenance,
    signalCoverageByCanonicalKey,
    pendingConsumerRequirements,
    approvedConsumerRequirements,
    capabilityGapsByDomain,
    policyVersionCounts,
    apdsReasonCodeCounts,
    profileFingerprintCoverage,
  };
}
