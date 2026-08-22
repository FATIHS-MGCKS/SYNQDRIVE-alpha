import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRequestGeneration } from '../../../rental/hooks/request-generation';
import { communicationClient } from '../communication-client';
import { dedupeConversationsById } from '../dedupe';
import { communicationInboxQuerySignature } from '../query-keys';
import type {
  CommunicationConversationListItem,
  CommunicationConversationListQuery,
  CommunicationConversationSummary,
} from '../types';

export const COMMUNICATION_INBOX_PAGE_SIZE = 25;

export interface UseCommunicationInboxOptions {
  orgId: string | null | undefined;
  filters: CommunicationConversationListQuery;
  enabled?: boolean;
}

export interface UseCommunicationInboxResult {
  conversations: CommunicationConversationListItem[];
  summary: CommunicationConversationSummary | null;
  loading: boolean;
  loadingMore: boolean;
  loadingSummary: boolean;
  hasMore: boolean;
  error: string | null;
  paginationError: string | null;
  isStale: boolean;
  reload: () => Promise<CommunicationConversationListItem[]>;
  loadMore: () => Promise<CommunicationConversationListItem[]>;
  retryLoadMore: () => Promise<CommunicationConversationListItem[]>;
}

export function useCommunicationInbox({
  orgId,
  filters,
  enabled = true,
}: UseCommunicationInboxOptions): UseCommunicationInboxResult {
  const [conversations, setConversations] = useState<CommunicationConversationListItem[]>([]);
  const [summary, setSummary] = useState<CommunicationConversationSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paginationError, setPaginationError] = useState<string | null>(null);
  const conversationsRef = useRef<CommunicationConversationListItem[]>([]);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const { nextGeneration, isCurrent } = useRequestGeneration();

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const querySignature = communicationInboxQuerySignature(orgId, filters);

  const reload = useCallback(async (): Promise<CommunicationConversationListItem[]> => {
    if (!orgId || !enabled) {
      setConversations([]);
      setSummary(null);
      setError(null);
      setPaginationError(null);
      setHasMore(false);
      setNextCursor(null);
      return [];
    }

    const generation = nextGeneration();
    setLoading(true);
    setError(null);
    setPaginationError(null);

    try {
      const query = { ...filtersRef.current, limit: COMMUNICATION_INBOX_PAGE_SIZE };
      const page = await communicationClient.listConversations(orgId, query);
      if (!isCurrent(generation)) return conversationsRef.current;

      const items = dedupeConversationsById(page.items);
      setConversations(items);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
      return items;
    } catch (err) {
      if (!isCurrent(generation)) return conversationsRef.current;
      const message =
        err instanceof Error ? err.message : 'Communication inbox could not be loaded';
      setError(message);
      if (!conversationsRef.current.length) setConversations([]);
      return conversationsRef.current;
    } finally {
      if (isCurrent(generation)) setLoading(false);
    }
  }, [enabled, isCurrent, nextGeneration, orgId]);

  const loadSummary = useCallback(async () => {
    if (!orgId || !enabled) {
      setSummary(null);
      return;
    }
    setLoadingSummary(true);
    try {
      const query = { ...filtersRef.current };
      const result = await communicationClient.getConversationSummary(orgId, query);
      setSummary(result);
    } catch {
      setSummary(null);
    } finally {
      setLoadingSummary(false);
    }
  }, [enabled, orgId]);

  const loadMore = useCallback(async (): Promise<CommunicationConversationListItem[]> => {
    if (!orgId || !enabled || !nextCursor || loadingMore) {
      return conversationsRef.current;
    }

    const generation = nextGeneration();
    setLoadingMore(true);
    setPaginationError(null);

    try {
      const query = {
        ...filtersRef.current,
        cursor: nextCursor,
        limit: COMMUNICATION_INBOX_PAGE_SIZE,
      };
      const page = await communicationClient.listConversations(orgId, query);
      if (!isCurrent(generation)) return conversationsRef.current;

      const merged = dedupeConversationsById([...conversationsRef.current, ...page.items]);
      setConversations(merged);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
      return merged;
    } catch (err) {
      if (!isCurrent(generation)) return conversationsRef.current;
      const message =
        err instanceof Error ? err.message : 'More conversations could not be loaded';
      setPaginationError(message);
      return conversationsRef.current;
    } finally {
      if (isCurrent(generation)) setLoadingMore(false);
    }
  }, [enabled, isCurrent, loadingMore, nextCursor, nextGeneration, orgId]);

  const retryLoadMore = useCallback(async () => {
    setPaginationError(null);
    return loadMore();
  }, [loadMore]);

  useEffect(() => {
    void reload();
    void loadSummary();
  }, [loadSummary, querySignature, reload]);

  const isStale = useMemo(() => Boolean(error && conversations.length > 0), [conversations.length, error]);

  return {
    conversations,
    summary,
    loading,
    loadingMore,
    loadingSummary,
    hasMore,
    error,
    paginationError,
    isStale,
    reload,
    loadMore,
    retryLoadMore,
  };
}
