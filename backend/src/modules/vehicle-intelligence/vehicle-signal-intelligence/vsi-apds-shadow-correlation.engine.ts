import { validateVsiApdsCorrelationDecisionObservationPair } from './vsi-apds-correlation-consistency';
import {
  VSI_APDS_P5_CONTRACT_VERSION,
  VsiApdsDemandClassification,
  type VsiApdsReadonlyCapabilityObservationV1,
  type VsiApdsShadowCorrelationResultV1,
  type VsiApdsShadowDecisionSnapshotV1,
} from './vsi-apds-p5.types';
import { VsiApdsProfileEvidenceInterpretation } from './vsi-apds-profile-evidence-time';
import { describeVsiApdsShadowRuntimeDiff } from './vsi-apds-parity-evidence';
import {
  VsiApdsCorrelationAnalysisMode,
  VsiApdsShadowBindingStatus,
} from './vsi-apds-shadow-opportunity-binding';

/**
 * Pure correlation — never mutates APDS decisions or polling state.
 */
export function correlateApdsShadowWithVsiCapability(input: {
  decision: VsiApdsShadowDecisionSnapshotV1;
  observation: VsiApdsReadonlyCapabilityObservationV1;
}): VsiApdsShadowCorrelationResultV1 {
  const { decision, observation } = input;
  const pair = validateVsiApdsCorrelationDecisionObservationPair({
    decision,
    observation,
    authoritativePersistedDecision: observation.authoritativePersistedDecision,
  });

  const evidenceLimitations = [...observation.evidenceLimitations];
  if (!pair.consistent) {
    evidenceLimitations.push(...pair.reasons.map((r) => `CORRELATION_PAIR:${r}`));
  }

  const verifiedBinding =
    observation.correlationAnalysisMode ===
      VsiApdsCorrelationAnalysisMode.VERIFIED_SHADOW_CORRELATION &&
    observation.shadowBindingStatus === VsiApdsShadowBindingStatus.MATCHED &&
    pair.consistent;

  const matchedVehicleLink =
    verifiedBinding &&
    observation.attributionStatus === 'RESOLVED' &&
    observation.evidenceLimitations.every(
      (l) =>
        l !== 'TENANT_SCOPE_MISMATCH' &&
        l !== 'SOURCE_LINK_INACTIVE' &&
        l !== 'SOURCE_LINK_SUPERSEDED',
    );

  const matchingCapabilities: string[] = [];
  const missingCapabilities: string[] = [];
  const observedVersusDemandedDifferences: string[] = [];
  const investigationHints: string[] = [];

  if (
    observation.profileEvidenceInterpretation !==
    VsiApdsProfileEvidenceInterpretation.VERIFIED_DECISION_TIME_SNAPSHOT
  ) {
    investigationHints.push(
      `PROFILE_EVIDENCE_INTERPRETATION:${observation.profileEvidenceInterpretation}`,
    );
  }

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
      if (matchedVehicleLink && verifiedBinding) {
        matchingCapabilities.push(row.requirementId);
      } else {
        investigationHints.push(`NOT_VERIFIED_CORRELATION_SATISFIED:${row.requirementId}`);
      }
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

  const authoritativeDecision =
    observation.authoritativePersistedDecision?.decision ?? decision.baselineDecision;

  return {
    contractVersion: VSI_APDS_P5_CONTRACT_VERSION,
    matchedVehicleLink,
    shadowBindingStatus: pair.consistent
      ? observation.shadowBindingStatus
      : VsiApdsShadowBindingStatus.REJECTED,
    profileEvidenceInterpretation: observation.profileEvidenceInterpretation,
    opportunityId: decision.opportunityId,
    decisionAt: decision.decisionAt,
    originalApdsPolicyDecision: authoritativeDecision,
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

/**
 * Compile-time no-op when P5B is disabled — does **not** certify APDS durable replay parity.
 */
export function apdsShadowBaselineParityIdentity<T>(baseline: T): T {
  return baseline;
}

export { describeVsiApdsShadowRuntimeDiff };
