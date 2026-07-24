import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type AuthorizationDecisionAuditItem } from '../../lib/api';

export interface AuditDecisionsListResult {
  items: AuthorizationDecisionAuditItem[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
}

export function useAuditDecisionsList(input: {
  orgId: string | null;
  enabled?: boolean;
  limit?: number;
}): AuditDecisionsListResult {
  const [items, setItems] = useState<AuthorizationDecisionAuditItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  const fetchPage = useCallback(
    async (mode: 'replace' | 'append') => {
      if (!input.orgId || input.enabled === false) return;
      const currentRequest = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const cursor = mode === 'append' ? nextCursorRef.current : null;
        const res = await api.dataProcessing.audit.authorizationDecisions(input.orgId, {
          limit: input.limit ?? 25,
          cursor: cursor ?? undefined,
        });
        if (currentRequest !== requestId.current) return;
        const page = res.items ?? [];
        setItems((prev) => (mode === 'append' ? [...prev, ...page] : page));
        setNextCursor(res.nextCursor ?? null);
      } catch (e) {
        if (currentRequest !== requestId.current) return;
        setError(e instanceof Error ? e.message : 'Load failed');
        if (mode === 'replace') setItems([]);
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    },
    [input.enabled, input.limit, input.orgId],
  );

  useEffect(() => {
    void fetchPage('replace');
  }, [fetchPage]);

  return {
    items,
    nextCursor,
    loading,
    error,
    reload: () => fetchPage('replace'),
    loadMore: () => fetchPage('append'),
  };
}
