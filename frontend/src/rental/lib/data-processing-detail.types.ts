import type { TimelineItem } from '../../components/patterns';

export type DataProcessingEntityKind =
  | 'processing-activity'
  | 'legal-basis'
  | 'enforcement-policy'
  | 'provider-grant'
  | 'consent'
  | 'sharing'
  | 'dpa'
  | 'legacy-authorization';

export interface DataProcessingDetailTarget {
  kind: DataProcessingEntityKind;
  id: string;
  activityId?: string;
}

export interface PolicyStatusSemantics {
  status: string;
  label: string;
  description: string;
  wasEverOperational: boolean;
  isTerminal: boolean;
  isReversible: boolean;
  displayCategory:
    | 'pre_operational'
    | 'operational'
    | 'paused'
    | 'terminal_never_active'
    | 'terminal_was_active';
}

export interface ProcessingActivityRegisterDetail {
  id: string;
  activityCode: string;
  title: string;
  status: string;
  statusSemantics?: PolicyStatusSemantics;
  versionNumber: number;
  isCurrentVersion: boolean;
  ownerUserId?: string | null;
  ownerRole?: string | null;
  nextReviewDate?: string | null;
  dpiaStatus: string;
  deletionStatus?: string | null;
  description?: string | null;
  purposeSummary?: string | null;
  dataCategories: string[];
  processingPurposes: string[];
  dataSubjectTypes: string[];
  recipientCategoriesSummary?: string | null;
  internationalTransfers: Array<{
    recipient: string;
    country?: string | null;
    mechanism?: string | null;
    status: string;
  }>;
  retention: { description?: string | null; periodDays?: number | null };
  technicalOrganizationalMeasures?: string | null;
  controllerReference?: string | null;
  jointControllerSummary?: string | null;
  processors: Array<{ id: string; label: string; status: string; agreementRef?: string | null }>;
  legalBasisAssessments: Array<{
    id: string;
    status: string;
    legalBasisType: string;
    reviewDate?: string | null;
    versionNumber: number;
  }>;
  enforcementPolicies: Array<{
    id: string;
    status: string;
    dataCategory?: string | null;
    processingPurpose?: string | null;
    versionNumber: number;
  }>;
  providerAccessSummary?: {
    total: number;
    active: number;
    pending: number;
    revoked: number;
    conflicts?: number;
  };
  dataSharingAuthorizations: Array<{
    id: string;
    recipient: string;
    recipientRole?: string | null;
    status: string;
    transferCountry?: string | null;
    transferMechanism?: string | null;
  }>;
  completeness: {
    status: string;
    blockingGaps: string[];
    warnings?: string[];
  };
  runtimeCoverage?: { enforcedFlows: number; totalFlows: number } | null;
  activeReviewCycleId?: string | null;
  disclaimer?: string;
  updatedAt: string;
}

export interface ProcessingActivityVersionItem {
  id: string;
  versionNumber: number;
  isCurrentVersion: boolean;
  status: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface LegalBasisAssessmentDetail {
  id: string;
  processingActivityId: string;
  status: string;
  legalBasisType: string;
  versionNumber: number;
  isCurrentVersion: boolean;
  legalReference?: string | null;
  necessityAssessment?: string | null;
  proportionalityAssessment?: string | null;
  reviewDate?: string | null;
  ownerUserId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProviderAccessGrantDetail {
  id: string;
  provider: string;
  providerStatus: string;
  processingActivityId?: string | null;
  vehicleId?: string | null;
  grantedScopes: Array<{ scopeKey: string }>;
  providerAccountReference?: string | null;
  technicalOwnerUserId?: string | null;
  linkedVehicleCount?: number;
  legacyVehicleProviderConsentId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  statusEvents?: Array<{ toStatus: string; createdAt: string }>;
}

export interface DataSubjectConsentDetail {
  id: string;
  processingActivityId: string;
  status: string;
  dataSubjectReference: string;
  subjectType: string;
  purpose: string;
  consentTextVersion: string;
  privacyNoticeVersion: string;
  grantedAt?: string | null;
  withdrawnAt?: string | null;
  expiresAt?: string | null;
}

export interface DataSharingAuthorizationDetail {
  id: string;
  processingActivityId: string;
  recipient: string;
  recipientRole?: string | null;
  status: string;
  transferCountry?: string | null;
  transferMechanism?: string | null;
  authorizedAt?: string | null;
  revokedAt?: string | null;
}

export interface DataProcessingAgreementDetailView {
  id: string;
  processorName: string;
  processorRole: string;
  status: string;
  versionNumber: number;
  isCurrentVersion: boolean;
  contractReference?: string | null;
  transferAssessmentStatus?: string | null;
  primaryTransferMechanism?: string | null;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  reviewDate?: string | null;
  ownerUserId?: string | null;
  linkedActivities?: Array<{ processingActivity: { id: string; title: string; activityCode: string } }>;
  subprocessors?: Array<{ id: string; name: string; status: string }>;
  transferCountries?: Array<{ countryCode: string; transferMechanism: string; assessmentStatus?: string | null }>;
  auditEvents?: Array<{ id: string; eventType: string; summary: string; createdAt: string }>;
  governance?: { blockers?: string[]; warnings?: string[] };
  disclaimer?: string;
}

export interface RevocationWorkflowDetail {
  workflow: {
    id: string;
    status: string;
    entityType: string;
    entityId: string;
    reason?: string | null;
    createdAt: string;
    updatedAt: string;
  };
  stepEvents: Array<{
    id: string;
    stepKey: string;
    status: string;
    detail?: string | null;
    createdAt: string;
  }>;
}

export interface ReviewCycleDetail {
  id: string;
  status: string;
  riskLevel?: string | null;
  entityVersionNumber: number;
  fourEyesRequired?: boolean;
  decisions: Array<{
    id: string;
    stepType: string;
    outcome: string;
    actorUserId?: string | null;
    reason?: string | null;
    decidedAt: string;
  }>;
}

export interface DetailTimelinePage {
  items: TimelineItem[];
  nextCursor: string | null;
}
