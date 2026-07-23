import { HttpException, HttpStatus } from '@nestjs/common';
import { DataProcessingReviewStepType } from '@prisma/client';

export class ReviewWorkflowBlockedException extends HttpException {
  constructor(message: string, details?: Record<string, unknown>) {
    super({ code: 'REVIEW_WORKFLOW_BLOCKED', message, ...details }, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

export class ReviewCycleNotFoundException extends HttpException {
  constructor() {
    super({ code: 'REVIEW_CYCLE_NOT_FOUND', message: 'Review cycle not found' }, HttpStatus.NOT_FOUND);
  }
}

export class ReviewDecisionReasonRequiredException extends HttpException {
  constructor() {
    super(
      { code: 'REVIEW_DECISION_REASON_REQUIRED', message: 'Rejection requires a reason' },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class ReviewStepNotRequiredException extends HttpException {
  constructor(stepType: DataProcessingReviewStepType) {
    super(
      { code: 'REVIEW_STEP_NOT_REQUIRED', message: `Review step not required: ${stepType}` },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class ReviewStepAlreadyDecidedException extends HttpException {
  constructor(stepType: DataProcessingReviewStepType) {
    super(
      { code: 'REVIEW_STEP_ALREADY_DECIDED', message: `Review step already decided: ${stepType}` },
      HttpStatus.CONFLICT,
    );
  }
}

export class ReviewParallelDecisionException extends HttpException {
  constructor(stepType: DataProcessingReviewStepType) {
    super(
      { code: 'REVIEW_PARALLEL_DECISION', message: `Parallel review decision conflict: ${stepType}` },
      HttpStatus.CONFLICT,
    );
  }
}

export class ReviewFourEyesViolationException extends HttpException {
  constructor() {
    super(
      { code: 'DATA_PROCESSING_FOUR_EYES_VIOLATION', message: 'Requester cannot perform final approval' },
      HttpStatus.FORBIDDEN,
    );
  }
}

export function mapReviewWorkflowError(error: unknown): never {
  if (error instanceof HttpException) throw error;
  if (error instanceof Error && error.message === 'data_processing_four_eyes_violation') {
    throw new ReviewFourEyesViolationException();
  }
  throw error;
}
