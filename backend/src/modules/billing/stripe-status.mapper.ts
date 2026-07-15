/**
 * @deprecated Import from `./domain` or specific domain mappers instead.
 * Thin compatibility re-exports — implementation lives in domain/mappers.
 */
export {
  mapStripeSubscriptionStatus,
  type MappedStripeSubscriptionStatus,
  type StripeBillingDisplayState,
} from './domain/mappers/stripe-subscription-status.mapper';

export { mapStripeInvoiceStatus } from './domain/mappers/stripe-invoice-status.mapper';
