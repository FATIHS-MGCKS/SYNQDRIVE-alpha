import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DataProcessingSectionFilterState } from './data-processing-list-state';
import {
  DEFAULT_SECTION_FILTERS,
  kpiToLegacyParams,
  kpiToRegisterParams,
  syncDataProcessingFiltersToUrl,
} from './data-processing-list-state';

export interface PaginatedListResult<T> {
  items: T[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
  filters: DataProcessingSectionFilterState;
  setFilters: (patch: Partial<DataProcessingSectionFilterState>) => void;
  resetFilters: () => void;
}

type Fetcher<T> = (
  orgId: string,
  filters: DataProcessingSectionFilterState,
) => Promise<{ items: T[]; nextCursor: string | null }>;

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function useDataProcessingSectionList<T>(input: {
  orgId: string | null;
  enabled?: boolean;
  initialFilters?: Partial<DataProcessingSectionFilterState>;
  syncUrl?: boolean;
  fetchPage: Fetcher<T>;
}): PaginatedListResult<T> {
  const [filters, setFiltersState] = useState<DataProcessingSectionFilterState>({
    ...DEFAULT_SECTION_FILTERS,
    ...input.initialFilters,
  });
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedQ = useDebouncedValue(filters.q);
  const requestId = useRef(0);
  const nextCursorRef = useRef<string | null>(null);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  const effectiveFilters = useMemo(
    () => ({ ...filters, q: debouncedQ }),
    [filters, debouncedQ],
  );

  const setFilters = useCallback((patch: Partial<DataProcessingSectionFilterState>) => {
    setFiltersState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.kpi != null || patch.status || patch.riskLevel || patch.dataCategory || patch.q != null) {
        next.cursor = null;
      }
      if (input.syncUrl) syncDataProcessingFiltersToUrl(next);
      return next;
    });
  }, [input.syncUrl]);

  const resetFilters = useCallback(() => {
    const next = { ...DEFAULT_SECTION_FILTERS, ...input.initialFilters };
    setFiltersState(next);
    if (input.syncUrl) syncDataProcessingFiltersToUrl(next);
  }, [input.initialFilters, input.syncUrl]);

  const fetchList = useCallback(
    async (mode: 'replace' | 'append') => {
      if (!input.orgId || input.enabled === false) return;
      const currentRequest = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const pageFilters =
          mode === 'append' && nextCursorRef.current
            ? { ...effectiveFilters, cursor: nextCursorRef.current }
            : { ...effectiveFilters, cursor: null };
        const result = await input.fetchPage(input.orgId, pageFilters);
        if (currentRequest !== requestId.current) return;
        setItems((prev) => (mode === 'append' ? [...prev, ...result.items] : result.items));
        setNextCursor(result.nextCursor);
      } catch (e) {
        if (currentRequest !== requestId.current) return;
        setError(e instanceof Error ? e.message : 'Load failed');
        if (mode === 'replace') setItems([]);
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    },
    [effectiveFilters, input],
  );

  useEffect(() => {
    void fetchList('replace');
  }, [effectiveFilters, input.orgId, input.enabled]);

  return {
    items,
    nextCursor,
    loading,
    error,
    reload: () => fetchList('replace'),
    loadMore: () => fetchList('append'),
    filters,
    setFilters,
    resetFilters,
  };
}

export function buildRegisterFetcher() {
  return async (orgId: string, filters: DataProcessingSectionFilterState) => {
    const { api } = await import('../../lib/api');
    const kpiParams = kpiToRegisterParams(filters.kpi);
    const res = await api.dataProcessing.register.list(orgId, {
      q: filters.q || undefined,
      status: filters.status || undefined,
      limit: filters.limit,
      cursor: filters.cursor ?? undefined,
      sort: filters.sort,
      dir: filters.dir,
      ...kpiParams,
    });
    return { items: res.data ?? [], nextCursor: res.meta?.nextCursor ?? null };
  };
}

export function buildLegacyFetcher(extra?: Record<string, string | boolean>) {
  return async (orgId: string, filters: DataProcessingSectionFilterState) => {
    const { api } = await import('../../lib/api');
    const kpiParams = kpiToLegacyParams(filters.kpi);
    const res = await api.dataAuthorizations.list(orgId, {
      q: filters.q || undefined,
      status: filters.status || undefined,
      riskLevel: filters.riskLevel || undefined,
      dataCategory: filters.dataCategory || undefined,
      limit: filters.limit,
      cursor: filters.cursor ?? undefined,
      sort: filters.sort as 'createdAt' | 'title' | 'expiresAt',
      dir: filters.dir,
      ...kpiParams,
      ...extra,
    });
    return { items: res.data ?? [], nextCursor: res.meta?.nextCursor ?? null };
  };
}
