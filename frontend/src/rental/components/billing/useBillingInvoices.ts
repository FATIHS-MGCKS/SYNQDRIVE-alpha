import { useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import {
  billingQueryKeys,
  parseBillingPaginated,
  serializeBillingQueryKey,
} from './billing-query.utils';
import type { BillingInvoiceDto } from '../../types/billing.types';
import { useBillingQuery } from './useBillingQuery';

export interface BillingInvoicesQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  from?: string;
  to?: string;
  sort?: string;
}

const DEFAULT_QUERY: BillingInvoicesQuery = {
  page: 1,
  pageSize: 20,
  sort: '-invoiceDate',
};

export function useBillingInvoices(orgId: string | undefined, initialQuery: BillingInvoicesQuery = {}) {
  const [query, setQuery] = useState<BillingInvoicesQuery>({
    ...DEFAULT_QUERY,
    ...initialQuery,
  });

  const queryKey = serializeBillingQueryKey(query);

  const result = useBillingQuery({
    orgId,
    deps: [billingQueryKeys.invoices(orgId ?? '', queryKey)],
    fetcher: async (signal) => {
      const payload = await api.billing.orgInvoices(orgId, query, { signal });
      return parseBillingPaginated<BillingInvoiceDto>(payload);
    },
  });

  return useMemo(
    () => ({
      ...result,
      query,
      setQuery,
      invoices: result.data?.data ?? [],
      meta: result.data?.meta ?? null,
    }),
    [query, result],
  );
}
