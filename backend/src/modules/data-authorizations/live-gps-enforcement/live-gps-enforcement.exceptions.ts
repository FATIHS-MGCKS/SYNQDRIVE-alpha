import { ForbiddenException } from '@nestjs/common';

/** UI-safe deny — never includes coordinates or precise location hints. */
export class LiveGpsAccessDeniedException extends ForbiddenException {
  constructor(
    public readonly reasonCode: string,
    public readonly correlationId?: string,
  ) {
    super({
      message: 'Location access is not authorized for this vehicle.',
      code: 'GPS_ACCESS_DENIED',
      reasonCode,
      correlationId,
    });
  }
}
