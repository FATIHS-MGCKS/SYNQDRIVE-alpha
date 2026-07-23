import type {
  DataProcessingAgreementStatus,
  DataSharingAuthorizationStatus,
  DataSubjectConsentStatus,
  LegalBasisConsentRequirement,
  PrivacyEnforcementMode,
  PrivacyEnforcementScopeType,
  PrivacyLegalBasisType,
  PrivacyPolicyLifecycleStatus,
  PrivacyProcessingDataCategory,
  PrivacyProcessingPurpose,
  ProviderAccessGrantStatus,
} from '@prisma/client';
import type {
  PolicyResolverAction,
  PolicyResolverDecision,
  PolicyResolverProcessorType,
  PolicyResolverReasonCode,
  PolicyResolverResourceType,
  PolicyResolverSourceSystem,
} from './policy-resolver.constants';

export interface PolicyResolverInput {
  organizationId: string;
  sourceSystem: PolicyResolverSourceSystem;
  dataCategory: PrivacyProcessingDataCategory;
  purpose: PrivacyProcessingPurpose;
  action: PolicyResolverAction;
  processorType: PolicyResolverProcessorType;
  processorId: string;
  resourceType: PolicyResolverResourceType;
  resourceId?: string | null;
  stationId?: string | null;
  customerId?: string | null;
  bookingId?: string | null;
  vehicleId?: string | null;
  dataSubjectReference?: string | null;
  effectiveTimestamp?: Date | string | null;
  correlationId?: string | null;
}

export interface PolicyResolverEvaluatedContext {
  organizationId: string;
  sourceSystem: PolicyResolverSourceSystem;
  dataCategory: PrivacyProcessingDataCategory;
  purpose: PrivacyProcessingPurpose;
  action: PolicyResolverAction;
  processorType: PolicyResolverProcessorType;
  processorId: string;
  resourceType: PolicyResolverResourceType;
  resourceId: string | null;
  stationId: string | null;
  customerId: string | null;
  bookingId: string | null;
  vehicleId: string | null;
  dataSubjectReference: string | null;
  effectiveTimestamp: string;
}

export interface PolicyResolverDomainStatus<TStatus extends string = string> {
  status: TStatus | 'NOT_APPLICABLE' | 'NOT_FOUND' | 'UNKNOWN';
  entityId?: string | null;
  detail?: string | null;
}

export interface PolicyResolverMatchedPolicy {
  id: string;
  policyFamilyId: string;
  versionNumber: number;
  enforcementMode: PrivacyEnforcementMode;
  scopeType: PrivacyEnforcementScopeType;
  processingActivityId: string;
  priorityScore: number;
}

export interface PolicyResolverScopeMatch {
  matched: boolean;
  scopeType: PrivacyEnforcementScopeType;
  detail?: string;
}

export interface PolicyResolverResult {
  decisionCandidate: PolicyResolverDecision;
  matchedPolicy: PolicyResolverMatchedPolicy | null;
  policyVersion: number | null;
  processingActivity: PolicyResolverDomainStatus<PrivacyPolicyLifecycleStatus> & {
    activityCode?: string | null;
  };
  legalBasisStatus: PolicyResolverDomainStatus<PrivacyPolicyLifecycleStatus> & {
    legalBasisType?: PrivacyLegalBasisType | null;
    consentRequirement?: LegalBasisConsentRequirement | null;
  };
  consentStatus: PolicyResolverDomainStatus<DataSubjectConsentStatus>;
  providerGrantStatus: PolicyResolverDomainStatus<ProviderAccessGrantStatus>;
  dataSharingStatus: PolicyResolverDomainStatus<DataSharingAuthorizationStatus>;
  dpaStatus: PolicyResolverDomainStatus<DataProcessingAgreementStatus>;
  scopeMatch: PolicyResolverScopeMatch;
  blockingReasons: PolicyResolverReasonCode[];
  warnings: string[];
  evaluatedAt: string;
  resolverVersion: string;
  evaluatedContext: PolicyResolverEvaluatedContext;
  conflictingPolicyIds?: string[];
}

export interface PolicyResolverLegalBasisCandidate {
  id: string;
  organizationId: string;
  processingActivityId: string;
  status: PrivacyPolicyLifecycleStatus;
  legalBasisType: PrivacyLegalBasisType;
  consentRequirement: LegalBasisConsentRequirement;
  validFrom: Date | null;
  validUntil: Date | null;
  balancingTestReference: string | null;
  isCurrentVersion: boolean;
  versionNumber: number;
  evidenceReferences: string[];
}

export interface PolicyResolverConsentCandidate {
  id: string;
  organizationId: string;
  processingActivityId: string;
  purpose: PrivacyProcessingPurpose;
  consentStatus: DataSubjectConsentStatus;
  dataSubjectReference: string;
  grantedAt: Date | null;
  expiresAt: Date | null;
  withdrawnAt: Date | null;
}

export interface PolicyResolverProviderGrantCandidate {
  id: string;
  organizationId: string;
  provider: string;
  providerStatus: ProviderAccessGrantStatus;
  processingActivityId: string | null;
  vehicleId: string | null;
  grantedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  scopeKeys: string[];
}

export interface PolicyResolverDataSharingCandidate {
  id: string;
  organizationId: string;
  processingActivityId: string;
  purpose: PrivacyProcessingPurpose;
  recipient: string;
  status: DataSharingAuthorizationStatus;
  transferCountry: string | null;
  transferMechanism: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  dataCategories: PrivacyProcessingDataCategory[];
}

export interface PolicyResolverDpaCandidate {
  id: string;
  organizationId: string;
  processingActivityId: string | null;
  processorLabel: string;
  status: DataProcessingAgreementStatus;
  effectiveFrom: Date | null;
  effectiveUntil: Date | null;
  signedAt: Date | null;
}

export interface PolicyResolverProcessingActivityCandidate {
  id: string;
  organizationId: string;
  activityCode: string;
  status: PrivacyPolicyLifecycleStatus;
  validFrom: Date | null;
  validUntil: Date | null;
}

export interface PolicyResolverCandidate {
  enforcementPolicy: {
    id: string;
    organizationId: string;
    policyFamilyId: string;
    versionNumber: number;
    status: PrivacyPolicyLifecycleStatus;
    enforcementMode: PrivacyEnforcementMode;
    dataCategory: PrivacyProcessingDataCategory;
    processingPurpose: PrivacyProcessingPurpose;
    scopeType: PrivacyEnforcementScopeType;
    validFrom: Date | null;
    validUntil: Date | null;
    pathId: string | null;
    processingActivityId: string;
  };
  processingActivity: PolicyResolverProcessingActivityCandidate | null;
  legalBasisAssessments: PolicyResolverLegalBasisCandidate[];
  dataSubjectConsents: PolicyResolverConsentCandidate[];
  providerAccessGrants: PolicyResolverProviderGrantCandidate[];
  dataSharingAuthorizations: PolicyResolverDataSharingCandidate[];
  dataProcessingAgreements: PolicyResolverDpaCandidate[];
  scopeVehicleIds: string[];
  scopeCustomerIds: string[];
  scopeBookingIds: string[];
  scopeStationIds: string[];
}

export interface ResolvePolicyEngineInput {
  context: PolicyResolverEvaluatedContext;
  candidates: PolicyResolverCandidate[];
}
