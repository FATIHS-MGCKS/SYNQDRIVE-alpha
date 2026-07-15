import { api } from '../../../lib/api';
import { billingQueryKeys } from './billing-query.utils';
import { useBillingQuery } from './useBillingQuery';

export interface TenantPaymentMethodsDto {
  configured: boolean;
  defaultMethodId: string | null;
  paymentMethods: Array<{
    id: string;
    type: string;
    typeLabel: string;
    brand: string | null;
    last4: string | null;
    isDefault: boolean;
    statusLabel: string;
    billingState: string;
  }>;
}

export function useBillingPaymentMethods(orgId: string | undefined) {
  return useBillingQuery<TenantPaymentMethodsDto>({
    orgId,
    deps: [billingQueryKeys.paymentMethods(orgId ?? '')],
    fetcher: (signal) => api.billing.orgPaymentMethods(orgId, { signal }),
  });
}
