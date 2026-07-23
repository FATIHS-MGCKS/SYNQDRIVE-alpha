export const BOOKING_DOMAIN_EVENT_CONSUMER_IDS = {
  INVOICE: 'booking.invoice',
  DOCUMENT_BUNDLE: 'booking.document-bundle',
  RENTAL_AGREEMENT: 'booking.rental-agreement',
  PICKUP_RETURN_TASKS: 'booking.pickup-return-tasks',
  NOTIFICATIONS: 'booking.notifications',
  CUSTOMER_EMAIL: 'booking.customer-email',
  INTERNAL_EMAIL: 'booking.internal-email',
  PAYMENT_LINK: 'booking.payment-link',
  /** @deprecated Use booking.notifications — kept for receipt migration compatibility */
  PRIMARY: 'booking.primary',
} as const;

export type BookingDomainEventConsumerId =
  (typeof BOOKING_DOMAIN_EVENT_CONSUMER_IDS)[keyof typeof BOOKING_DOMAIN_EVENT_CONSUMER_IDS];

export const BOOKING_DOMAIN_EVENT_ALL_CONSUMER_IDS = [
  BOOKING_DOMAIN_EVENT_CONSUMER_IDS.INVOICE,
  BOOKING_DOMAIN_EVENT_CONSUMER_IDS.DOCUMENT_BUNDLE,
  BOOKING_DOMAIN_EVENT_CONSUMER_IDS.RENTAL_AGREEMENT,
  BOOKING_DOMAIN_EVENT_CONSUMER_IDS.PICKUP_RETURN_TASKS,
  BOOKING_DOMAIN_EVENT_CONSUMER_IDS.NOTIFICATIONS,
  BOOKING_DOMAIN_EVENT_CONSUMER_IDS.CUSTOMER_EMAIL,
  BOOKING_DOMAIN_EVENT_CONSUMER_IDS.INTERNAL_EMAIL,
  BOOKING_DOMAIN_EVENT_CONSUMER_IDS.PAYMENT_LINK,
] as const;

export const BOOKING_DOMAIN_EVENT_CONSUMER_RECEIPT_TERMINAL_STATUSES = new Set([
  'SUCCEEDED',
  'SKIPPED',
  'STALE',
  'FAILED',
] as const);

export function buildBookingDomainEventConsumerBusinessKey(
  consumerId: string,
  parts: string[],
): string {
  return [consumerId, ...parts.filter(Boolean)].join(':');
}
