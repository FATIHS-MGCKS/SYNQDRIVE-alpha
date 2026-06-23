import { BillingControlCenter } from './billing/BillingControlCenter';

export interface SubscriptionsViewProps {
  /** @deprecated Theme is token-driven via CSS variables — prop kept for App.tsx compat. */
  isDarkMode?: boolean;
}

/** Master Admin billing hub — pricebook-driven control center. */
export function SubscriptionsView(props: SubscriptionsViewProps) {
  return <BillingControlCenter {...props} />;
}
