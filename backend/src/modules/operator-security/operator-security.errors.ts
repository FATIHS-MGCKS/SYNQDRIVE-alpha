import { HttpException, HttpStatus } from '@nestjs/common';

export class OperatorRateLimitedException extends HttpException {
  constructor(retryAfterSeconds: number, scope: string) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'OPERATOR_RATE_LIMITED',
        message: 'Too many operator requests. Please retry shortly.',
        scope,
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class OperatorIdempotencyConflictException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        code: 'OPERATOR_IDEMPOTENCY_IN_PROGRESS',
        message: 'An identical request is already being processed.',
      },
      HttpStatus.CONFLICT,
    );
  }
}
