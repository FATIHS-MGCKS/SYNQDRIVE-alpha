import { ForbiddenException } from '@nestjs/common';

export class HealthAccessDeniedException extends ForbiddenException {
  constructor(
    public readonly reasonCode: string,
    public readonly correlationId?: string,
  ) {
    super({
      statusCode: 403,
      error: 'HEALTH_ACCESS_DENIED',
      reasonCode,
      correlationId: correlationId ?? null,
    });
  }
}
