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
import {
  isEnforcementPolicyOperational,
  isProcessingActivityOperational,
  validateAuthorizationDecisionEvent,
  validateDataProcessingAgreement,
  validateDataSharingAuthorization,
  validateDataSubjectConsent,
  validateEnforcementPolicy,
  validateLegalBasisAssessment,
  validateProcessingActivity,
  validateProviderAccessGrant,
} from './privacy-domain.invariants';

describe('privacy-domain.invariants', () => {
  const orgId = 'org-1';
  const otherOrgId = 'org-2';

  describe('validateProcessingActivity', () => {
    it('requires activity code and title', () => {
      expect(() =>
        validateProcessingActivity({
          organizationId: orgId,
          activityCode: '   ',
          title: 'DIMO Telemetry',
          status: ProcessingActivityStatus.DRAFT,
        }),
      ).toThrow('processing_activity_code_required');

      expect(() =>
        validateProcessingActivity({
          organizationId: orgId,
          activityCode: 'DIMO_TELEMETRY',
          title: '',
          status: ProcessingActivityStatus.DRAFT,
        }),
      ).toThrow('processing_activity_title_required');
    });
  });

  describe('validateLegalBasisAssessment', () => {
    it('rejects cross-tenant processing activity', () => {
      expect(() =>
        validateLegalBasisAssessment({
          organizationId: orgId,
          processingActivityOrganizationId: otherOrgId,
          legalBasisType: PrivacyLegalBasisType.LEGITIMATE_INTERESTS,
          status: LegalBasisAssessmentStatus.DRAFT,
        }),
      ).toThrow('legal_basis_organization_mismatch');
    });
  });

  describe('validateDataSubjectConsent', () => {
    it('requires grantedAt for GRANTED status', () => {
      expect(() =>
        validateDataSubjectConsent({
          organizationId: orgId,
          processingActivityOrganizationId: orgId,
          consentStatus: DataSubjectConsentStatus.GRANTED,
          dataSubjectReference: 'subject-ref-12345678',
        }),
      ).toThrow('data_subject_consent_granted_at_required');
    });

    it('requires withdrawnAt for WITHDRAWN status', () => {
      expect(() =>
        validateDataSubjectConsent({
          organizationId: orgId,
          processingActivityOrganizationId: orgId,
          consentStatus: DataSubjectConsentStatus.WITHDRAWN,
          dataSubjectReference: 'subject-ref-12345678',
          grantedAt: new Date('2026-01-01T00:00:00Z'),
        }),
      ).toThrow('data_subject_consent_withdrawn_at_required');
    });

    it('enforces grant before withdrawal chronology', () => {
      expect(() =>
        validateDataSubjectConsent({
          organizationId: orgId,
          processingActivityOrganizationId: orgId,
          consentStatus: DataSubjectConsentStatus.WITHDRAWN,
          dataSubjectReference: 'subject-ref-12345678',
          grantedAt: new Date('2026-02-01T00:00:00Z'),
          withdrawnAt: new Date('2026-01-01T00:00:00Z'),
        }),
      ).toThrow('data_subject_consent_grant_before_withdrawal');
    });
  });

  describe('validateProviderAccessGrant', () => {
    it('rejects vehicle organization mismatch', () => {
      expect(() =>
        validateProviderAccessGrant({
          organizationId: orgId,
          vehicleOrganizationId: otherOrgId,
          providerStatus: ProviderAccessGrantStatus.PENDING,
        }),
      ).toThrow('provider_access_grant_vehicle_organization_mismatch');
    });
  });

  describe('validateDataSharingAuthorization', () => {
    it('requires validFrom for AUTHORIZED status', () => {
      expect(() =>
        validateDataSharingAuthorization({
          organizationId: orgId,
          processingActivityOrganizationId: orgId,
          status: DataSharingAuthorizationStatus.AUTHORIZED,
        }),
      ).toThrow('data_sharing_valid_from_required');
    });
  });

  describe('validateDataProcessingAgreement', () => {
    it('requires signedAt for ACTIVE agreements', () => {
      expect(() =>
        validateDataProcessingAgreement({
          organizationId: orgId,
          status: DataProcessingAgreementStatus.ACTIVE,
        }),
      ).toThrow('data_processing_agreement_signed_at_required');
    });
  });

  describe('validateEnforcementPolicy', () => {
    it('requires relational vehicle scope for VEHICLE scope type', () => {
      expect(() =>
        validateEnforcementPolicy({
          organizationId: orgId,
          processingActivityOrganizationId: orgId,
          status: EnforcementPolicyStatus.DRAFT,
          enforcementMode: PrivacyEnforcementMode.SHADOW,
          scopeType: PrivacyEnforcementScopeType.VEHICLE,
          vehicleScopeCount: 0,
        }),
      ).toThrow('enforcement_policy_vehicle_scope_required');
    });

    it('rejects ACTIVE policy with OFF mode', () => {
      expect(() =>
        validateEnforcementPolicy({
          organizationId: orgId,
          processingActivityOrganizationId: orgId,
          status: EnforcementPolicyStatus.ACTIVE,
          enforcementMode: PrivacyEnforcementMode.OFF,
          scopeType: PrivacyEnforcementScopeType.ORGANIZATION,
        }),
      ).toThrow('enforcement_policy_active_requires_mode');
    });
  });

  describe('validateAuthorizationDecisionEvent', () => {
    it('rejects policy organization mismatch', () => {
      expect(() =>
        validateAuthorizationDecisionEvent({
          organizationId: orgId,
          enforcementPolicyOrganizationId: otherOrgId,
        }),
      ).toThrow('authorization_decision_event_policy_organization_mismatch');
    });
  });

  describe('operational helpers', () => {
    it('detects operational processing activity', () => {
      expect(isProcessingActivityOperational(ProcessingActivityStatus.ACTIVE)).toBe(true);
      expect(isProcessingActivityOperational(ProcessingActivityStatus.DRAFT)).toBe(false);
    });

    it('detects operational enforcement policy', () => {
      expect(
        isEnforcementPolicyOperational(
          EnforcementPolicyStatus.ACTIVE,
          PrivacyEnforcementMode.ENFORCE,
        ),
      ).toBe(true);
      expect(
        isEnforcementPolicyOperational(
          EnforcementPolicyStatus.ACTIVE,
          PrivacyEnforcementMode.OFF,
        ),
      ).toBe(false);
    });
  });
});
