import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type {
  PlatformOpsOverviewDto,
  PlatformOpsIncidentDto,
  PlatformOpsResilienceDto,
  PlatformOpsServiceDetailDto,
} from './types';
import { PLATFORM_OPS_REFRESH_MS, PLATFORM_OPS_STALE_MS } from './platform-ops.utils';

export function usePlatformOpsOverview() {
  const [data, setData] = useState<PlatformOpsOverviewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.platformOps.overview();
      setData(res);
      setFetchedAt(Date.now());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Plattform-Ops konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), PLATFORM_OPS_REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const isStale = fetchedAt != null && Date.now() - fetchedAt > PLATFORM_OPS_STALE_MS;

  return { data, loading, error, isStale, refresh: load };
}

export function usePlatformOpsIncidents(page = 1) {
  const [incidents, setIncidents] = useState<PlatformOpsIncidentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.platformOps.incidents({ page, limit: 25 });
      setIncidents(res.incidents);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Vorfälle konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  return { incidents, loading, error, refresh: load };
}

export function usePlatformOpsIncidentDetail(incidentId: string | null) {
  const [incident, setIncident] = useState<PlatformOpsIncidentDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!incidentId) {
      setIncident(null);
      return;
    }
    setLoading(true);
    void api.admin.platformOps
      .incident(incidentId)
      .then(setIncident)
      .catch(() => setIncident(null))
      .finally(() => setLoading(false));
  }, [incidentId]);

  return { incident, loading };
}

export function usePlatformOpsTabData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher();
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Daten konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), PLATFORM_OPS_REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  return { data, loading, error, refresh: load };
}

export function usePlatformOpsServiceDetail(serviceId: string | null) {
  const [detail, setDetail] = useState<PlatformOpsServiceDetailDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!serviceId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    void api.admin.platformOps
      .service(serviceId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [serviceId]);

  return { detail, loading };
}

export function usePlatformOpsResilience() {
  return usePlatformOpsTabData<PlatformOpsResilienceDto>(() => api.admin.platformOps.resilience(), []);
}
