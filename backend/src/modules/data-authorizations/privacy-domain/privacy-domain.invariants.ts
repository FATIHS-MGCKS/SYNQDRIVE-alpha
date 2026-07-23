import {
  DataProcessingAgreementStatus,
  DataSharingAuthorizationStatus,
  DataSubjectConsentStatus,
  PrivacyEnforcementMode,
  PrivacyEnforcementScopeType,
  PrivacyLegalBasisType,
  PrivacyPolicyLifecycleStatus,
  ProviderAccessGrantStatus,
} from '@prisma/client';

export interface TenantScopedRecord {
  organizationId: string;
}

export interface ProcessingActivityInvariantInput extends TenantScopedRecord {
  activityCode: string;
  title: string;
  status: PrivacyPolicyLifecycleStatus;
}

export interface LegalBasisAssessmentInvariantInput extends TenantScopedRecord {
  processingActivityOrganizationId: string;
  legalBasisType: PrivacyLegalBasisType;
  status: PrivacyPolicyLifecycleStatus;
}

export interface DataSubjectConsentInvariantInput extends TenantScopedRecord {
  processingActivityOrganizationId: string;
  consentStatus: DataSubjectConsentStatus;
  dataSubjectReference?: string | null;
  grantedAt?: Date | null;
  withdrawnAt?: Date | null;
  expiresAt?: Date | null;
}

export interface ProviderAccessGrantInvariantInput extends TenantScopedRecord {
  processingActivityOrganizationId?: string | null;
  vehicleOrganizationId?: string | null;
  providerStatus: ProviderAccessGrantStatus;
  grantedAt?: Date | null;
  revokedAt?: Date | null;
  expiresAt?: Date | null;
}

export interface DataSharingAuthorizationInvariantInput extends TenantScopedRecord {
  processingActivityOrganizationId: string;
  legalBasisAssessmentOrganizationId?: string | null;
  status: DataSharingAuthorizationStatus;
  validFrom?: Date | null;
  validUntil?: Date | null;
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
  status: PrivacyPolicyLifecycleStatus;
  enforcementMode: PrivacyEnforcementMode;
  scopeType: PrivacyEnforcementScopeType;
  vehicleScopeCount?: number;
  customerScopeCount?: number;
  bookingScopeCount?: number;
  stationScopeCount?: number;
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

  if (!(input.dataSubjectReference ?? '').trim()) {
    throw new Error('data_subject_reference_required');
  }

  if (input.consentStatus === DataSubjectConsentStatus.GRANTED && !input.grantedAt) {
    throw new Error('data_subject_consent_granted_at_required');
  }

  if (input.consentStatus === DataSubjectConsentStatus.WITHDRAWN && !input.withdrawnAt) {
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

  if (input.providerStatus === ProviderAccessGrantStatus.ACTIVE && !input.grantedAt) {
    throw new Error('provider_access_grant_granted_at_required');
  }

  if (input.providerStatus === ProviderAccessGrantStatus.REVOKED && !input.revokedAt) {
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
  assertOrgMatch(
    input.organizationId,
    input.legalBasisAssessmentOrganizationId,
    'data_sharing_legal_basis_organization_mismatch',
  );

  if (input.status === DataSharingAuthorizationStatus.AUTHORIZED && !input.validFrom) {
    throw new Error('data_sharing_valid_from_required');
  }

  assertChronology(input.validFrom, input.validUntil, 'data_sharing_valid_range');
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

  if (input.scopeType === PrivacyEnforcementScopeType.VEHICLE && !(input.vehicleScopeCount ?? 0)) {
    throw new Error('enforcement_policy_vehicle_scope_required');
  }

  if (input.scopeType === PrivacyEnforcementScopeType.CUSTOMER && !(input.customerScopeCount ?? 0)) {
    throw new Error('enforcement_policy_customer_scope_required');
  }

  if (input.scopeType === PrivacyEnforcementScopeType.BOOKING && !(input.bookingScopeCount ?? 0)) {
    throw new Error('enforcement_policy_booking_scope_required');
  }

  if (input.scopeType === PrivacyEnforcementScopeType.STATION && !(input.stationScopeCount ?? 0)) {
    throw new Error('enforcement_policy_station_scope_required');
  }

  if (
    input.scopeType === PrivacyEnforcementScopeType.CONNECTED_VEHICLES &&
    !(input.vehicleScopeCount ?? 0)
  ) {
    throw new Error('enforcement_policy_connected_vehicles_scope_required');
  }

  if (
    input.status === PrivacyPolicyLifecycleStatus.ACTIVE &&
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

export function isProcessingActivityOperational(status: PrivacyPolicyLifecycleStatus): boolean {
  return status === PrivacyPolicyLifecycleStatus.ACTIVE;
}

export function isEnforcementPolicyOperational(
  status: PrivacyPolicyLifecycleStatus,
  mode: PrivacyEnforcementMode,
): boolean {
  return status === PrivacyPolicyLifecycleStatus.ACTIVE && mode !== PrivacyEnforcementMode.OFF;
}
