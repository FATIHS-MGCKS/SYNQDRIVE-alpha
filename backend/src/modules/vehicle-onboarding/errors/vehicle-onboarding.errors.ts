export type VehicleOnboardingErrorCode =
  | 'CASE_NOT_FOUND'
  | 'ORGANIZATION_MISMATCH'
  | 'INVALID_CASE_TRANSITION'
  | 'READINESS_NOT_SEALED'
  | 'ACTIVATION_PRECONDITION_FAILED'
  | 'SCHEMA_REQUIRED_FIELDS_MISSING'
  | 'VIN_CONFLICT_REQUIRES_IDENTITY_REVIEW'
  | 'IDENTITY_REVIEW_REQUIRED'
  | 'SOURCE_REF_CONFLICT'
  | 'TERMINAL_CASE_IDEMPOTENCY'
  | 'COMPOSITE_IDENTITY_CONFLICT'
  | 'PROVIDER_LINK_CONFLICT'
  | 'HM_ALREADY_REGISTERED';

export class VehicleOnboardingError extends Error {
  constructor(
    readonly code: VehicleOnboardingErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'VehicleOnboardingError';
  }
}
