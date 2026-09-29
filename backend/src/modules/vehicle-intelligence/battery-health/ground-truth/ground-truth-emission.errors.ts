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

export class GroundTruthSourceCorrectionRequiredError extends Error {
  constructor(
    readonly code: 'GT_SOURCE_CORRECTION_REQUIRED',
    message: string,
  ) {
    super(message);
    this.name = 'GroundTruthSourceCorrectionRequiredError';
  }
}
