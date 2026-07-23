import {
  ConsentInteractionChannel,
  DataSharingAuthorizationStatus,
  DataSubjectConsentStatus,
  DataSubjectType,
  EnforcementPolicyStatus,
  PrivacyProcessingPurpose,
  ProviderAccessGrantStatus,
} from '@prisma/client';
import {
  assertConsentTransition,
  assertConsentVersionsPresent,
  assertDataSubjectReferencePresent,
  assertProviderGrantTransition,
  assertSharingTransition,
} from './privacy-domain.lifecycle';

describe('privacy-domain.lifecycle', () => {
  describe('assertConsentTransition', () => {
    it('allows PENDING → GRANTED', () => {
      expect(() =>
        assertConsentTransition(DataSubjectConsentStatus.PENDING, DataSubjectConsentStatus.GRANTED),
      ).not.toThrow();
    });

    it('rejects PENDING → WITHDRAWN', () => {
      expect(() =>
        assertConsentTransition(DataSubjectConsentStatus.PENDING, DataSubjectConsentStatus.WITHDRAWN),
      ).toThrow('consent_transition_not_allowed:PENDING:WITHDRAWN');
    });
  });

  describe('assertProviderGrantTransition', () => {
    it('allows PENDING → ACTIVE', () => {
      expect(() =>
        assertProviderGrantTransition(ProviderAccessGrantStatus.PENDING, ProviderAccessGrantStatus.ACTIVE),
      ).not.toThrow();
    });

    it('rejects REVOKED → ACTIVE', () => {
      expect(() =>
        assertProviderGrantTransition(ProviderAccessGrantStatus.REVOKED, ProviderAccessGrantStatus.ACTIVE),
      ).toThrow('provider_grant_transition_not_allowed:REVOKED:ACTIVE');
    });
  });

  describe('assertSharingTransition', () => {
    it('allows AUTHORIZED → REVOKED', () => {
      expect(() =>
        assertSharingTransition(
          DataSharingAuthorizationStatus.AUTHORIZED,
          DataSharingAuthorizationStatus.REVOKED,
        ),
      ).not.toThrow();
    });
  });

  describe('assertDataSubjectReferencePresent', () => {
    it('rejects empty reference', () => {
      expect(() =>
        assertDataSubjectReferencePresent(DataSubjectType.CUSTOMER, '   '),
      ).toThrow('data_subject_reference_required');
    });

    it('rejects short reference', () => {
      expect(() =>
        assertDataSubjectReferencePresent(DataSubjectType.CUSTOMER, 'short'),
      ).toThrow('data_subject_reference_too_short');
    });
  });

  describe('assertConsentVersionsPresent', () => {
    it('requires separate consent text and privacy notice versions', () => {
      expect(() => assertConsentVersionsPresent('v1.0', '')).toThrow(
        'privacy_notice_version_required',
      );
      expect(() => assertConsentVersionsPresent('', 'v1.0')).toThrow(
        'consent_text_version_required',
      );
    });
  });
});
