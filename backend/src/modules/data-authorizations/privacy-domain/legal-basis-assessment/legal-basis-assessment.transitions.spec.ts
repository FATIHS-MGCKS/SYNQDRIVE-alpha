import {
  LegalBasisAssessmentStatus,
  PrivacyLegalBasisType,
} from '@prisma/client';
import {
  assertFourEyesSeparation,
  assertLegalBasisContentGates,
  assertLegalBasisTransitionAllowed,
  isLegalBasisAssessmentImmutable,
  isLegalBasisCurrentlyValid,
} from './legal-basis-assessment.transitions';

describe('legal-basis-assessment.transitions', () => {
  it('allows draft to under review only', () => {
    expect(() =>
      assertLegalBasisTransitionAllowed(
        LegalBasisAssessmentStatus.DRAFT,
        LegalBasisAssessmentStatus.UNDER_REVIEW,
      ),
    ).not.toThrow();
    expect(() =>
      assertLegalBasisTransitionAllowed(
        LegalBasisAssessmentStatus.DRAFT,
        LegalBasisAssessmentStatus.APPROVED,
      ),
    ).toThrow('legal_basis_transition_not_allowed:DRAFT:APPROVED');
  });

  it('requires consent requirement for CONSENT basis', () => {
    expect(() =>
      assertLegalBasisContentGates({
        legalBasisType: PrivacyLegalBasisType.CONSENT,
        consentRequirement: 'NOT_APPLICABLE',
      }),
    ).toThrow('legal_basis_consent_requirement_required');
  });

  it('requires balancing test for LEGITIMATE_INTERESTS', () => {
    expect(() =>
      assertLegalBasisContentGates({
        legalBasisType: PrivacyLegalBasisType.LEGITIMATE_INTERESTS,
        legitimateInterestDescription: 'Fleet safety',
      }),
    ).toThrow('legal_basis_balancing_test_reference_required');
  });

  it('requires necessity for CONTRACT', () => {
    expect(() =>
      assertLegalBasisContentGates({
        legalBasisType: PrivacyLegalBasisType.CONTRACT,
      }),
    ).toThrow('legal_basis_necessity_assessment_required');
  });

  it('requires legal reference for OTHER_WITH_LEGAL_REFERENCE', () => {
    expect(() =>
      assertLegalBasisContentGates({
        legalBasisType: PrivacyLegalBasisType.OTHER_WITH_LEGAL_REFERENCE,
      }),
    ).toThrow('legal_basis_legal_reference_required');
  });

  it('enforces four-eyes separation', () => {
    expect(() => assertFourEyesSeparation('user-a', 'user-b')).not.toThrow();
    expect(() => assertFourEyesSeparation('user-a', 'user-a')).toThrow(
      'legal_basis_four_eyes_violation',
    );
  });

  it('treats approved assessments as immutable', () => {
    expect(isLegalBasisAssessmentImmutable(LegalBasisAssessmentStatus.APPROVED)).toBe(true);
    expect(isLegalBasisAssessmentImmutable(LegalBasisAssessmentStatus.DRAFT)).toBe(false);
  });

  it('rejects expired approved assessments for processing', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(
      isLegalBasisCurrentlyValid({
        status: LegalBasisAssessmentStatus.APPROVED,
        validUntil: yesterday,
      }),
    ).toBe(false);
  });
});
