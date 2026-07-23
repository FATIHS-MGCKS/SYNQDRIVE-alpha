import {
  LegalBasisConsentRequirement,
  PrivacyLegalBasisType,
} from '@prisma/client';

export const PRIVACY_LEGAL_BASIS_TYPES = Object.values(PrivacyLegalBasisType);

export const LEGAL_BASIS_CONSENT_REQUIREMENTS = Object.values(LegalBasisConsentRequirement);

export const LEGAL_BASIS_CONSENT_APPLICABLE_REQUIREMENTS = LEGAL_BASIS_CONSENT_REQUIREMENTS.filter(
  (value) => value !== LegalBasisConsentRequirement.NOT_APPLICABLE,
);

export const LEGAL_BASIS_TYPE_LABELS: Record<PrivacyLegalBasisType, string> = {
  [PrivacyLegalBasisType.CONTRACT]: 'Contract (Art. 6(1)(b))',
  [PrivacyLegalBasisType.LEGAL_OBLIGATION]: 'Legal obligation (Art. 6(1)(c))',
  [PrivacyLegalBasisType.LEGITIMATE_INTERESTS]: 'Legitimate interests (Art. 6(1)(f))',
  [PrivacyLegalBasisType.CONSENT]: 'Consent (Art. 6(1)(a))',
  [PrivacyLegalBasisType.VITAL_INTERESTS]: 'Vital interests (Art. 6(1)(d))',
  [PrivacyLegalBasisType.PUBLIC_TASK]: 'Public task (Art. 6(1)(e))',
  [PrivacyLegalBasisType.OTHER_WITH_LEGAL_REFERENCE]: 'Other with legal reference',
};
