/** Canonical membership roles allowed to use the Operator field app. */
export const OPERATOR_ALLOWED_MEMBERSHIP_ROLES = [
  'ORG_ADMIN',
  'SUB_ADMIN',
  'WORKER',
] as const;

export type OperatorAllowedMembershipRole = (typeof OPERATOR_ALLOWED_MEMBERSHIP_ROLES)[number];

/** Membership roles explicitly denied (backend `MembershipRole` enum). */
export const OPERATOR_DENIED_MEMBERSHIP_ROLES = ['DRIVER'] as const;

export type OperatorAccessDenialReason =
  | 'unauthenticated'
  | 'forbidden_role'
  | 'no_organization'
  | 'no_rental_product';

export type OperatorAccessEvaluation =
  | { allowed: true }
  | { allowed: false; reason: OperatorAccessDenialReason };
