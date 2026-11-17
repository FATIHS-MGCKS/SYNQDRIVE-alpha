import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type {
  CoreAppServiceClientCreatedDto,
  CoreAppServiceClientListDto,
  CoreAppServiceClientSummary,
  CoreAppServiceOrgGrantListDto,
} from './types';

export type DataRefreshOptions = {
  /** When true, rejects on the active request failure (stale in-flight failures are ignored). */
  throwOnFailure?: boolean;
};

export function useCoreAppServiceClients() {
  const [items, setItems] = useState<CoreAppServiceClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const refresh = useCallback(async (options?: DataRefreshOptions) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      const list = (await api.admin.coreAppServiceClients.list()) as CoreAppServiceClientListDto;
      if (seq !== loadSeq.current) return;
      setItems(list.items);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      if (options?.throwOnFailure) {
        throw e;
      }
      setError((e as Error).message);
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, loading, error, refresh };
}

export function useCoreAppServiceOrgGrants(serviceClientId: string | null) {
  const [grants, setGrants] = useState<CoreAppServiceOrgGrantListDto['items']>([]);
  const [loadedForClientId, setLoadedForClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSeq = useRef(0);
  const activeClientIdRef = useRef(serviceClientId);
  activeClientIdRef.current = serviceClientId;

  const refresh = useCallback(
    async (options?: DataRefreshOptions) => {
      if (!serviceClientId) {
        loadSeq.current += 1;
        setGrants([]);
        setLoadedForClientId(null);
        setLoading(false);
        setError(null);
        return;
      }
      const clientAtStart = serviceClientId;
      const seq = ++loadSeq.current;
      setGrants([]);
      setLoadedForClientId(null);
      setLoading(true);
      setError(null);
      try {
        const list = (await api.admin.coreAppServiceClients.listOrgGrants(
          serviceClientId,
        )) as CoreAppServiceOrgGrantListDto;
        if (seq !== loadSeq.current || clientAtStart !== activeClientIdRef.current) return;
        setGrants(list.items);
        setLoadedForClientId(serviceClientId);
      } catch (e) {
        if (seq !== loadSeq.current || clientAtStart !== activeClientIdRef.current) return;
        if (options?.throwOnFailure) {
          throw e;
        }
        setError((e as Error).message);
        setLoadedForClientId(null);
      } finally {
        if (seq === loadSeq.current) {
          setLoading(false);
        }
      }
    },
    [serviceClientId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { grants, loading, error, refresh, loadedForClientId };
}

export async function createCoreAppServiceClient(payload: {
  clientId: string;
  displayName: string;
  productSlug: string;
  allowedScopes: string[];
}): Promise<CoreAppServiceClientCreatedDto> {
  return api.admin.coreAppServiceClients.create(payload) as Promise<CoreAppServiceClientCreatedDto>;
}