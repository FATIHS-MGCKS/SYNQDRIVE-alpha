import { api } from '../../../lib/api';
import { billingQueryKeys } from './billing-query.utils';
import { useBillingQuery } from './useBillingQuery';
import type { TenantPaymentMethodsDto } from '../../types/billing.types';

export function useBillingPaymentMethods(orgId: string | undefined) {
  return useBillingQuery<TenantPaymentMethodsDto>({
    orgId,
    deps: [billingQueryKeys.paymentMethods(orgId ?? '')],
    fetcher: (signal) => api.billing.orgPaymentMethods(orgId, { signal }),
  });
}
