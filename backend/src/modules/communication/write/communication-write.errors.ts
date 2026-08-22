import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CommunicationConversationStatus } from '@prisma/client';

export type CommunicationWriteErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_TRANSITION'
  | 'ALREADY_CLAIMED'
  | 'ASSIGNEE_INVALID'
  | 'CONFLICT'
  | 'STALE_STATE'
  | 'UNKNOWN';

export class CommunicationWriteError {
  static notFound(): NotFoundException {
    return new NotFoundException({
      code: 'NOT_FOUND' satisfies CommunicationWriteErrorCode,
      message: 'Communication conversation not found',
    });
  }

  static forbidden(): ForbiddenException {
    return new ForbiddenException({
      code: 'FORBIDDEN' satisfies CommunicationWriteErrorCode,
      message: 'Insufficient permission for this communication action',
    });
  }

  static invalidTransition(
    from: CommunicationConversationStatus,
    to: CommunicationConversationStatus,
  ): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_TRANSITION' satisfies CommunicationWriteErrorCode,
      message: `Invalid conversation status transition from ${from} to ${to}`,
      fromStatus: from,
      toStatus: to,
    });
  }

  static alreadyClaimed(): ConflictException {
    return new ConflictException({
      code: 'ALREADY_CLAIMED' satisfies CommunicationWriteErrorCode,
      message: 'Conversation was claimed by another user',
    });
  }

  static assigneeInvalid(): BadRequestException {
    return new BadRequestException({
      code: 'ASSIGNEE_INVALID' satisfies CommunicationWriteErrorCode,
      message: 'Assignee is not a valid active organization member',
    });
  }

  static conflict(message: string): ConflictException {
    return new ConflictException({
      code: 'CONFLICT' satisfies CommunicationWriteErrorCode,
      message,
    });
  }

  static staleState(): ConflictException {
    return new ConflictException({
      code: 'STALE_STATE' satisfies CommunicationWriteErrorCode,
      message: 'Conversation state changed. Refresh and retry.',
    });
  }
}
