import { buildVsiConsumerDemandVectorV1 } from './vsi-apds-demand-vector.builder';
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
  linkActive: boolean;
  linkSuperseded: boolean;
  tenantMatch: boolean;
}): VsiApdsReadonlyCapabilityObservationV1 {
  const evaluationTimeMs = input.adapter.shadowDecisionAt.getTime();
  const limitations: string[] = [
    'NOT_AN_APDS_DECISION_INPUT',
    'POLL_SUCCESS_DOES_NOT_IMPLY_SIGNAL_EVIDENCE',
  ];

  if (!input.tenantMatch) {
    limitations.push('TENANT_SCOPE_MISMATCH');
  }
  if (!input.linkActive) {
    limitations.push('SOURCE_LINK_INACTIVE');
  }
  if (input.linkSuperseded) {
    limitations.push('SOURCE_LINK_SUPERSEDED');
  }

  let attributionStatus: 'RESOLVED' | 'UNKNOWN' = 'RESOLVED';
  const profile = input.profile;

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
  } else {
    limitations.push('PROFILE_NOT_FOUND');
    attributionStatus = 'UNKNOWN';
  }

  if (!input.tenantMatch || !input.linkActive || input.linkSuperseded) {
    attributionStatus = 'UNKNOWN';
  }

  const signals = profile ? mapSignals(profile, evaluationTimeMs) : [];

  const consumerDemand = buildVsiConsumerDemandVectorV1({
    profile,
    evaluationTimeMs,
    profileLimitations: profile?.profileLimitations,
  });

  return {
    contractVersion: VSI_APDS_P5_CONTRACT_VERSION,
    organizationId: input.adapter.organizationId,
    vehicleId: input.adapter.vehicleId,
    providerSourceLinkId: input.adapter.providerSourceLinkId,
    shadowOpportunityId: input.adapter.shadowOpportunityId,
    shadowDecisionAt: input.adapter.shadowDecisionAt.toISOString(),
    requirementsContractVersion: input.adapter.requirementsContractVersion,
    providerIdentity: input.adapter.verifiedModality ?? null,
    telemetrySourceFamily: input.adapter.telemetrySourceFamily ?? null,
    profileContractVersion: profile?.profileContractVersion ?? null,
    profileRevision: profile?.profileRevision ?? null,
    profileContentFingerprint: profile?.contentFingerprint ?? null,
    profileLimitations: profile?.profileLimitations ?? [],
    signals,
    consumerDemand,
    evidenceLimitations: limitations,
    attributionStatus,
  };
}
