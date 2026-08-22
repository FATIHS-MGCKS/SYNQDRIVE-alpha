import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  communicationClient,
  CommunicationClientError,
  type CommunicationClientErrorCode,
} from '../communication-client';
import { dedupeConversationsById } from '../dedupe';
import { resolveCommunicationPagination } from '../pagination';
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
  error: CommunicationClientErrorCode | null;
  paginationError: CommunicationClientErrorCode | null;
  isStale: boolean;
  reload: () => Promise<CommunicationConversationListItem[]>;
  loadMore: () => Promise<CommunicationConversationListItem[]>;
  retryLoadMore: () => Promise<CommunicationConversationListItem[]>;
}

type CommittedListState = {
  signature: string;
  conversations: CommunicationConversationListItem[];
  hasMore: boolean;
  nextCursor: string | null;
};

type CommittedSummaryState = {
  signature: string;
  summary: CommunicationConversationSummary | null;
};

type ListRequestStatus = 'idle' | 'loading' | 'success' | 'error';

type ListRequestState = {
  signature: string;
  status: ListRequestStatus;
};

const EMPTY_LIST: CommittedListState = {
  signature: '',
  conversations: [],
  hasMore: false,
  nextCursor: null,
};

const EMPTY_SUMMARY: CommittedSummaryState = {
  signature: '',
  summary: null,
};

function mapClientError(err: unknown): CommunicationClientErrorCode {
  return err instanceof CommunicationClientError ? err.code : 'unknown';
}

