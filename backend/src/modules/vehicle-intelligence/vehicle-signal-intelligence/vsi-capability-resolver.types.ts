import type { VsiConsumerModuleId } from './vsi-consumer-requirements.types';
import { VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION } from './vsi-consumer-requirements.types';
import type { VsiFallbackApprovalStatus } from './vsi-fallback-approval.registry';

export const VSI_CAPABILITY_RESOLVER_CONTRACT_VERSION = 'vsi-capability-resolver-v1' as const;

export const VsiCapabilityResolutionStatus = {
  ELIGIBLE: 'ELIGIBLE',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  NOT_ASSESSABLE: 'NOT_ASSESSABLE',
  UNKNOWN: 'UNKNOWN',
} as const;

export type VsiCapabilityResolutionStatus =
  (typeof VsiCapabilityResolutionStatus)[keyof typeof VsiCapabilityResolutionStatus];

export const VsiCapabilityResolverReasonCode = {
  PROFILE_NOT_FOUND: 'PROFILE_NOT_FOUND',
  LINK_NOT_FOUND: 'LINK_NOT_FOUND',
  LINK_INACTIVE: 'LINK_INACTIVE',
  LINK_SUPERSEDED: 'LINK_SUPERSEDED',
  TENANT_SCOPE_MISMATCH: 'TENANT_SCOPE_MISMATCH',
  LEGACY_PROFILE_MISSING_P3_QUALITY: 'LEGACY_PROFILE_MISSING_P3_QUALITY',
  DECLARED_CATALOG_AMBIGUOUS: 'DECLARED_CATALOG_AMBIGUOUS',
  REQUIREMENT_PENDING_DOMAIN_APPROVAL: 'REQUIREMENT_PENDING_DOMAIN_APPROVAL',
  SIGNAL_NOT_MATERIALIZED: 'SIGNAL_NOT_MATERIALIZED',
  SIGNAL_NEVER_OBSERVED: 'SIGNAL_NEVER_OBSERVED',
  SIGNAL_DECLARED_ONLY: 'SIGNAL_DECLARED_ONLY',
  SIGNAL_STALE_AT_EVALUATION: 'SIGNAL_STALE_AT_EVALUATION',
  QUALITY_INSUFFICIENT: 'QUALITY_INSUFFICIENT',
  HISTORICAL_RELIABILITY_UNAVAILABLE: 'HISTORICAL_RELIABILITY_UNAVAILABLE',
  FALLBACK_NOT_APPROVED: 'FALLBACK_NOT_APPROVED',
  FALLBACK_REVOKED: 'FALLBACK_REVOKED',
  MULTI_ACTIVE_SOURCE_LINKS: 'MULTI_ACTIVE_SOURCE_LINKS',
  ATTRIBUTION_UNKNOWN: 'ATTRIBUTION_UNKNOWN',
} as const;

export type VsiCapabilityResolverReasonCode =
  (typeof VsiCapabilityResolverReasonCode)[keyof typeof VsiCapabilityResolverReasonCode];

export type VsiCapabilityResolverInput = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  consumerModule: VsiConsumerModuleId;
  featureId: string;
  requirementsVersion: typeof VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION;
  evaluationTime: Date;
};

export type VsiCapabilitySignalEvaluationV1 = {
  canonicalSignalKey: string;
  satisfied: boolean;
  empiricalObservation: string | null;
  freshnessAtEvaluation: 'FRESH' | 'STALE' | 'UNKNOWN';
  qualityClassification: string | null;
  confidenceLevel: string | null;
  lastSourceTimestamp: string | null;
  limitations: string[];
  reasonCodes: VsiCapabilityResolverReasonCode[];
};

export type VsiCapabilityFallbackPlanV1 = {
  chainId: string;
  status: VsiFallbackApprovalStatus;
  executable: boolean;
  fromCanonicalSignalKey: string;
  toCanonicalSignalKey: string;
  notes: readonly string[];
};

export type VsiCapabilityResolverResultV1 = {
  contractVersion: typeof VSI_CAPABILITY_RESOLVER_CONTRACT_VERSION;
  resolutionStatus: VsiCapabilityResolutionStatus;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  consumerModule: VsiConsumerModuleId;
  featureId: string;
  requirementsVersion: typeof VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION;
  evaluationTime: string;
  profileContractVersion: string | null;
  profileRevision: number | null;
  profileContentFingerprint: string | null;
  signalEvaluations: VsiCapabilitySignalEvaluationV1[];
  missingRequirementIds: string[];
  limitations: string[];
  reasonCodes: VsiCapabilityResolverReasonCode[];
  fallbackPlan: VsiCapabilityFallbackPlanV1 | null;
  evidenceProvenance: string[];
};

export type VsiCapabilityResolverProfileContext = {
  profileContractVersion: string;
  profileRevision: number;
  contentFingerprint: string;
  profileLimitations: string[];
  signals: Array<{
    canonicalSignalKey: string;
    declaredSupport: string;
    empiricalObservation: string;
    lastSourceTimestamp: string | null;
    lastValidObservationAt: string | null;
    freshnessClassification: string;
    limitations: string[];
    qualityClassification?: string;
    confidenceLevel?: string;
    observedCadenceMedianSeconds?: number | null;
    observedSamples?: number | null;
  }>;
};

export type VsiCapabilityResolverLinkContext = {
  id: string;
  vehicleId: string;
  isActive: boolean;
  supersededAt: Date | null;
  organizationId: string;
};
