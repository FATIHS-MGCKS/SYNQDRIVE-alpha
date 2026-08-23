import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  communicationClient,
  CommunicationClientError,
  type CommunicationClientErrorCode,
} from '../communication-client';
import type {
  CommunicationAiActivityItem,
  CommunicationAiActivityListQuery,
} from '../types';

export const COMMUNICATION_AI_ACTIVITY_PAGE_SIZE = 40;

export type CommunicationAiActivityFilterCategory = 'all' | 'handoffs' | 'tools' | 'errors';

export interface UseCommunicationAiActivityOptions {
  orgId: string | null | undefined;
  category?: CommunicationAiActivityFilterCategory;
  channel?: CommunicationAiActivityListQuery['channel'];
  enabled?: boolean;
}

export interface UseCommunicationAiActivityResult {
  items: CommunicationAiActivityItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: CommunicationClientErrorCode | null;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
}

function querySignature(
  orgId: string,
  category: CommunicationAiActivityFilterCategory,
  channel?: CommunicationAiActivityListQuery['channel'],
): string {
  return `${orgId}|${category}|${channel ?? 'all'}`;
}

export function useCommunicationAiActivity(
  options: UseCommunicationAiActivityOptions,
): UseCommunicationAiActivityResult {
  const { orgId, category = 'all', channel, enabled = true } = options;
  const [items, setItems] = useState<CommunicationAiActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<CommunicationClientErrorCode | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const requestGenRef = useRef(0);

  const signature = useMemo(
    () => (orgId ? querySignature(orgId, category, channel) : ''),
    [orgId, category, channel],
  );

  const fetchPage = useCallback(
    async (mode: 'initial' | 'more') => {
      if (!orgId || !enabled) return;
      const generation = ++requestGenRef.current;
      const query: CommunicationAiActivityListQuery = {
        limit: COMMUNICATION_AI_ACTIVITY_PAGE_SIZE,
        ...(category !== 'all' ? { category } : {}),
        ...(channel ? { channel } : {}),
        ...(mode === 'more' && nextCursorRef.current ? { cursor: nextCursorRef.current } : {}),
      };

      if (mode === 'initial') setLoading(true);
      else setLoadingMore(true);

      try {
        const page = await communicationClient.listAiActivity(orgId, query);
        if (generation !== requestGenRef.current) return;
        nextCursorRef.current = page.nextCursor;
        setHasMore(page.hasMore);
        setError(null);
        setItems((current) =>
          mode === 'more' ? [...current, ...page.items] : page.items,
        );
      } catch (err) {
        if (generation !== requestGenRef.current) return;
        setError(
          err instanceof CommunicationClientError ? err.code : 'unknown',
        );
        if (mode === 'initial') setItems([]);
      } finally {
        if (generation === requestGenRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [orgId, enabled, category, channel],
  );

  useEffect(() => {
    nextCursorRef.current = null;
    if (!orgId || !enabled) {
      setItems([]);
      setHasMore(false);
      setError(null);
      return;
    }
    void fetchPage('initial');
  }, [signature, enabled, fetchPage, orgId]);

  const reload = useCallback(async () => {
    nextCursorRef.current = null;
    await fetchPage('initial');
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    await fetchPage('more');
  }, [fetchPage, hasMore, loadingMore]);

  return {
    items,
    loading,
    loadingMore,
    hasMore,
    error,
    reload,
    loadMore,
  };
}
