import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type {
  PlatformIntegrationDetailDto,
  PlatformIntegrationsAttentionSummaryDto,
  PlatformIntegrationsDirectoryDto,
  PlatformIntegrationWebhooksDto,
  PlatformIntegrationsFlagsDto,
} from './types';
import { PLATFORM_INTEGRATIONS_REFRESH_MS } from './platform-integrations.utils';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function useAsyncResource<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loader();
      setData(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), PLATFORM_INTEGRATIONS_REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, loading, error, refresh };
}

export function usePlatformIntegrationsDirectory() {
  return useAsyncResource<PlatformIntegrationsDirectoryDto>(() =>
    api.admin.platformIntegrations.directory(),
  );
}

export function usePlatformIntegrationsAttention() {
  return useAsyncResource<PlatformIntegrationsAttentionSummaryDto>(() =>
    api.admin.platformIntegrations.attentionSummary(),
  );
}

export function usePlatformIntegrationsWebhooks() {
  return useAsyncResource<PlatformIntegrationWebhooksDto>(() =>
    api.admin.platformIntegrations.webhooks(),
  );
}

export function usePlatformIntegrationsFlags() {
  return useAsyncResource<PlatformIntegrationsFlagsDto>(() => api.admin.platformIntegrations.flags());
}

export function usePlatformIntegrationDetail(integrationId: string | null) {
  const [data, setData] = useState<PlatformIntegrationDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!integrationId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.admin.platformIntegrations.detail(integrationId);
      setData(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [integrationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
