import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type {
  BillingOverviewOperationalDto,
  BillingSubscriptionsQuery,
  PaginatedBillingSubscriptionsResponse,
} from './types';
import { readBillingListStateFromUrl, writeBillingListStateToUrl } from './billing.utils';

function urlToQuery(state: Record<string, string>): BillingSubscriptionsQuery {
  return {
    page: state.billingPage ? Number(state.billingPage) : 1,
    limit: 25,
    search: state.billingSearch,
    domainStatus: state.billingDomainStatus,
    billingHealth: state.billingHealth as BillingSubscriptionsQuery['billingHealth'],
    reconciliationHealth: state.billingReconciliation as BillingSubscriptionsQuery['reconciliationHealth'],
    trialState: state.billingTrial as BillingSubscriptionsQuery['trialState'],
    attention: state.billingAttention as BillingSubscriptionsQuery['attention'],
    productKey: state.billingProduct,
    sort: (state.billingSort as BillingSubscriptionsQuery['sort']) ?? 'attention',
    sortDir: (state.billingSortDir as BillingSubscriptionsQuery['sortDir']) ?? 'desc',
  };
}

function queryToUrlState(query: BillingSubscriptionsQuery): Record<string, string | undefined> {
  return {
    billingPage: query.page && query.page > 1 ? String(query.page) : undefined,
    billingSearch: query.search,
    billingDomainStatus: query.domainStatus,
    billingHealth: query.billingHealth,
    billingReconciliation: query.reconciliationHealth,
    billingTrial: query.trialState,
    billingAttention: query.attention,
    billingProduct: query.productKey,
    billingSort: query.sort,
    billingSortDir: query.sortDir,
  };
}

export function useBillingOverviewOperational() {
  const [overview, setOverview] = useState<BillingOverviewOperationalDto | null>(null);
  const [attention, setAttention] = useState<PaginatedBillingSubscriptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, attentionRes] = await Promise.all([
        api.billing.overviewOperational(),
        api.billing.attentionQueue({ page: 1, limit: 25, attention: 'yes', sort: 'attention' }),
      ]);
      setOverview(overviewRes);
      setAttention(attentionRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Billing-Übersicht konnte nicht geladen werden');
      setOverview(null);
      setAttention(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { overview, attention, loading, error, refresh: load };
}

export function useBillingSubscriptionsOperational() {
  const [query, setQueryState] = useState<BillingSubscriptionsQuery>(() =>
    urlToQuery(readBillingListStateFromUrl()),
  );
  const [data, setData] = useState<PaginatedBillingSubscriptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setQuery = useCallback((next: BillingSubscriptionsQuery, replace = false) => {
    setQueryState(next);
    writeBillingListStateToUrl(queryToUrlState(next), replace);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.billing.subscriptionsOperational(
        query as Record<string, string | number | undefined>,
      );
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verträge konnten nicht geladen werden');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onPop = () => setQueryState(urlToQuery(readBillingListStateFromUrl()));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return { data, loading, error, query, setQuery, refresh: load };
}

export function useBillingSubscriptionDetail(organizationId: string | null) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof api.billing.subscriptionOperationalDetail>> | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.billing.subscriptionOperationalDetail(organizationId);
      setDetail(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Vertragsdetail konnte nicht geladen werden');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { detail, loading, error, refresh: load };
}
