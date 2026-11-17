import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import { Response } from 'express';
import { CoreAppM2mRateLimitedException } from './core-app-m2m-rate-limit.errors';

@Catch(CoreAppM2mRateLimitedException)
export class CoreAppM2mRateLimitExceptionFilter implements ExceptionFilter {
  catch(exception: CoreAppM2mRateLimitedException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    response.setHeader('Retry-After', String(exception.retryAfterSeconds));
    response.status(exception.getStatus()).json(exception.getResponse());
  }
}