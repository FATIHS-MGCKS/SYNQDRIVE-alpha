import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  type StationOrgSummariesQueryParams,
  type StationOrgSummariesReadModel,
} from '../../lib/api';
import {
  buildLoadedStationOrgSummaries,
  fetchAllStationOrgSummaries,
  type StationOrgSummariesLoaded,
  type StationSummariesViewFilters,
} from '../lib/station-org-summaries.utils';

export interface UseStationOrgSummariesInput {
  orgId: string | undefined;
  enabled?: boolean;
  queryParams: StationOrgSummariesQueryParams;
  clientFilters: StationSummariesViewFilters;
}

export interface UseStationOrgSummariesResult {
  data: StationOrgSummariesLoaded | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  invalidate: () => void;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === 'AbortError'
  );
}

function mapLoadError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Failed to load station summaries';
}

export function useStationOrgSummaries(
  input: UseStationOrgSummariesInput,
): UseStationOrgSummariesResult {
  const { orgId, enabled = true, queryParams, clientFilters } = input;
  const [rawModel, setRawModel] = useState<StationOrgSummariesReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const rawModelRef = useRef<StationOrgSummariesReadModel | null>(null);
  const queryKeyRef = useRef('');

  const queryKey = JSON.stringify({ orgId, queryParams });

  const data = useMemo(() => {
    if (!rawModel) return null;
    return buildLoadedStationOrgSummaries(rawModel, clientFilters);
  }, [clientFilters, rawModel]);

  const reload = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    if (!orgId) {
      abortRef.current?.abort();
      rawModelRef.current = null;
      setRawModel(null);
      setError('Organization is missing');
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    if (rawModelRef.current === null) {
      setLoading(true);
    }
    setError(null);

    try {
      const model = await fetchAllStationOrgSummaries(orgId, queryParams, (page, pageSize) =>
        api.stations.summaries(orgId, { ...queryParams, page, pageSize }),
      );

      if (controller.signal.aborted || requestId !== requestIdRef.current) {
        return;
      }

      rawModelRef.current = model;
      setRawModel(model);
    } catch (err) {
      if (isAbortError(err) || requestId !== requestIdRef.current) return;
      rawModelRef.current = null;
      setRawModel(null);
      setError(mapLoadError(err));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, orgId, queryParams]);

  const invalidate = useCallback(() => {
    rawModelRef.current = null;
    setRawModel(null);
    setLoading(true);
  }, []);

  useEffect(() => {
    if (queryKeyRef.current !== queryKey) {
      queryKeyRef.current = queryKey;
      rawModelRef.current = null;
      setRawModel(null);
      setLoading(true);
    }

    void reload();
    return () => {
      abortRef.current?.abort();
    };
  }, [queryKey, reload]);

  return { data, loading, error, reload, invalidate };
}

export function selectStationOrgKpis(model: StationOrgSummariesReadModel | null | undefined) {
  if (!model) {
    return {
      active: 0,
      homeFleet: '—' as const,
      onSite: '—' as const,
      todayPickups: '—' as const,
      todayReturns: '—' as const,
      operationalWarnings: 0,
      configurationProblems: 0,
    };
  }

  const { globalKpis, warningCounts } = model;
  return {
    active: globalKpis.stationCount,
    homeFleet: globalKpis.homeFleetCount,
    onSite: globalKpis.currentOnSiteCount,
    todayPickups: globalKpis.pickupsToday,
    todayReturns: globalKpis.returnsToday,
    operationalWarnings: warningCounts.stationsWithOperationalWarnings,
    configurationProblems: warningCounts.stationsWithConfigurationProblems,
  };
}
