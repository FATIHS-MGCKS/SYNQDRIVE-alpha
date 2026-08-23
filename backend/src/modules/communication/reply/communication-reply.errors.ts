import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

export type CommunicationReplyErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_TRANSITION'
  | 'ALREADY_CLAIMED'
  | 'STALE_STATE'
  | 'CHANNEL_NOT_REPLYABLE'
  | 'CHANNEL_NOT_CONFIGURED'
  | 'MESSAGE_TOO_LONG'
  | 'MESSAGE_EMPTY'
  | 'IDEMPOTENCY_CONFLICT'
  | 'SEND_FAILED'
  | 'SEND_UNKNOWN'
  | 'TEMPLATE_REQUIRED'
  | 'RATE_LIMITED'
  | 'MEDIA_NOT_SUPPORTED'
  | 'UNKNOWN';

export class CommunicationReplyError {
  static notFound(): NotFoundException {
    return new NotFoundException({
      code: 'NOT_FOUND' satisfies CommunicationReplyErrorCode,
      message: 'Communication conversation not found',
    });
  }

  static forbidden(): ForbiddenException {
    return new ForbiddenException({
      code: 'FORBIDDEN' satisfies CommunicationReplyErrorCode,
      message: 'Insufficient permission for this communication action',
    });
  }

  static invalidTransition(message = 'Conversation state does not allow reply'): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_TRANSITION' satisfies CommunicationReplyErrorCode,
      message,
    });
  }

  static alreadyClaimed(): ConflictException {
    return new ConflictException({
      code: 'ALREADY_CLAIMED' satisfies CommunicationReplyErrorCode,
      message: 'Conversation is owned by another operator',
    });
  }

  static staleState(): ConflictException {
    return new ConflictException({
      code: 'STALE_STATE' satisfies CommunicationReplyErrorCode,
      message: 'Conversation state changed during reply',
    });
  }

  static channelNotReplyable(): BadRequestException {
    return new BadRequestException({
      code: 'CHANNEL_NOT_REPLYABLE' satisfies CommunicationReplyErrorCode,
      message: 'This channel does not support text replies',
    });
  }

  static channelNotConfigured(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'CHANNEL_NOT_CONFIGURED' satisfies CommunicationReplyErrorCode,
      message: 'Channel sending is not configured',
    });
  }

  static messageTooLong(max: number): BadRequestException {
    return new BadRequestException({
      code: 'MESSAGE_TOO_LONG' satisfies CommunicationReplyErrorCode,
      message: `Message exceeds maximum length of ${max} characters`,
      maxLength: max,
    });
  }

  static messageEmpty(): BadRequestException {
    return new BadRequestException({
      code: 'MESSAGE_EMPTY' satisfies CommunicationReplyErrorCode,
      message: 'Message text is required',
    });
  }

  static idempotencyConflict(): ConflictException {
    return new ConflictException({
      code: 'IDEMPOTENCY_CONFLICT' satisfies CommunicationReplyErrorCode,
      message: 'Idempotency key was already used with different message text',
    });
  }

  static sendFailed(message = 'Message could not be sent'): BadRequestException {
    return new BadRequestException({
      code: 'SEND_FAILED' satisfies CommunicationReplyErrorCode,
      message,
    });
  }

  static sendUnknown(): ConflictException {
    return new ConflictException({
      code: 'SEND_UNKNOWN' satisfies CommunicationReplyErrorCode,
      message: 'Delivery status is being confirmed',
    });
  }

  static templateRequired(): BadRequestException {
    return new BadRequestException({
      code: 'TEMPLATE_REQUIRED' satisfies CommunicationReplyErrorCode,
      message: 'A template is required to message this contact',
    });
  }

  static mediaNotSupported(): BadRequestException {
    return new BadRequestException({
      code: 'MEDIA_NOT_SUPPORTED' satisfies CommunicationReplyErrorCode,
      message: 'Media attachments are not supported for this reply',
    });
  }

  static rateLimited(): ConflictException {
    return new ConflictException({
      code: 'RATE_LIMITED' satisfies CommunicationReplyErrorCode,
      message: 'Send rate limit reached — try again later',
    });
  }
}
