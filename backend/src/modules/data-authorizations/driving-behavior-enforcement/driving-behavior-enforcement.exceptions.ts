import { ForbiddenException } from '@nestjs/common';

export class DrivingBehaviorAccessDeniedException extends ForbiddenException {
  constructor(
    public readonly reasonCode: string,
    correlationId?: string,
  ) {
    super({
      message: 'Driving behavior access denied by policy',
      reasonCode,
      correlationId: correlationId ?? null,
    });
  }
}
