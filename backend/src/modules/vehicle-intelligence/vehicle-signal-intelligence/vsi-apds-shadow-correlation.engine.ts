import {
  VSI_APDS_P5_CONTRACT_VERSION,
  VsiApdsDemandClassification,
  type VsiApdsReadonlyCapabilityObservationV1,
  type VsiApdsShadowCorrelationResultV1,
  type VsiApdsShadowDecisionSnapshotV1,
} from './vsi-apds-p5.types';

/**
 * Pure correlation — never mutates APDS decisions or polling state.
 */
export function correlateApdsShadowWithVsiCapability(input: {
  decision: VsiApdsShadowDecisionSnapshotV1;
  observation: VsiApdsReadonlyCapabilityObservationV1;
}): VsiApdsShadowCorrelationResultV1 {
  const { decision, observation } = input;
  const matchedVehicleLink =
    observation.attributionStatus === 'RESOLVED' &&
    observation.evidenceLimitations.every(
      (l) => l !== 'TENANT_SCOPE_MISMATCH' && l !== 'SOURCE_LINK_INACTIVE',
    );

  const matchingCapabilities: string[] = [];
  const missingCapabilities: string[] = [];
  const observedVersusDemandedDifferences: string[] = [];
  const investigationHints: string[] = [];
  const evidenceLimitations = [...observation.evidenceLimitations];

  for (const row of observation.consumerDemand) {
    if (row.demandClassification === VsiApdsDemandClassification.PENDING_DOMAIN_APPROVAL) {
      investigationHints.push(`FUTURE_DEMAND_PENDING:${row.requirementId}`);
      continue;
    }
    if (row.demandClassification === VsiApdsDemandClassification.DESIGN_CONTRACT_ONLY) {
      investigationHints.push(`DESIGN_CONTRACT_ONLY:${row.requirementId}`);
      continue;
    }
    if (row.assessmentStatus === 'SATISFIED') {
      matchingCapabilities.push(row.requirementId);
    } else if (row.assessmentStatus === 'INSUFFICIENT') {
      missingCapabilities.push(row.requirementId);
      observedVersusDemandedDifferences.push(
        `${row.requirementId}:${row.discrepancyReasons.join(',')}`,
      );
    } else if (row.assessmentStatus === 'NOT_ASSESSABLE') {
      evidenceLimitations.push(`NOT_ASSESSABLE:${row.requirementId}`);
    } else {
      evidenceLimitations.push(`UNKNOWN_ASSESSMENT:${row.requirementId}`);
    }
  }

  if (observation.profileContentFingerprint == null) {
    investigationHints.push('MISSING_VSI_PROFILE_FOR_SHADOW_DECISION_REVIEW');
  }

  if (missingCapabilities.length > 0) {
    investigationHints.push('CAPABILITY_GAP_MAY_WARRANT_FUTURE_APDS_REVIEW');
  }

  return {
    contractVersion: VSI_APDS_P5_CONTRACT_VERSION,
    matchedVehicleLink,
    opportunityId: decision.opportunityId,
    decisionAt: decision.decisionAt,
    originalApdsPolicyDecision: decision.baselineDecision,
    vsiProfileRevision: observation.profileRevision,
    vsiProfileContentFingerprint: observation.profileContentFingerprint,
    consumerDemandContractVersion: observation.requirementsContractVersion,
    matchingCapabilities,
    missingCapabilities,
    observedVersusDemandedDifferences,
    investigationHints,
    evidenceLimitations,
    correlationIsDecisionInput: false,
  };
}

/** Baseline parity: correlation disabled yields no side effects (identity on decision). */
export function apdsShadowBaselineParityIdentity<T>(baseline: T): T {
  return baseline;
}
