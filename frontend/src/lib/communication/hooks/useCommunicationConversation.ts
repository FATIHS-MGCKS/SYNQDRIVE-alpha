import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  communicationClient,
  CommunicationClientError,
  type CommunicationClientErrorCode,
} from '../communication-client';
import { dedupeEventsById } from '../dedupe';
import { resolveCommunicationPagination } from '../pagination';
import { communicationConversationSignature } from '../query-keys';
import type {
  CommunicationConversationDetail,
  CommunicationEvent,
} from '../types';

export const COMMUNICATION_TIMELINE_PAGE_SIZE = 25;

export interface UseCommunicationConversationOptions {
  orgId: string | null | undefined;
  conversationId: string | null | undefined;
  enabled?: boolean;
}

export interface UseCommunicationConversationResult {
  conversation: CommunicationConversationDetail | null;
  events: CommunicationEvent[];
  detailLoading: boolean;
  timelineLoading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  detailError: CommunicationClientErrorCode | null;
  detailNotFound: boolean;
  timelineError: CommunicationClientErrorCode | null;
  paginationError: CommunicationClientErrorCode | null;
  reloadDetail: () => Promise<CommunicationConversationDetail | null>;
  reloadTimeline: () => Promise<CommunicationEvent[]>;
  loadOlder: () => Promise<CommunicationEvent[]>;
  retryLoadOlder: () => Promise<CommunicationEvent[]>;
}

type CommittedDetailState = {
  signature: string;
  conversation: CommunicationConversationDetail | null;
};

type CommittedTimelineState = {
  signature: string;
  events: CommunicationEvent[];
  hasMore: boolean;
  nextCursor: string | null;
};

type RequestStatus = 'idle' | 'loading' | 'success' | 'error';

type DetailRequestState = {
  signature: string;
  status: RequestStatus;
};

type TimelineRequestState = {
  signature: string;
  status: RequestStatus;
};

const EMPTY_DETAIL: CommittedDetailState = { signature: '', conversation: null };
const EMPTY_TIMELINE: CommittedTimelineState = {
  signature: '',
  events: [],
  hasMore: false,
  nextCursor: null,
};

function mapClientError(err: unknown): CommunicationClientErrorCode {
  return err instanceof CommunicationClientError ? err.code : 'unknown';
}

function isNotFoundError(err: unknown): boolean {
  return err instanceof CommunicationClientError && err.status === 404;
}

