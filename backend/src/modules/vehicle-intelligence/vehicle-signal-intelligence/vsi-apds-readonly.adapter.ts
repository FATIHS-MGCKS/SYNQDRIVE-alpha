import { buildVsiConsumerDemandVectorV1 } from './vsi-apds-demand-vector.builder';
import {
  classifyVsiApdsProfileEvidenceInterpretation,
  type VsiApdsProfileTemporalAuthorityV1,
} from './vsi-apds-profile-evidence-time';
import {
  validateVsiApdsShadowOpportunityBinding,
  VsiApdsCorrelationAnalysisMode,
  VsiApdsShadowBindingStatus,
  type VsiApdsPersistedShadowDecisionV1,
} from './vsi-apds-shadow-opportunity-binding';
import {
  VSI_APDS_P5_CONTRACT_VERSION,
  type VsiApdsCanonicalSignalRowV1,
  type VsiApdsReadonlyAdapterInputV1,
  type VsiApdsReadonlyCapabilityObservationV1,
} from './vsi-apds-p5.types';
import { computeSignalFreshnessAtEvaluation } from './vsi-capability-resolver.freshness';
import type { VsiCapabilityResolverProfileContext } from './vsi-capability-resolver.types';
import { VSI_PROFILE_CONTRACT_VERSION_V1 } from './vsi-profile.types';

const ATTRIBUTION_UNKNOWN = new Set([
  'LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK',
  'MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS',
  'PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY',
]);

function mapSignals(
  profile: VsiCapabilityResolverProfileContext,
  evaluationTimeMs: number,
): VsiApdsCanonicalSignalRowV1[] {
  return profile.signals.map((s) => ({
    canonicalSignalKey: s.canonicalSignalKey,
    declaredSupport: s.declaredSupport,
    empiricalObservation: s.empiricalObservation,
    lastValidObservationAt: s.lastValidObservationAt,
    lastSourceTimestamp: s.lastSourceTimestamp,
    freshnessAtEvaluation: computeSignalFreshnessAtEvaluation({
      lastSourceTimestamp: s.lastSourceTimestamp,
      evaluationTimeMs,
    }),
    qualityClassification: s.qualityClassification ?? null,
    confidenceLevel: s.confidenceLevel ?? null,
    limitations: [...s.limitations],
  }));
}

/**
 * Pure read-only projection from persisted VSI profile + P4 requirements registry.
 * Never infers empirical evidence from poll success.
 */
