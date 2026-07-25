export type OperatorAccessDenialReason =
  | 'unauthenticated'
  | 'forbidden_permission'
  | 'no_organization'
  | 'no_rental_product';

export type OperatorAccessEvaluation =
  | { allowed: true }
  | { allowed: false; reason: OperatorAccessDenialReason };
