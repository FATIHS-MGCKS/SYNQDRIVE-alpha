import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type {
  OrganizationsOperationalQuery,
  OrganizationOperationalDetailDto,
  PaginatedOperationalResponse,
} from './types';
import { readOrgListStateFromUrl, writeOrgListStateToUrl } from './org.utils';

function urlToQuery(state: Record<string, string>): OrganizationsOperationalQuery {
  return {
    page: state.orgPage ? Number(state.orgPage) : 1,
    limit: 25,
    search: state.orgSearch,
    orgStatus: state.orgStatus,
    subscriptionStatus: state.orgSubStatus,
    attention: state.orgAttention as OrganizationsOperationalQuery['attention'],
    billingHealth: state.orgBillingHealth as OrganizationsOperationalQuery['billingHealth'],
    connectivity: state.orgConnectivity as OrganizationsOperationalQuery['connectivity'],
    syncStatus: state.orgSyncStatus as OrganizationsOperationalQuery['syncStatus'],
    businessType: state.orgBusinessType,
    paymentMethod: state.orgPaymentMethod as OrganizationsOperationalQuery['paymentMethod'],
  };
}

function queryToUrlState(
  query: OrganizationsOperationalQuery,
): Record<string, string | undefined> {
  return {
    orgPage: query.page && query.page > 1 ? String(query.page) : undefined,
    orgSearch: query.search,
    orgStatus: query.orgStatus,
    orgSubStatus: query.subscriptionStatus,
    orgAttention: query.attention,
    orgBillingHealth: query.billingHealth,
    orgConnectivity: query.connectivity,
    orgSyncStatus: query.syncStatus,
    orgBusinessType: query.businessType,
    orgPaymentMethod: query.paymentMethod,
  };
}

export function useOrganizationsOperational() {
  const [query, setQueryState] = useState<OrganizationsOperationalQuery>(() =>
    urlToQuery(readOrgListStateFromUrl()),
  );
  const [data, setData] = useState<PaginatedOperationalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setQuery = useCallback((next: OrganizationsOperationalQuery, replace = false) => {
    setQueryState(next);
    writeOrgListStateToUrl(queryToUrlState(next), replace);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.organizations.listOperational(query as Record<string, string | number | undefined>);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Organisationen konnten nicht geladen werden');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onPop = () => setQueryState(urlToQuery(readOrgListStateFromUrl()));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return { data, loading, error, query, setQuery, refresh: load };
}

export function useOrganizationDetail(orgId: string | null) {
  const [detail, setDetail] = useState<OrganizationOperationalDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.organizations.getOperational(orgId);
      setDetail(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Organisation konnte nicht geladen werden');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { detail, loading, error, refresh: load };
}