export function useCommunicationConversation({
  orgId,
  conversationId,
  enabled = true,
}: UseCommunicationConversationOptions): UseCommunicationConversationResult {
  const [committedDetail, setCommittedDetail] = useState<CommittedDetailState>(EMPTY_DETAIL);
  const [committedTimeline, setCommittedTimeline] = useState<CommittedTimelineState>(EMPTY_TIMELINE);
  const [detailRequest, setDetailRequest] = useState<DetailRequestState>({ signature: '', status: 'idle' });
  const [timelineRequest, setTimelineRequest] = useState<TimelineRequestState>({ signature: '', status: 'idle' });
  const [detailError, setDetailError] = useState<CommunicationClientErrorCode | null>(null);
  const [detailNotFound, setDetailNotFound] = useState(false);
  const [timelineError, setTimelineError] = useState<CommunicationClientErrorCode | null>(null);
  const [paginationError, setPaginationError] = useState<CommunicationClientErrorCode | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const detailGenerationRef = useRef(0);
  const timelineGenerationRef = useRef(0);
  const loadOlderInFlightCursorRef = useRef<string | null>(null);

  const committedTimelineRef = useRef(committedTimeline);
  committedTimelineRef.current = committedTimeline;

  const committedDetailRef = useRef(committedDetail);
  committedDetailRef.current = committedDetail;

  const signature = communicationConversationSignature(orgId, conversationId);

  const detailAligned = committedDetail.signature === signature;
  const timelineAligned = committedTimeline.signature === signature;

  const conversation = detailAligned ? committedDetail.conversation : null;
  const events = timelineAligned ? committedTimeline.events : [];
  const hasMore = timelineAligned ? committedTimeline.hasMore : false;

  const detailRequestMatches = detailRequest.signature === signature;
  const timelineRequestMatches = timelineRequest.signature === signature;

  const detailLoading =
    detailRequestMatches && detailRequest.status === 'loading' && !detailAligned;
  const timelineLoading =
    timelineRequestMatches && timelineRequest.status === 'loading' && !timelineAligned;

  const visibleDetailError =
    detailRequestMatches && detailRequest.status === 'error' ? detailError : null;
  const visibleTimelineError =
    timelineRequestMatches && timelineRequest.status === 'error' ? timelineError : null;

  const reloadDetail = useCallback(async (): Promise<CommunicationConversationDetail | null> => {
    if (!orgId || !conversationId || !enabled) {
      setCommittedDetail({ ...EMPTY_DETAIL, signature });
      setDetailError(null);
      setDetailNotFound(false);
      setDetailRequest({ signature, status: 'idle' });
      return null;
    }

    const requestSignature = communicationConversationSignature(orgId, conversationId);
    const generation = ++detailGenerationRef.current;
    setDetailRequest({ signature: requestSignature, status: 'loading' });
    setDetailError(null);
    setDetailNotFound(false);

    try {
      const detail = await communicationClient.getConversation(orgId, conversationId);
      if (generation !== detailGenerationRef.current) {
        return committedDetailRef.current.signature === requestSignature
          ? committedDetailRef.current.conversation
          : null;
      }
      setCommittedDetail({ signature: requestSignature, conversation: detail });
      setDetailRequest({ signature: requestSignature, status: 'success' });
      return detail;
    } catch (err) {
      if (generation !== detailGenerationRef.current) return null;
      if (isNotFoundError(err)) {
        setDetailNotFound(true);
        setCommittedDetail({ signature: requestSignature, conversation: null });
      } else {
        setDetailError(mapClientError(err));
      }
      setDetailRequest({ signature: requestSignature, status: 'error' });
      return null;
    }
  }, [orgId, conversationId, enabled, signature]);

  const reloadTimeline = useCallback(async (): Promise<CommunicationEvent[]> => {
    if (!orgId || !conversationId || !enabled) {
      setCommittedTimeline({ ...EMPTY_TIMELINE, signature });
      setTimelineError(null);
      setPaginationError(null);
      setTimelineRequest({ signature, status: 'idle' });
      return [];
    }

    const requestSignature = communicationConversationSignature(orgId, conversationId);
    const generation = ++timelineGenerationRef.current;
    setTimelineRequest({ signature: requestSignature, status: 'loading' });
    setTimelineError(null);
    setPaginationError(null);

    try {
      const page = await communicationClient.listConversationEvents(orgId, conversationId, {
        limit: COMMUNICATION_TIMELINE_PAGE_SIZE,
      });
      if (generation !== timelineGenerationRef.current) {
        return committedTimelineRef.current.signature === requestSignature
          ? committedTimelineRef.current.events
          : [];
      }

      const pagination = resolveCommunicationPagination(null, page);
      const items = dedupeEventsById(page.items);
      setCommittedTimeline({
        signature: requestSignature,
        events: items,
        hasMore: pagination.hasMore,
        nextCursor: pagination.nextCursor,
      });
      setTimelineRequest({ signature: requestSignature, status: 'success' });
      if (pagination.stalled) {
        setPaginationError('unknown');
      }
      return items;
    } catch (err) {
      if (generation !== timelineGenerationRef.current) return [];
      setTimelineError(mapClientError(err));
      setTimelineRequest({ signature: requestSignature, status: 'error' });
      return [];
    }
  }, [orgId, conversationId, enabled, signature]);

  const loadOlder = useCallback(async (): Promise<CommunicationEvent[]> => {
    if (!orgId || !conversationId || !enabled) return [];

    const requestSignature = communicationConversationSignature(orgId, conversationId);
    const current = committedTimelineRef.current;
    if (current.signature !== requestSignature || !current.hasMore || !current.nextCursor) {
      return current.signature === requestSignature ? current.events : [];
    }

    const cursor = current.nextCursor;
    if (loadOlderInFlightCursorRef.current === cursor) {
      return current.events;
    }
    loadOlderInFlightCursorRef.current = cursor;
    setLoadingOlder(true);
    setPaginationError(null);

    try {
      const page = await communicationClient.listConversationEvents(orgId, conversationId, {
        cursor,
        limit: COMMUNICATION_TIMELINE_PAGE_SIZE,
      });

      if (committedTimelineRef.current.signature !== requestSignature) {
        return [];
      }

      const pagination = resolveCommunicationPagination(cursor, page);
      const merged = dedupeEventsById([...page.items, ...current.events]);
      setCommittedTimeline({
        signature: requestSignature,
        events: merged,
        hasMore: pagination.hasMore,
        nextCursor: pagination.nextCursor,
      });
      if (pagination.stalled) {
        setPaginationError('unknown');
      }
      return merged;
    } catch {
      if (committedTimelineRef.current.signature === requestSignature) {
        setPaginationError('unknown');
      }
      return committedTimelineRef.current.signature === requestSignature
        ? committedTimelineRef.current.events
        : [];
    } finally {
      if (loadOlderInFlightCursorRef.current === cursor) {
        loadOlderInFlightCursorRef.current = null;
      }
      setLoadingOlder(false);
    }
  }, [orgId, conversationId, enabled]);

  const retryLoadOlder = useCallback(async () => {
    setPaginationError(null);
    return loadOlder();
  }, [loadOlder]);

  useEffect(() => {
    if (!enabled || !orgId || !conversationId) {
      setCommittedDetail(EMPTY_DETAIL);
      setCommittedTimeline(EMPTY_TIMELINE);
      setDetailRequest({ signature: '', status: 'idle' });
      setTimelineRequest({ signature: '', status: 'idle' });
      setDetailError(null);
      setDetailNotFound(false);
      setTimelineError(null);
      setPaginationError(null);
      return;
    }

    void reloadDetail();
    void reloadTimeline();
  }, [enabled, orgId, conversationId, reloadDetail, reloadTimeline]);

  return useMemo(
    () => ({
      conversation,
      events,
      detailLoading,
      timelineLoading,
      loadingOlder,
      hasMore,
      detailError: visibleDetailError,
      detailNotFound,
      timelineError: visibleTimelineError,
      paginationError,
      reloadDetail,
      reloadTimeline,
      loadOlder,
      retryLoadOlder,
    }),
    [
      conversation,
      events,
      detailLoading,
      timelineLoading,
      loadingOlder,
      hasMore,
      visibleDetailError,
      detailNotFound,
      visibleTimelineError,
      paginationError,
      reloadDetail,
      reloadTimeline,
      loadOlder,
      retryLoadOlder,
    ],
  );
}
