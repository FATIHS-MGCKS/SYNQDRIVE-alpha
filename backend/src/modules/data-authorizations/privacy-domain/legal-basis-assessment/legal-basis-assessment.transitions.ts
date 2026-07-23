import {
  LegalBasisAssessmentStatus,
  PrivacyLegalBasisType,
} from '@prisma/client';

export const LEGAL_BASIS_ASSESSMENT_TRANSITIONS: Record<
  LegalBasisAssessmentStatus,
  LegalBasisAssessmentStatus[]
> = {
  [LegalBasisAssessmentStatus.DRAFT]: [LegalBasisAssessmentStatus.UNDER_REVIEW],
  [LegalBasisAssessmentStatus.UNDER_REVIEW]: [
    LegalBasisAssessmentStatus.APPROVED,
    LegalBasisAssessmentStatus.REJECTED,
  ],
  [LegalBasisAssessmentStatus.APPROVED]: [
    LegalBasisAssessmentStatus.SUPERSEDED,
    LegalBasisAssessmentStatus.EXPIRED,
  ],
  [LegalBasisAssessmentStatus.REJECTED]: [],
  [LegalBasisAssessmentStatus.SUPERSEDED]: [],
  [LegalBasisAssessmentStatus.EXPIRED]: [],
};

export const IMMUTABLE_LEGAL_BASIS_STATUSES: LegalBasisAssessmentStatus[] = [
  LegalBasisAssessmentStatus.APPROVED,
  LegalBasisAssessmentStatus.REJECTED,
  LegalBasisAssessmentStatus.SUPERSEDED,
  LegalBasisAssessmentStatus.EXPIRED,
];

export const EDITABLE_LEGAL_BASIS_STATUSES: LegalBasisAssessmentStatus[] = [
  LegalBasisAssessmentStatus.DRAFT,
];

export function assertLegalBasisTransitionAllowed(
  from: LegalBasisAssessmentStatus,
  to: LegalBasisAssessmentStatus,
): void {
  const allowed = LEGAL_BASIS_ASSESSMENT_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`legal_basis_transition_not_allowed:${from}:${to}`);
  }
}

export function isLegalBasisAssessmentImmutable(status: LegalBasisAssessmentStatus): boolean {
  return IMMUTABLE_LEGAL_BASIS_STATUSES.includes(status);
}

export interface LegalBasisContentInput {
  legalBasisType: PrivacyLegalBasisType;
  legalReference?: string | null;
  necessityAssessment?: string | null;
  proportionalityAssessment?: string | null;
  legitimateInterestDescription?: string | null;
  balancingTestReference?: string | null;
  consentRequirement?: string | null;
}

export function assertLegalBasisContentGates(input: LegalBasisContentInput): void {
  const text = (value?: string | null) => (value ?? '').trim();

  switch (input.legalBasisType) {
    case PrivacyLegalBasisType.CONSENT:
      if (!input.consentRequirement || input.consentRequirement === 'NOT_APPLICABLE') {
        throw new Error('legal_basis_consent_requirement_required');
      }
      break;
    case PrivacyLegalBasisType.LEGITIMATE_INTERESTS:
      if (!text(input.legitimateInterestDescription)) {
        throw new Error('legal_basis_legitimate_interest_description_required');
      }
      if (!text(input.balancingTestReference)) {
        throw new Error('legal_basis_balancing_test_reference_required');
      }
      break;
    case PrivacyLegalBasisType.CONTRACT:
      if (!text(input.necessityAssessment)) {
        throw new Error('legal_basis_necessity_assessment_required');
      }
      break;
    case PrivacyLegalBasisType.OTHER_WITH_LEGAL_REFERENCE:
      if (!text(input.legalReference)) {
        throw new Error('legal_basis_legal_reference_required');
      }
      break;
    default:
      break;
  }
}

export function assertFourEyesSeparation(
  assessedByUserId: string | null | undefined,
  approvedByUserId: string | null | undefined,
): void {
  if (!assessedByUserId || !approvedByUserId) {
    throw new Error('legal_basis_four_eyes_actors_required');
  }
  if (assessedByUserId === approvedByUserId) {
    throw new Error('legal_basis_four_eyes_violation');
  }
}

export function isLegalBasisCurrentlyValid(input: {
  status: LegalBasisAssessmentStatus;
  validFrom?: Date | null;
  validUntil?: Date | null;
  now?: Date;
}): boolean {
  if (input.status !== LegalBasisAssessmentStatus.APPROVED) {
    return false;
  }
  const now = input.now ?? new Date();
  if (input.validFrom && input.validFrom.getTime() > now.getTime()) {
    return false;
  }
  if (input.validUntil && input.validUntil.getTime() < now.getTime()) {
    return false;
  }
  return true;
}

export const LEGAL_BASIS_MATERIAL_FIELDS = [
  'legalBasisType',
  'legalReference',
  'necessityAssessment',
  'proportionalityAssessment',
  'legitimateInterestDescription',
  'balancingTestReference',
  'consentRequirement',
  'validFrom',
  'validUntil',
  'reviewDate',
] as const;
