import { ConflictException, NotFoundException } from '@nestjs/common';
import type { HandoverSessionBlocker } from './handover-session.types';

export class HandoverSessionTransitionForbiddenException extends ConflictException {
  constructor(payload: {
    code: string;
    message: string;
    blockers?: HandoverSessionBlocker[];
  }) {
    super({
      code: payload.code,
      message: payload.message,
      blockers: payload.blockers,
    });
  }
}

export class HandoverSessionNotFoundException extends NotFoundException {
  constructor(message = 'Handover session not found') {
    super({ code: 'HANDOVER_SESSION_NOT_FOUND', message });
  }
}
