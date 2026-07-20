import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import {
  matchesServiceCaseListInvalidation,
  subscribeServiceCaseQueryInvalidation,
} from '../invalidate';
import { serviceCaseQueryKeys } from '../query-keys';
import {
  mergeServiceCaseListPages,
  replaceServiceCaseListFirstPage,
} from '../serviceCaseListPagination.utils';
import type { ApiServiceCaseListItem, ServiceCaseListFilters } from '../types';

const DEFAULT_PAGE_SIZE = 50;

export interface UseServiceCaseListOptions {
  orgId: string | null | undefined;
  filters?: Omit<ServiceCaseListFilters, 'limit' | 'cursor'>;
  enabled?: boolean;
  paginated?: boolean;
  pageSize?: number;
}

export interface UseServiceCaseListResult {
  queryKey: ReturnType<typeof serviceCaseQueryKeys.list>;
  serviceCases: ApiServiceCaseListItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMoreError: string | null;
  hasMore: boolean;
  isStale: boolean;
  reload: () => Promise<ApiServiceCaseListItem[]>;
  loadMore: () => Promise<ApiServiceCaseListItem[]>;
}

export function useServiceCaseList({
  orgId,
  filters,
  enabled = true,
  paginated = true,
  pageSize = DEFAULT_PAGE_SIZE,
}: UseServiceCaseListOptions): UseServiceCaseListResult {
  const [serviceCases, setServiceCases] = useState<ApiServiceCaseListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const rowsRef = useRef<ApiServiceCaseListItem[]>([]);
  const nextCursorRef = useRef<string | null>(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    rowsRef.current = serviceCases;
  }, [serviceCases]);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  const queryKey = serviceCaseQueryKeys.list(orgId ?? '', filters);

  const buildRequestFilters = useCallback((): ServiceCaseListFilters => {
    return { ...filtersRef.current };
  }, []);

  const reload = useCallback(async (): Promise<ApiServiceCaseListItem[]> => {
    if (!orgId || !enabled) {
      setServiceCases([]);
      setError(null);
      setLoadMoreError(null);
      setNextCursor(null);
      return [];
    }

    setLoading(true);
    setError(null);
    setLoadMoreError(null);

    try {
      if (!paginated) {
        const rows = await api.serviceCases.list(orgId, buildRequestFilters());
        const list = Array.isArray(rows) ? rows : [];
        setServiceCases(list);
        setNextCursor(null);
        return list;
      }

      const page = await api.serviceCases.listPage(orgId, {
        ...buildRequestFilters(),
        limit: pageSize,
      });
      const list = replaceServiceCaseListFirstPage(rowsRef.current, page.data);
      setServiceCases(list);
      setNextCursor(page.meta.nextCursor);
      return list;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Servicefälle konnten nicht geladen werden';
      setError(message);
      if (rowsRef.current.length === 0) {
        setServiceCases([]);
        return [];
      }
      return rowsRef.current;
    } finally {
      setLoading(false);
    }
  }, [orgId, enabled, paginated, pageSize, buildRequestFilters]);

  const loadMore = useCallback(async (): Promise<ApiServiceCaseListItem[]> => {
    if (!orgId || !enabled || !paginated) return rowsRef.current;
    const cursor = nextCursorRef.current;
    if (!cursor || loadingMore) return rowsRef.current;

    setLoadingMore(true);
    setLoadMoreError(null);

    try {
      const page = await api.serviceCases.listPage(orgId, {
        ...buildRequestFilters(),
        limit: pageSize,
        cursor,
      });
      const merged = mergeServiceCaseListPages(rowsRef.current, page.data);
      setServiceCases(merged);
      setNextCursor(page.meta.nextCursor);
      return merged;
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Weitere Servicefälle konnten nicht geladen werden';
      setLoadMoreError(message);
      return rowsRef.current;
    } finally {
      setLoadingMore(false);
    }
  }, [orgId, enabled, paginated, pageSize, loadingMore, buildRequestFilters]);

  useEffect(() => {
    void reload();
  }, [reload, queryKey.join('|')]);

  useEffect(() => {
    return subscribeServiceCaseQueryInvalidation((detail) => {
      if (!matchesServiceCaseListInvalidation(detail, orgId)) return;
      void reload();
    });
  }, [orgId, reload]);

  return {
    queryKey,
    serviceCases,
    loading,
    loadingMore,
    error,
    loadMoreError,
    hasMore: paginated && Boolean(nextCursor),
    isStale: Boolean(error) && serviceCases.length > 0,
    reload,
    loadMore,
  };
}
