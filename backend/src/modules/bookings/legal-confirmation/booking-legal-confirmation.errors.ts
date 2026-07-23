import type { BookingLegalConfirmationErrorCode } from './booking-legal-confirmation.constants';

export class BookingLegalConfirmationError extends Error {
  constructor(
    public readonly code: BookingLegalConfirmationErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BookingLegalConfirmationError';
  }
}
