import { HttpException, HttpStatus } from '@nestjs/common';

export const CORE_APP_M2M_RATE_LIMIT_ERROR_CODE = 'CORE_APP_M2M_RATE_LIMITED' as const;

export class CoreAppM2mRateLimitedException extends HttpException {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        errorCode: CORE_APP_M2M_RATE_LIMIT_ERROR_CODE,
        message: 'Too many requests',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    this.retryAfterSeconds = Math.max(1, Math.min(3600, Math.floor(retryAfterSeconds)));
  }
}