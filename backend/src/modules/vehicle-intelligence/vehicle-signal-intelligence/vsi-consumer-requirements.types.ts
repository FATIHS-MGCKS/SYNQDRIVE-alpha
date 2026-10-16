import type { VsiCanonicalSignalKey } from './canonical-signal-keys';

export const VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION = 'vsi-consumer-requirements-v1' as const;

export const VsiConsumerModuleId = {
  DRIVING_INTELLIGENCE: 'driving_intelligence',
  BATTERY_V2: 'battery_v2',
  TRIP_DETECTION: 'trip_detection',
  DTC_DIAGNOSTICS: 'dtc_diagnostics',
  APDS: 'apds',
} as const;

export type VsiConsumerModuleId =
  (typeof VsiConsumerModuleId)[keyof typeof VsiConsumerModuleId];

export const VsiDomainApprovalStatus = {
  /** Domain signed off on resolver requirement spec (thresholds may still be pending). */
  APPROVED: 'APPROVED',
  /** Design/adapter contract only — not production runtime consumer activation. */
  APPROVED_DESIGN_CONTRACT: 'APPROVED_DESIGN_CONTRACT',
  PENDING_DOMAIN_APPROVAL: 'PENDING_DOMAIN_APPROVAL',
  REJECTED: 'REJECTED',
} as const;

export type VsiDomainApprovalStatus =
  (typeof VsiDomainApprovalStatus)[keyof typeof VsiDomainApprovalStatus];

export type VsiConsumerSignalEvidenceClass = 'DECLARED_LISTED' | 'EMPIRICAL_OBSERVED';

export type VsiConsumerMinimumQuality =
  | 'ANY_OBSERVED'
  | 'FRESH_AT_EVALUATION'
  | 'QUALITY_OBSERVED_FRESH'
  | 'CONFIDENCE_HIGH';

export type VsiConsumerHistoricalReliabilityRequirement =
  | 'NONE'
  | 'PER_SIGNAL_CADENCE_PROVEN'
  | 'BUNDLE_CADENCE_ONLY';

export type VsiConsumerRequirementSpecV1 = {
  contractVersion: typeof VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION;
  consumerModule: VsiConsumerModuleId;
  featureId: string;
  requirementId: string;
  canonicalSignalKeys: readonly VsiCanonicalSignalKey[];
  providerSourceLinkScoped: true;
  minimumEvidence: VsiConsumerSignalEvidenceClass;
  /** Null when domain has not approved a threshold — resolver fails closed for that requirement. */
  maxSignalAgeMs: number | null;
  minimumQuality: VsiConsumerMinimumQuality;
  historicalReliability: VsiConsumerHistoricalReliabilityRequirement;
  declaredOnlySufficient: boolean;
  requireAllSignalsTogether: boolean;
  fallbackChainId: string | null;
  domainOwner: string;
  domainApprovalStatus: VsiDomainApprovalStatus;
  evidenceReference: string;
};
