import { useMemo } from 'react';
import { api } from '../../../lib/api';
import { billingQueryKeys } from './billing-query.utils';
import { mapOverviewToSummaryShape } from './billing-overview.adapter';
import type { BillingSummaryDto, TenantSubscriptionOverviewDto } from '../../types/billing.types';
import { useBillingQuery } from './useBillingQuery';

export function useBillingSubscriptionOverview(orgId: string | undefined) {
  const query = useBillingQuery({
    orgId,
    deps: [billingQueryKeys.subscriptionOverview(orgId ?? '')],
    fetcher: (signal) => api.billing.orgSubscriptionOverview(orgId, { signal }),
  });

  const summary = useMemo(
    () =>
      query.data && orgId
        ? mapOverviewToSummaryShape(query.data, orgId)
        : null,
    [query.data, orgId],
  );

  return {
    overview: query.data as TenantSubscriptionOverviewDto | null,
    summary: summary as BillingSummaryDto | null,
    loading: query.loading,
    error: query.error,
    reload: query.reload,
  };
}
