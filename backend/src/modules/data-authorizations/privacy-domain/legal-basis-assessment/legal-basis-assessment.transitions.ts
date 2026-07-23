import {
  PrivacyLegalBasisType,
  PrivacyPolicyLifecycleStatus,
} from '@prisma/client';
import {
  POLICY_EDITABLE_STATUSES,
  POLICY_IMMUTABLE_STATUSES,
} from '../policy-lifecycle/policy-lifecycle.constants';
import {
  assertPolicyLifecycleTransition,
  isPolicyCurrentlyUsable,
  isPolicyLifecycleTransitionAllowed,
} from '../policy-lifecycle/policy-lifecycle.transitions';

export const LEGAL_BASIS_ASSESSMENT_TRANSITIONS = {
  get [PrivacyPolicyLifecycleStatus.DRAFT]() {
    return [PrivacyPolicyLifecycleStatus.IN_REVIEW];
  },
  get [PrivacyPolicyLifecycleStatus.IN_REVIEW]() {
    return [PrivacyPolicyLifecycleStatus.APPROVED, PrivacyPolicyLifecycleStatus.REJECTED, PrivacyPolicyLifecycleStatus.DRAFT];
  },
  get [PrivacyPolicyLifecycleStatus.APPROVED]() {
    return [PrivacyPolicyLifecycleStatus.SCHEDULED, PrivacyPolicyLifecycleStatus.ACTIVE, PrivacyPolicyLifecycleStatus.SUPERSEDED];
  },
  get [PrivacyPolicyLifecycleStatus.SCHEDULED]() {
    return [PrivacyPolicyLifecycleStatus.ACTIVE, PrivacyPolicyLifecycleStatus.APPROVED, PrivacyPolicyLifecycleStatus.SUPERSEDED];
  },
  get [PrivacyPolicyLifecycleStatus.ACTIVE]() {
    return [PrivacyPolicyLifecycleStatus.SUSPENDED, PrivacyPolicyLifecycleStatus.SUPERSEDED, PrivacyPolicyLifecycleStatus.REVOKED, PrivacyPolicyLifecycleStatus.EXPIRED];
  },
  get [PrivacyPolicyLifecycleStatus.SUSPENDED]() {
    return [PrivacyPolicyLifecycleStatus.ACTIVE];
  },
  get [PrivacyPolicyLifecycleStatus.SUPERSEDED]() {
    return [];
  },
  get [PrivacyPolicyLifecycleStatus.REVOKED]() {
    return [];
  },
  get [PrivacyPolicyLifecycleStatus.EXPIRED]() {
    return [];
  },
  get [PrivacyPolicyLifecycleStatus.REJECTED]() {
    return [];
  },
} as const;

export const IMMUTABLE_LEGAL_BASIS_STATUSES = [...POLICY_IMMUTABLE_STATUSES];
export const EDITABLE_LEGAL_BASIS_STATUSES = [...POLICY_EDITABLE_STATUSES];

export function assertLegalBasisTransitionAllowed(
  from: PrivacyPolicyLifecycleStatus,
  to: PrivacyPolicyLifecycleStatus,
): void {
  assertPolicyLifecycleTransition(from, to);
}

export function isLegalBasisAssessmentImmutable(status: PrivacyPolicyLifecycleStatus): boolean {
  return POLICY_IMMUTABLE_STATUSES.has(status);
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
  status: PrivacyPolicyLifecycleStatus;
  validFrom?: Date | null;
  validUntil?: Date | null;
  now?: Date;
}): boolean {
  return isPolicyCurrentlyUsable(input);
}

export function isLegalBasisTransitionAllowed(
  from: PrivacyPolicyLifecycleStatus,
  to: PrivacyPolicyLifecycleStatus,
): boolean {
  return isPolicyLifecycleTransitionAllowed(from, to);
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
