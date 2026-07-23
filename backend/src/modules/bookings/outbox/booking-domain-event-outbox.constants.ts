import { BOOKING_DOMAIN_EVENT_TYPES } from './booking-domain-event.types';

export const BOOKING_DOMAIN_EVENT_OUTBOX_PAYLOAD_VERSION = 1 as const;

export const BOOKING_DOMAIN_EVENT_PRIMARY_CONSUMER_ID = 'booking.primary' as const;

export const BOOKING_DOMAIN_EVENT_MAX_RETRIES = 5;
export const BOOKING_DOMAIN_EVENT_RETRY_BASE_MS = 2_000;
export const BOOKING_DOMAIN_EVENT_POLL_BATCH_SIZE = 50;
export const BOOKING_DOMAIN_EVENT_PROCESSING_STALE_MS = 300_000;
export const BOOKING_DOMAIN_EVENT_RETENTION_DAYS = 90;

export const BOOKING_DOMAIN_EVENT_FORBIDDEN_PAYLOAD_KEYS = new Set([
  'customerSignatureDataUrl',
  'staffSignatureDataUrl',
  'signatureDataUrl',
  'objectKey',
  'email',
  'phone',
  'firstName',
  'lastName',
  'notes',
  'customerName',
  'stripeCheckoutSessionId',
  'stripePaymentIntentId',
  'stripeChargeId',
  'checkoutUrl',
]);

export function buildBookingDomainEventIdempotencyKey(parts: string[]): string {
  return parts.filter(Boolean).join(':');
}

export function buildBookingDomainEventCorrelationId(bookingId: string): string {
  return `booking:${bookingId}`;
}

export function computeBookingDomainEventNextRetryAt(retryCount: number, now = new Date()): Date {
  const delayMs =
    BOOKING_DOMAIN_EVENT_RETRY_BASE_MS * Math.pow(2, Math.max(0, retryCount - 1));
  return new Date(now.getTime() + delayMs);
}

export function truncateBookingDomainEventError(message: string): string {
  return message.slice(0, 500);
}

export function mapBookingStatusToDomainEvents(input: {
  previousStatus: string | null;
  nextStatus: string;
}): string[] {
  const events: string[] = [];
  if (input.previousStatus === input.nextStatus) return events;
  if (input.nextStatus === 'CONFIRMED') {
    events.push(BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CONFIRMED);
  }
  if (input.nextStatus === 'ACTIVE') {
    events.push(BOOKING_DOMAIN_EVENT_TYPES.BOOKING_ACTIVATED);
  }
  if (input.nextStatus === 'COMPLETED') {
    events.push(BOOKING_DOMAIN_EVENT_TYPES.BOOKING_COMPLETED);
  }
  if (input.nextStatus === 'CANCELLED') {
    events.push(BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CANCELLED);
  }
  if (input.nextStatus === 'NO_SHOW') {
    events.push(BOOKING_DOMAIN_EVENT_TYPES.BOOKING_MARKED_NO_SHOW);
  }
  return events;
}