export function useCommunicationInbox({
  orgId,
  filters,
  enabled = true,
}: UseCommunicationInboxOptions): UseCommunicationInboxResult {
  const [committedList, setCommittedList] = useState<CommittedListState>(EMPTY_LIST);
  const [committedSummary, setCommittedSummary] = useState<CommittedSummaryState>(EMPTY_SUMMARY);
  const [listRequest, setListRequest] = useState<ListRequestState>({ signature: '', status: 'idle' });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<CommunicationClientErrorCode | null>(null);
  const [paginationError, setPaginationError] = useState<CommunicationClientErrorCode | null>(null);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const committedListRef = useRef(committedList);
  committedListRef.current = committedList;

  const listReloadGenerationRef = useRef(0);
  const summaryGenerationRef = useRef(0);
  const loadMoreInFlightCursorRef = useRef<string | null>(null);

  const querySignature = communicationInboxQuerySignature(orgId, filters);

  const listAligned = committedList.signature === querySignature;
  const summaryAligned = committedSummary.signature === querySignature;

  const conversations = listAligned ? committedList.conversations : [];
  const hasMore = listAligned ? committedList.hasMore : false;
  const summary = summaryAligned ? committedSummary.summary : null;

  const listRequestMatches = listRequest.signature === querySignature;
  const visibleLoading =
    listRequestMatches && listRequest.status === 'loading' && !listAligned;
  const visibleError = listRequestMatches && listRequest.status === 'error' ? error : null;
  const visibleLoadingSummary = loadingSummary || !summaryAligned;

  const reload = useCallback(async (): Promise<CommunicationConversationListItem[]> => {
    if (!orgId || !enabled) {
      setCommittedList({ ...EMPTY_LIST, signature: querySignature });
      setCommittedSummary({ ...EMPTY_SUMMARY, signature: querySignature });
      setError(null);
      setPaginationError(null);
      setLoading(false);
      setLoadingSummary(false);
      return [];
    }

    const requestSignature = communicationInboxQuerySignature(orgId, filtersRef.current);
    const generation = ++listReloadGenerationRef.current;
    setListRequest({ signature: requestSignature, status: 'loading' });
    setLoading(true);
    setError(null);
    setPaginationError(null);

    try {
      const query = { ...filtersRef.current, limit: COMMUNICATION_INBOX_PAGE_SIZE };
      const page = await communicationClient.listConversations(orgId, query);
      if (generation !== listReloadGenerationRef.current) {
        return committedListRef.current.signature === requestSignature
          ? committedListRef.current.conversations
          : [];
      }

      const pagination = resolveCommunicationPagination(null, page);
      const items = dedupeConversationsById(page.items);
      setCommittedList({
        signature: requestSignature,
        conversations: items,
        hasMore: pagination.hasMore,
        nextCursor: pagination.nextCursor,
      });
      setListRequest({ signature: requestSignature, status: 'success' });
      if (pagination.stalled) {
        setPaginationError('unknown');
      }
      return items;
    } catch (err) {
      if (generation !== listReloadGenerationRef.current) {
        return committedListRef.current.signature === requestSignature
          ? committedListRef.current.conversations
          : [];
      }
      setListRequest({ signature: requestSignature, status: 'error' });
      setError(mapClientError(err));
      return committedListRef.current.signature === requestSignature
        ? committedListRef.current.conversations
        : [];
    } finally {
      if (generation === listReloadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, orgId, querySignature]);

  const loadSummary = useCallback(async () => {
    if (!orgId || !enabled) {
      setCommittedSummary({ ...EMPTY_SUMMARY, signature: querySignature });
      setLoadingSummary(false);
      return;
    }

    const requestSignature = communicationInboxQuerySignature(orgId, filtersRef.current);
    const generation = ++summaryGenerationRef.current;
    setLoadingSummary(true);

    try {
      const query = { ...filtersRef.current };
      const result = await communicationClient.getConversationSummary(orgId, query);
      if (generation !== summaryGenerationRef.current) return;
      setCommittedSummary({ signature: requestSignature, summary: result });
    } catch {
      if (generation !== summaryGenerationRef.current) return;
      setCommittedSummary({ signature: requestSignature, summary: null });
    } finally {
      if (generation === summaryGenerationRef.current) {
        setLoadingSummary(false);
      }
    }
  }, [enabled, orgId, querySignature]);

  const loadMore = useCallback(async (): Promise<CommunicationConversationListItem[]> => {
    const baseSignature = communicationInboxQuerySignature(orgId, filtersRef.current);
    const currentList = committedListRef.current;

    if (!orgId || !enabled || currentList.signature !== baseSignature || !currentList.nextCursor) {
      return currentList.signature === baseSignature ? currentList.conversations : [];
    }

    const cursor = currentList.nextCursor;
    if (loadMoreInFlightCursorRef.current === cursor) {
      return currentList.conversations;
    }

    loadMoreInFlightCursorRef.current = cursor;
    setLoadingMore(true);
    setPaginationError(null);

    try {
      const query = {
        ...filtersRef.current,
        cursor,
        limit: COMMUNICATION_INBOX_PAGE_SIZE,
      };
      const page = await communicationClient.listConversations(orgId, query);

      if (baseSignature !== communicationInboxQuerySignature(orgId, filtersRef.current)) {
        return committedListRef.current.signature === baseSignature
          ? committedListRef.current.conversations
          : [];
      }

      const pagination = resolveCommunicationPagination(cursor, page);
      const merged = dedupeConversationsById([
        ...committedListRef.current.conversations,
        ...page.items,
      ]);
      setCommittedList({
        signature: baseSignature,
        conversations: merged,
        hasMore: pagination.hasMore,
        nextCursor: pagination.nextCursor,
      });
      if (pagination.stalled) {
        setPaginationError('unknown');
      }
      return merged;
    } catch (err) {
      if (baseSignature !== communicationInboxQuerySignature(orgId, filtersRef.current)) {
        return committedListRef.current.signature === baseSignature
          ? committedListRef.current.conversations
          : [];
      }
      setPaginationError(mapClientError(err));
      return committedListRef.current.conversations;
    } finally {
      if (loadMoreInFlightCursorRef.current === cursor) {
        loadMoreInFlightCursorRef.current = null;
      }
      setLoadingMore(false);
    }
  }, [enabled, orgId]);

  const retryLoadMore = useCallback(async () => {
    setPaginationError(null);
    return loadMore();
  }, [loadMore]);

  useEffect(() => {
    listReloadGenerationRef.current += 1;
    summaryGenerationRef.current += 1;
    loadMoreInFlightCursorRef.current = null;
    setPaginationError(null);
    setError(null);
    setListRequest({ signature: querySignature, status: 'loading' });
    void reload();
    void loadSummary();
  }, [loadSummary, querySignature, reload]);

  const isStale = useMemo(
    () => Boolean(visibleError && listAligned && conversations.length > 0),
    [conversations.length, listAligned, visibleError],
  );

  return {
    conversations,
    summary,
    loading: visibleLoading,
    loadingMore,
    loadingSummary: visibleLoadingSummary,
    hasMore,
    error: visibleError,
    paginationError,
    isStale,
    reload,
    loadMore,
    retryLoadMore,
  };
}
