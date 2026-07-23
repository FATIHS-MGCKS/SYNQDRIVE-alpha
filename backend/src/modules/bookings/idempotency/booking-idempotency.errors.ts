import { BadRequestException, ConflictException } from '@nestjs/common';
import { BOOKING_IDEMPOTENCY_ERROR_CODES } from './booking-idempotency.constants';

export class BookingIdempotencyKeyRequiredError extends BadRequestException {
  constructor(operation?: string) {
    super({
      message: 'Idempotency-Key header is required for this booking mutation',
      code: BOOKING_IDEMPOTENCY_ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
      operation: operation ?? null,
    });
  }
}

export class BookingIdempotencyKeyReusedError extends ConflictException {
  constructor() {
    super({
      message: 'Idempotency-Key was already used with a different request payload',
      code: BOOKING_IDEMPOTENCY_ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
    });
  }
}

export class BookingIdempotencyInProgressError extends ConflictException {
  constructor() {
    super({
      message: 'An identical booking mutation is still in progress — retry shortly',
      code: BOOKING_IDEMPOTENCY_ERROR_CODES.IDEMPOTENCY_IN_PROGRESS,
    });
  }
}
