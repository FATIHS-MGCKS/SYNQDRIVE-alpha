import { useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import {
  billingQueryKeys,
  parseBillingPaginated,
  serializeBillingQueryKey,
} from './billing-query.utils';
import { useBillingQuery } from './useBillingQuery';

export interface BillingPaymentHistoryItem {
  id: string;
  invoiceId: string;
  invoiceNumberLabel: string;
  amount: { cents: number; currency: string; formatted: string };
  status: string;
  statusLabel: string;
  providerLabel: string;
  succeededAt: string | null;
  failedAt: string | null;
}

export interface BillingPaymentHistoryQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  from?: string;
  to?: string;
  sort?: string;
  [key: string]: string | number | undefined;
}

const DEFAULT_QUERY: BillingPaymentHistoryQuery = {
  page: 1,
  pageSize: 20,
  sort: '-succeededAt',
};

export function useBillingPaymentHistory(
  orgId: string | undefined,
  initialQuery: BillingPaymentHistoryQuery = {},
) {
  const [query, setQuery] = useState<BillingPaymentHistoryQuery>({
    ...DEFAULT_QUERY,
    ...initialQuery,
  });
  const queryKey = serializeBillingQueryKey(query);

  const result = useBillingQuery({
    orgId,
    deps: [billingQueryKeys.paymentHistory(orgId ?? '', queryKey)],
    fetcher: async (signal) => {
      const payload = await api.billing.orgPayments(orgId, query, { signal });
      return parseBillingPaginated<BillingPaymentHistoryItem>(payload);
    },
  });

  return useMemo(
    () => ({
      ...result,
      query,
      setQuery,
      payments: result.data?.data ?? [],
      meta: result.data?.meta ?? null,
    }),
    [query, result],
  );
}
