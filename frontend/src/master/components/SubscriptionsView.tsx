/**
 * @deprecated Master Admin billing lives in `BillingControlCenter`.
 * This module re-exports it for backward-compatible imports only.
 */
export {
  BillingControlCenter as SubscriptionsView,
  type BillingControlCenterProps as SubscriptionsViewProps,
} from './billing/BillingControlCenter';
