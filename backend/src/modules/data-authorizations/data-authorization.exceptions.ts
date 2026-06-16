import { ForbiddenException } from '@nestjs/common';

export class DataAuthorizationDeniedException extends ForbiddenException {
  constructor(
    message: string,
    public readonly code = 'DATA_AUTHORIZATION_DENIED',
    public readonly details?: Record<string, unknown>,
  ) {
    super({ message, code, details });
  }
}
