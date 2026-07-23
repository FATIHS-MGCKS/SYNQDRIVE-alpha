import {
  DataProcessingAgreementStatus,
  DataSharingAuthorizationStatus,
  DataSubjectConsentStatus,
  EnforcementPolicyStatus,
  LegalBasisAssessmentStatus,
  PrivacyEnforcementMode,
  PrivacyEnforcementScopeType,
  PrivacyLegalBasisType,
  ProcessingActivityStatus,
  ProviderAccessGrantStatus,
} from '@prisma/client';

export interface TenantScopedRecord {
  organizationId: string;
}

export interface ProcessingActivityInvariantInput extends TenantScopedRecord {
  activityCode: string;
  title: string;
  status: ProcessingActivityStatus;
}

export interface LegalBasisAssessmentInvariantInput extends TenantScopedRecord {
  processingActivityOrganizationId: string;
  legalBasisType: PrivacyLegalBasisType;
  status: LegalBasisAssessmentStatus;
}

export interface DataSubjectConsentInvariantInput extends TenantScopedRecord {
  processingActivityOrganizationId: string;
  legalBasisAssessmentOrganizationId?: string | null;
  status: DataSubjectConsentStatus;
  subjectRefId?: string | null;
  grantedAt?: Date | null;
  withdrawnAt?: Date | null;
  expiresAt?: Date | null;
}

export interface ProviderAccessGrantInvariantInput extends TenantScopedRecord {
  processingActivityOrganizationId?: string | null;
  vehicleOrganizationId?: string | null;
  status: ProviderAccessGrantStatus;
  grantedAt?: Date | null;
  revokedAt?: Date | null;
  expiresAt?: Date | null;
}

export interface DataSharingAuthorizationInvariantInput extends TenantScopedRecord {
  processingActivityOrganizationId: string;
  status: DataSharingAuthorizationStatus;
  authorizedAt?: Date | null;
  revokedAt?: Date | null;
  expiresAt?: Date | null;
}

export interface DataProcessingAgreementInvariantInput extends TenantScopedRecord {
  processingActivityOrganizationId?: string | null;
  status: DataProcessingAgreementStatus;
  effectiveFrom?: Date | null;
  effectiveUntil?: Date | null;
  signedAt?: Date | null;
  terminatedAt?: Date | null;
}

export interface EnforcementPolicyInvariantInput extends TenantScopedRecord {
  processingActivityOrganizationId: string;
  status: EnforcementPolicyStatus;
  enforcementMode: PrivacyEnforcementMode;
  scopeType: PrivacyEnforcementScopeType;
  scopeVehicleId?: string | null;
  scopeCustomerId?: string | null;
  scopeBookingId?: string | null;
}

export interface AuthorizationDecisionEventInvariantInput extends TenantScopedRecord {
  processingActivityOrganizationId?: string | null;
  enforcementPolicyOrganizationId?: string | null;
}

function assertNonEmpty(value: string, code: string): void {
  if (!value.trim()) {
    throw new Error(code);
  }
}

function assertOrgMatch(
  organizationId: string,
  relatedOrganizationId: string | null | undefined,
  code: string,
): void {
  if (relatedOrganizationId && organizationId !== relatedOrganizationId) {
    throw new Error(code);
  }
}

function assertChronology(
  earlier: Date | null | undefined,
  later: Date | null | undefined,
  code: string,
): void {
  if (earlier && later && earlier.getTime() > later.getTime()) {
    throw new Error(code);
  }
}

export function validateProcessingActivity(input: ProcessingActivityInvariantInput): void {
  assertNonEmpty(input.activityCode, 'processing_activity_code_required');
  assertNonEmpty(input.title, 'processing_activity_title_required');
}

export function validateLegalBasisAssessment(input: LegalBasisAssessmentInvariantInput): void {
  assertOrgMatch(
    input.organizationId,
    input.processingActivityOrganizationId,
    'legal_basis_organization_mismatch',
  );
}

export function validateDataSubjectConsent(input: DataSubjectConsentInvariantInput): void {
  assertOrgMatch(
    input.organizationId,
    input.processingActivityOrganizationId,
    'data_subject_consent_activity_organization_mismatch',
  );
  assertOrgMatch(
    input.organizationId,
    input.legalBasisAssessmentOrganizationId,
    'data_subject_consent_legal_basis_organization_mismatch',
  );

  if (input.status === DataSubjectConsentStatus.GRANTED && !input.grantedAt) {
    throw new Error('data_subject_consent_granted_at_required');
  }

  if (input.status === DataSubjectConsentStatus.WITHDRAWN && !input.withdrawnAt) {
    throw new Error('data_subject_consent_withdrawn_at_required');
  }

  assertChronology(input.grantedAt, input.withdrawnAt, 'data_subject_consent_grant_before_withdrawal');
  assertChronology(input.grantedAt, input.expiresAt, 'data_subject_consent_grant_before_expiry');
}

