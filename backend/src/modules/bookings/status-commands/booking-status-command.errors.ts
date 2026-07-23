import { BadRequestException, ConflictException } from '@nestjs/common';

export const BOOKING_STATUS_COMMAND_ERROR_CODES = {
  IDEMPOTENCY_KEY_REQUIRED: 'BOOKING_STATUS_IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_KEY_CONFLICT: 'BOOKING_STATUS_IDEMPOTENCY_KEY_CONFLICT',
  HANDOVER_PROTOCOL_REQUIRED: 'BOOKING_STATUS_HANDOVER_PROTOCOL_REQUIRED',
  LEGACY_ENDPOINT_REMOVED: 'BOOKING_STATUS_LEGACY_ENDPOINT_REMOVED',
} as const;

export class BookingStatusIdempotencyKeyRequiredError extends BadRequestException {
  constructor() {
    super({
      message: 'Idempotency-Key header is required for booking status commands',
      code: BOOKING_STATUS_COMMAND_ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
    });
  }
}

export class BookingStatusIdempotencyKeyConflictError extends ConflictException {
  constructor() {
    super({
      message: 'Idempotency-Key was already used for a different booking status command',
      code: BOOKING_STATUS_COMMAND_ERROR_CODES.IDEMPOTENCY_KEY_CONFLICT,
    });
  }
}

export class BookingStatusHandoverProtocolRequiredError extends BadRequestException {
  constructor(kind: 'PICKUP' | 'RETURN') {
    super({
      message: `${kind} handover protocol must exist before applying this status command`,
      code: BOOKING_STATUS_COMMAND_ERROR_CODES.HANDOVER_PROTOCOL_REQUIRED,
      kind,
    });
  }
}
