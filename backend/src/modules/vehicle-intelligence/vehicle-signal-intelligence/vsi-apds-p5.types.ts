import type { VsiConsumerRequirementSpecV1 } from './vsi-consumer-requirements.types';
import { VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION } from './vsi-consumer-requirements.types';

export const VSI_APDS_P5_CONTRACT_VERSION = 'vsi-apds-p5-readonly-v1' as const;

export const VsiApdsDemandClassification = {
  DECLARED_REQUIREMENT: 'DECLARED_REQUIREMENT',
  DOMAIN_APPROVED_REQUIREMENT: 'DOMAIN_APPROVED_REQUIREMENT',
  PENDING_DOMAIN_APPROVAL: 'PENDING_DOMAIN_APPROVAL',
  DESIGN_CONTRACT_ONLY: 'DESIGN_CONTRACT_ONLY',
  UNMATERIALIZED_SIGNAL: 'UNMATERIALIZED_SIGNAL',
  OBSERVED_WITH_INSUFFICIENT_HISTORY: 'OBSERVED_WITH_INSUFFICIENT_HISTORY',
  UNKNOWN_CAPABILITY: 'UNKNOWN_CAPABILITY',
} as const;

export type VsiApdsDemandClassification =
  (typeof VsiApdsDemandClassification)[keyof typeof VsiApdsDemandClassification];

export type VsiApdsReadonlyAdapterInputV1 = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  shadowOpportunityId: string;
  shadowDecisionAt: Date;
  requirementsContractVersion: typeof VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION;
  verifiedModality?: string | null;
  telemetrySourceFamily?: string | null;
};

export type VsiApdsCanonicalSignalRowV1 = {
  canonicalSignalKey: string;
  declaredSupport: string;
  empiricalObservation: string;
  lastValidObservationAt: string | null;
  lastSourceTimestamp: string | null;
  freshnessAtEvaluation: 'FRESH' | 'STALE' | 'UNKNOWN';
  qualityClassification: string | null;
  confidenceLevel: string | null;
  limitations: string[];
};

export type VsiApdsRequirementDemandRowV1 = {
  requirementId: string;
  consumerModule: string;
  featureId: string;
  canonicalSignalKeys: readonly string[];
  domainApprovalStatus: string;
  demandClassification: VsiApdsDemandClassification;
  assessmentStatus: 'SATISFIED' | 'INSUFFICIENT' | 'NOT_ASSESSABLE' | 'UNKNOWN';
  discrepancyReasons: string[];
};

export type VsiApdsReadonlyCapabilityObservationV1 = {
  contractVersion: typeof VSI_APDS_P5_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  shadowOpportunityId: string;
  shadowDecisionAt: string;
  requirementsContractVersion: typeof VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION;
  providerIdentity: string | null;
  telemetrySourceFamily: string | null;
  profileContractVersion: string | null;
  profileRevision: number | null;
  profileContentFingerprint: string | null;
  profileLimitations: string[];
  signals: VsiApdsCanonicalSignalRowV1[];
  consumerDemand: VsiApdsRequirementDemandRowV1[];
  evidenceLimitations: string[];
  attributionStatus: 'RESOLVED' | 'UNKNOWN';
};

export type VsiApdsShadowDecisionSnapshotV1 = {
  opportunityId: string;
  decisionAt: string;
  policyVersion: string;
  baselineDecision: string;
  overlayDecision?: string | null;
  executionVersion?: string | null;
};

export type VsiApdsShadowCorrelationResultV1 = {
  contractVersion: typeof VSI_APDS_P5_CONTRACT_VERSION;
  matchedVehicleLink: boolean;
  opportunityId: string;
  decisionAt: string;
  originalApdsPolicyDecision: string;
  vsiProfileRevision: number | null;
  vsiProfileContentFingerprint: string | null;
  consumerDemandContractVersion: typeof VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION;
  matchingCapabilities: string[];
  missingCapabilities: string[];
  observedVersusDemandedDifferences: string[];
  investigationHints: string[];
  evidenceLimitations: string[];
  correlationIsDecisionInput: false;
};

export type VsiApdsP5ObservabilitySnapshotV1 = {
  profilesPresent: number;
  profilesMissing: number;
  pendingDomainRequirementCount: number;
  designContractOnlyCount: number;
  unknownAttributionCount: number;
  notAssessableCount: number;
  correlationErrors: number;
};

export type VsiApdsRequirementDemandContext = {
  requirement: VsiConsumerRequirementSpecV1;
  demandClassification: VsiApdsDemandClassification;
};