export function validateProviderAccessGrant(input: ProviderAccessGrantInvariantInput): void {
  assertOrgMatch(
    input.organizationId,
    input.processingActivityOrganizationId,
    'provider_access_grant_activity_organization_mismatch',
  );
  assertOrgMatch(
    input.organizationId,
    input.vehicleOrganizationId,
    'provider_access_grant_vehicle_organization_mismatch',
  );

  if (input.status === ProviderAccessGrantStatus.ACTIVE && !input.grantedAt) {
    throw new Error('provider_access_grant_granted_at_required');
  }

  if (input.status === ProviderAccessGrantStatus.REVOKED && !input.revokedAt) {
    throw new Error('provider_access_grant_revoked_at_required');
  }

  assertChronology(input.grantedAt, input.revokedAt, 'provider_access_grant_grant_before_revoke');
  assertChronology(input.grantedAt, input.expiresAt, 'provider_access_grant_grant_before_expiry');
}

export function validateDataSharingAuthorization(
  input: DataSharingAuthorizationInvariantInput,
): void {
  assertOrgMatch(
    input.organizationId,
    input.processingActivityOrganizationId,
    'data_sharing_activity_organization_mismatch',
  );

  if (input.status === DataSharingAuthorizationStatus.AUTHORIZED && !input.authorizedAt) {
    throw new Error('data_sharing_authorized_at_required');
  }

  if (input.status === DataSharingAuthorizationStatus.REVOKED && !input.revokedAt) {
    throw new Error('data_sharing_revoked_at_required');
  }

  assertChronology(input.authorizedAt, input.revokedAt, 'data_sharing_authorize_before_revoke');
  assertChronology(input.authorizedAt, input.expiresAt, 'data_sharing_authorize_before_expiry');
}

export function validateDataProcessingAgreement(input: DataProcessingAgreementInvariantInput): void {
  assertOrgMatch(
    input.organizationId,
    input.processingActivityOrganizationId,
    'data_processing_agreement_activity_organization_mismatch',
  );

  if (input.status === DataProcessingAgreementStatus.ACTIVE && !input.signedAt) {
    throw new Error('data_processing_agreement_signed_at_required');
  }

  if (input.status === DataProcessingAgreementStatus.TERMINATED && !input.terminatedAt) {
    throw new Error('data_processing_agreement_terminated_at_required');
  }

  assertChronology(input.effectiveFrom, input.effectiveUntil, 'data_processing_agreement_effective_range');
  assertChronology(input.signedAt, input.terminatedAt, 'data_processing_agreement_signed_before_terminated');
}

export function validateEnforcementPolicy(input: EnforcementPolicyInvariantInput): void {
  assertOrgMatch(
    input.organizationId,
    input.processingActivityOrganizationId,
    'enforcement_policy_activity_organization_mismatch',
  );

  if (input.scopeType === PrivacyEnforcementScopeType.VEHICLE && !input.scopeVehicleId) {
    throw new Error('enforcement_policy_vehicle_scope_id_required');
  }

  if (input.scopeType === PrivacyEnforcementScopeType.CUSTOMER && !input.scopeCustomerId) {
    throw new Error('enforcement_policy_customer_scope_id_required');
  }

  if (input.scopeType === PrivacyEnforcementScopeType.BOOKING && !input.scopeBookingId) {
    throw new Error('enforcement_policy_booking_scope_id_required');
  }

  if (
    input.status === EnforcementPolicyStatus.ACTIVE &&
    input.enforcementMode === PrivacyEnforcementMode.OFF
  ) {
    throw new Error('enforcement_policy_active_requires_mode');
  }
}

export function validateAuthorizationDecisionEvent(
  input: AuthorizationDecisionEventInvariantInput,
): void {
  assertOrgMatch(
    input.organizationId,
    input.processingActivityOrganizationId,
    'authorization_decision_event_activity_organization_mismatch',
  );
  assertOrgMatch(
    input.organizationId,
    input.enforcementPolicyOrganizationId,
    'authorization_decision_event_policy_organization_mismatch',
  );
}

export function isProcessingActivityOperational(status: ProcessingActivityStatus): boolean {
  return status === ProcessingActivityStatus.ACTIVE;
}

export function isEnforcementPolicyOperational(
  status: EnforcementPolicyStatus,
  mode: PrivacyEnforcementMode,
): boolean {
  return status === EnforcementPolicyStatus.ACTIVE && mode !== PrivacyEnforcementMode.OFF;
}