export function buildVsiApdsReadonlyCapabilityObservation(input: {
  adapter: VsiApdsReadonlyAdapterInputV1;
  profile: VsiCapabilityResolverProfileContext | null;
  profileTemporal: VsiApdsProfileTemporalAuthorityV1 | null;
  trustedProviderIdentity: string | null;
  trustedVerifiedModality: string | null;
  trustedTelemetrySourceFamily: string | null;
  linkActive: boolean;
  linkSuperseded: boolean;
  tenantMatch: boolean;
  currentActiveSourceLinkCount: number;
  historicalActiveLinkCountAtDecision: number | null;
  historicalLinkUniquenessEvidenceComplete: boolean;
  persistedShadowDecision: VsiApdsPersistedShadowDecisionV1 | null;
  historicalLinkActiveAtDecision: boolean;
  correlationAnalysisMode?: VsiApdsCorrelationAnalysisMode;
}): VsiApdsReadonlyCapabilityObservationV1 {
  const correlationAnalysisMode =
    input.correlationAnalysisMode ?? VsiApdsCorrelationAnalysisMode.VERIFIED_SHADOW_CORRELATION;
  const evaluationTimeMs = input.adapter.shadowDecisionAt.getTime();
  const limitations: string[] = [
    'NOT_AN_APDS_DECISION_INPUT',
    'POLL_SUCCESS_DOES_NOT_IMPLY_SIGNAL_EVIDENCE',
  ];

  const failClosed =
    !input.tenantMatch || !input.linkActive || input.linkSuperseded;

  if (!input.tenantMatch) {
    limitations.push('TENANT_SCOPE_MISMATCH');
  }
  if (!input.linkActive) {
    limitations.push('SOURCE_LINK_INACTIVE');
  }
  if (input.linkSuperseded) {
    limitations.push('SOURCE_LINK_SUPERSEDED');
  }

  const binding = validateVsiApdsShadowOpportunityBinding({
    persistedDecision: input.persistedShadowDecision,
    request: {
      organizationId: input.adapter.organizationId,
      vehicleId: input.adapter.vehicleId,
      providerSourceLinkId: input.adapter.providerSourceLinkId,
      opportunityId: input.adapter.shadowOpportunityId,
      decisionAt: input.adapter.shadowDecisionAt,
      policyVersion: input.adapter.policyVersion,
      activationEpochId: input.adapter.activationEpochId ?? null,
      baselineDecision: input.persistedShadowDecision?.decision ?? null,
    },
    currentActiveSourceLinkCount: input.currentActiveSourceLinkCount,
    historicalActiveLinkCountAtDecision: input.historicalActiveLinkCountAtDecision,
    historicalLinkUniquenessEvidenceComplete: input.historicalLinkUniquenessEvidenceComplete,
    correlationMode: correlationAnalysisMode,
    historicalLinkActiveAtDecision: input.historicalLinkActiveAtDecision,
  });
  limitations.push(...binding.reasons.map((r) => `SHADOW_BINDING:${r}`));

  const evidenceTime = classifyVsiApdsProfileEvidenceInterpretation({
    profile: input.profile,
    temporal: input.profileTemporal,
    shadowDecisionAt: input.adapter.shadowDecisionAt,
  });
  limitations.push(...evidenceTime.limitations);

  if (
    correlationAnalysisMode === VsiApdsCorrelationAnalysisMode.VERIFIED_SHADOW_CORRELATION &&
    binding.bindingStatus === VsiApdsShadowBindingStatus.MISSING_PERSISTED_DECISION
  ) {
    limitations.push('VERIFIED_CORRELATION_REQUIRES_PERSISTED_APDS_DECISION');
  }

  let attributionStatus: 'RESOLVED' | 'UNKNOWN' = 'RESOLVED';
  const profile = failClosed ? null : input.profile;

  if (profile) {
    limitations.push(...profile.profileLimitations);
    if (
      profile.profileLimitations.some((l) => ATTRIBUTION_UNKNOWN.has(l)) ||
      profile.signals.some((s) => s.limitations.some((l) => ATTRIBUTION_UNKNOWN.has(l)))
    ) {
      attributionStatus = 'UNKNOWN';
      limitations.push('SOURCE_LINK_ATTRIBUTION_UNKNOWN');
    }
    if (profile.profileContractVersion === VSI_PROFILE_CONTRACT_VERSION_V1) {
      limitations.push('LEGACY_PROFILE_V1');
    }
  } else if (!failClosed) {
    limitations.push('PROFILE_NOT_FOUND');
    attributionStatus = 'UNKNOWN';
  }

  if (!input.historicalLinkActiveAtDecision) {
    attributionStatus = 'UNKNOWN';
    limitations.push('HISTORICAL_SOURCE_LINK_ATTRIBUTION_UNPROVEN');
  }

  if (
    failClosed ||
    binding.bindingStatus !== VsiApdsShadowBindingStatus.MATCHED ||
    attributionStatus === 'UNKNOWN'
  ) {
    attributionStatus = 'UNKNOWN';
  }

  const attributionUnknown = attributionStatus === 'UNKNOWN';

  const signals =
    profile && !failClosed ? mapSignals(profile, evaluationTimeMs) : [];

  const consumerDemand = buildVsiConsumerDemandVectorV1({
    profile,
    evaluationTimeMs,
    profileLimitations: profile?.profileLimitations,
    attributionUnknown,
    failClosed,
    decisionTimeRetrospectiveAssessable: evidenceTime.decisionTimeRetrospectiveAssessable,
  });

  return {
    contractVersion: VSI_APDS_P5_CONTRACT_VERSION,
    organizationId: input.adapter.organizationId,
    vehicleId: input.adapter.vehicleId,
    providerSourceLinkId: input.adapter.providerSourceLinkId,
    shadowOpportunityId: input.adapter.shadowOpportunityId,
    shadowDecisionAt: input.adapter.shadowDecisionAt.toISOString(),
    policyVersion: input.adapter.policyVersion,
    activationEpochId: input.adapter.activationEpochId ?? null,
    requirementsContractVersion: input.adapter.requirementsContractVersion,
    correlationAnalysisMode,
    authoritativePersistedDecision: input.persistedShadowDecision,
    historicalLinkActiveAtDecision: input.historicalLinkActiveAtDecision,
    currentActiveSourceLinkCount: input.currentActiveSourceLinkCount,
    historicalActiveLinkCountAtDecision: input.historicalActiveLinkCountAtDecision,
    historicalLinkUniquenessEvidenceComplete: input.historicalLinkUniquenessEvidenceComplete,
    providerIdentity: failClosed ? null : input.trustedProviderIdentity,
    verifiedModality: failClosed ? null : input.trustedVerifiedModality,
    telemetrySourceFamily: failClosed ? null : input.trustedTelemetrySourceFamily,
    profileEvidenceInterpretation: evidenceTime.interpretation,
    decisionTimeRetrospectiveAssessable: evidenceTime.decisionTimeRetrospectiveAssessable,
    profileContractVersion: profile?.profileContractVersion ?? null,
    profileRevision: profile?.profileRevision ?? null,
    profileContentFingerprint: profile?.contentFingerprint ?? null,
    profileLimitations: profile?.profileLimitations ?? [],
    signals,
    consumerDemand,
    evidenceLimitations: limitations,
    attributionStatus,
    shadowBindingStatus: binding.bindingStatus,
    shadowBindingReasons: binding.reasons,
  };
}
