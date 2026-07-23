import { BadRequestException, ConflictException } from '@nestjs/common';
import { BOOKING_CONCURRENCY_ERROR_CODES } from './booking-concurrency.constants';
import type { BookingVersionRefreshPayload } from './booking-concurrency.constants';

export class BookingVersionRequiredError extends BadRequestException {
  constructor() {
    super({
      message: 'expectedUpdatedAt is required for booking mutations',
      code: BOOKING_CONCURRENCY_ERROR_CODES.VERSION_REQUIRED,
    });
  }
}

export class BookingVersionConflictError extends ConflictException {
  constructor(current: BookingVersionRefreshPayload) {
    super({
      message: 'Booking was modified by another user. Reload and retry.',
      code: BOOKING_CONCURRENCY_ERROR_CODES.VERSION_CONFLICT,
      current,
    });
  }
}
