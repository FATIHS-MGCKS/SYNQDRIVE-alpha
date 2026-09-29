export class GroundTruthEmissionFailedError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'GroundTruthEmissionFailedError';
  }
}

export class ManualGroundTruthConfirmationConflictError extends Error {
  constructor(
    readonly code: 'MANUAL_CONFIRMATION_SCOPE_CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'ManualGroundTruthConfirmationConflictError';
  }
}

/** Active replacement already exists for source service event with a different battery scope. */
export class ReplacementGroundTruthScopeConflictError extends Error {
  constructor(
    readonly code: 'REPLACEMENT_SCOPE_CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'ReplacementGroundTruthScopeConflictError';
  }
}

export class GroundTruthSourceCorrectionRequiredError extends Error {
  constructor(
    readonly code: 'GT_SOURCE_CORRECTION_REQUIRED',
    message: string,
  ) {
    super(message);
    this.name = 'GroundTruthSourceCorrectionRequiredError';
  }
}
