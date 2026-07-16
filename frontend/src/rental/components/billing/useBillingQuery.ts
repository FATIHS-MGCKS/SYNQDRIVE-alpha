import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BILLING_ORG_MISSING_MESSAGE,
  mapBillingLoadError,
} from './billing-load.utils';
import { BillingQueryResult, isAbortError, mapBillingQueryError } from './billing-query.utils';

export function useBillingQuery<T>(input: {
  orgId: string | undefined;
  enabled?: boolean;
  deps: unknown[];
  fetcher: (signal: AbortSignal) => Promise<T>;
}): BillingQueryResult<T> {
  const { orgId, enabled = true, deps, fetcher } = input;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  const dataRef = useRef<T | null>(null);
  const orgIdRef = useRef(orgId);

  fetcherRef.current = fetcher;
  dataRef.current = data;

  const reload = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    if (!orgId) {
      abortRef.current?.abort();
      setData(null);
      dataRef.current = null;
      setError(BILLING_ORG_MISSING_MESSAGE);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    if (dataRef.current === null) {
      setLoading(true);
    }
    setError(null);

    try {
      const result = await fetcherRef.current(controller.signal);
      if (requestId !== requestIdRef.current) return;
      dataRef.current = result;
      setData(result);
    } catch (err) {
      if (isAbortError(err) || requestId !== requestIdRef.current) return;
      dataRef.current = null;
      setData(null);
      setError(mapBillingQueryError(err));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, orgId]);

  useEffect(() => {
    if (orgIdRef.current !== orgId) {
      orgIdRef.current = orgId;
      dataRef.current = null;
      setData(null);
      setLoading(true);
    }

    void reload();
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, orgId, enabled, ...deps]);

  return { data, loading, error, reload };
}

export function useBillingOrgGuard(orgId: string | undefined) {
  return {
    missingOrgError: orgId ? null : BILLING_ORG_MISSING_MESSAGE,
    mapError: mapBillingLoadError,
  };
}
