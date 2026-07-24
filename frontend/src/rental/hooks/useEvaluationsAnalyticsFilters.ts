import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EvaluationsAnalyticsFiltersQuery } from '@synq/evaluations-insights/evaluations-analytics-filters.contract';
import {
  parseFiltersFromSearchParams,
  serializeFiltersToSearchParams,
} from '@synq/evaluations-insights/evaluations-analytics-filters';
import {
  readPersistedDashboardStationId,
  persistDashboardStationId,
} from '../lib/fleet-station-filter';

export interface UseEvaluationsAnalyticsFiltersResult {
  filters: EvaluationsAnalyticsFiltersQuery;
  filterKey: string;
  setFilters: (next: EvaluationsAnalyticsFiltersQuery) => void;
  patchFilters: (patch: Partial<EvaluationsAnalyticsFiltersQuery>) => void;
  resetFilters: () => void;
}

const DEFAULT_FILTERS: EvaluationsAnalyticsFiltersQuery = {
  period: 'mtd',
  comparison: 'auto',
  currency: 'EUR',
};

function readFiltersFromLocation(): EvaluationsAnalyticsFiltersQuery {
  if (typeof window === 'undefined') return { ...DEFAULT_FILTERS };
  const fromUrl = parseFiltersFromSearchParams(new URLSearchParams(window.location.search));
  const stationFromStorage = readPersistedDashboardStationId();
  return {
    ...DEFAULT_FILTERS,
    stationId: fromUrl.stationId ?? stationFromStorage,
    ...fromUrl,
  };
}

function writeFiltersToLocation(filters: EvaluationsAnalyticsFiltersQuery): void {
  if (typeof window === 'undefined') return;
  const params = serializeFiltersToSearchParams(filters);
  const query = params.toString();
  const next = query
    ? `${window.location.pathname}?${query}${window.location.hash}`
    : `${window.location.pathname}${window.location.hash}`;
  window.history.replaceState(null, '', next);
}

function stableFilterKey(filters: EvaluationsAnalyticsFiltersQuery): string {
  return serializeFiltersToSearchParams(filters).toString();
}

export function useEvaluationsAnalyticsFilters(): UseEvaluationsAnalyticsFiltersResult {
  const [filters, setFiltersState] = useState<EvaluationsAnalyticsFiltersQuery>(readFiltersFromLocation);

  const filterKey = useMemo(() => stableFilterKey(filters), [filters]);

  const setFilters = useCallback((next: EvaluationsAnalyticsFiltersQuery) => {
    setFiltersState(next);
    if (next.stationId) persistDashboardStationId(next.stationId);
    else persistDashboardStationId(null);
    writeFiltersToLocation(next);
  }, []);

  const patchFilters = useCallback(
    (patch: Partial<EvaluationsAnalyticsFiltersQuery>) => {
      setFilters({ ...filters, ...patch });
    },
    [filters, setFilters],
  );

  const resetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS });
  }, [setFilters]);

  useEffect(() => {
    const onPopState = () => setFiltersState(readFiltersFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return { filters, filterKey, setFilters, patchFilters, resetFilters };
}
