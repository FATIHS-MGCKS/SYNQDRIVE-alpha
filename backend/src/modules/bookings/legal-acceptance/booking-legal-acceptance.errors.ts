export class BookingLegalAcceptanceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BookingLegalAcceptanceError';
  }
}
