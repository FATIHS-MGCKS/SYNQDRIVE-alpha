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
  conversationSignature: string;
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

type SignatureScopedError = {
  signature: string;
  code: CommunicationClientErrorCode | null;
};

type SignatureScopedNotFound = {
  signature: string;
  notFound: boolean;
};

type PaginationRequestState = {
  signature: string;
  cursor: string | null;
  status: 'idle' | 'loading' | 'error';
  error: CommunicationClientErrorCode | null;
  requestToken: number;
};

type LoadOlderAuthority = {
  requestToken: number;
  signature: string;
  cursor: string;
  timelineDataVersion: number;
  paginationGeneration: number;
};

const EMPTY_DETAIL: CommittedDetailState = { signature: '', conversation: null };
const EMPTY_TIMELINE: CommittedTimelineState = {
  signature: '',
  events: [],
  hasMore: false,
  nextCursor: null,
};

const EMPTY_PAGINATION: PaginationRequestState = {
  signature: '',
  cursor: null,
  status: 'idle',
  error: null,
  requestToken: 0,
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
  const [detailErrorState, setDetailErrorState] = useState<SignatureScopedError>({ signature: '', code: null });
  const [detailNotFoundState, setDetailNotFoundState] = useState<SignatureScopedNotFound>({
    signature: '',
    notFound: false,
  });
  const [timelineErrorState, setTimelineErrorState] = useState<SignatureScopedError>({
    signature: '',
    code: null,
  });
  const [paginationRequest, setPaginationRequest] = useState<PaginationRequestState>(EMPTY_PAGINATION);

  const detailGenerationRef = useRef(0);
  const timelineGenerationRef = useRef(0);
  const timelineDataVersionRef = useRef(0);
  const paginationGenerationRef = useRef(0);
  const loadOlderRequestTokenRef = useRef(0);
  const loadOlderInFlightRef = useRef<{
    signature: string;
    cursor: string;
    requestToken: number;
  } | null>(null);

  const committedTimelineRef = useRef(committedTimeline);
  committedTimelineRef.current = committedTimeline;

  const committedDetailRef = useRef(committedDetail);
  committedDetailRef.current = committedDetail;

  const paginationRequestRef = useRef(paginationRequest);
  paginationRequestRef.current = paginationRequest;

  const signature = communicationConversationSignature(orgId, conversationId);

  const invalidatePaginationAuthority = useCallback(() => {
    paginationGenerationRef.current += 1;
    timelineDataVersionRef.current += 1;
  }, []);

  const resetPaginationRequest = useCallback((requestSignature: string) => {
    setPaginationRequest({
      signature: requestSignature,
      cursor: null,
      status: 'idle',
      error: null,
      requestToken: 0,
    });
  }, []);

  const detailAligned = committedDetail.signature === signature;
  const timelineAligned = committedTimeline.signature === signature;

  const conversation = detailAligned ? committedDetail.conversation : null;
  const events = timelineAligned ? committedTimeline.events : [];
  const hasMore = timelineAligned ? committedTimeline.hasMore : false;

  const detailRequestMatches = detailRequest.signature === signature;
  const timelineRequestMatches = timelineRequest.signature === signature;
  const paginationRequestMatches = paginationRequest.signature === signature;

  const detailLoading =
    detailRequestMatches && detailRequest.status === 'loading' && !detailAligned;
  const timelineLoading =
    timelineRequestMatches && timelineRequest.status === 'loading' && !timelineAligned;

  const visibleDetailError =
    detailRequestMatches && detailRequest.status === 'error' && detailErrorState.signature === signature
      ? detailErrorState.code
      : null;
  const visibleTimelineError =
    timelineRequestMatches &&
    timelineRequest.status === 'error' &&
    timelineErrorState.signature === signature &&
    !(detailNotFoundState.signature === signature && detailNotFoundState.notFound)
      ? timelineErrorState.code
      : null;
  const visibleDetailNotFound =
    detailNotFoundState.signature === signature && detailNotFoundState.notFound;
  const visibleLoadingOlder =
    paginationRequestMatches && paginationRequest.status === 'loading';
  const visiblePaginationError =
    paginationRequestMatches && paginationRequest.status === 'error'
      ? paginationRequest.error
      : null;

  const reloadDetail = useCallback(async (): Promise<CommunicationConversationDetail | null> => {
    if (!orgId || !conversationId || !enabled) {
      setCommittedDetail({ ...EMPTY_DETAIL, signature });
      setDetailErrorState({ signature, code: null });
      setDetailNotFoundState({ signature, notFound: false });
      setDetailRequest({ signature, status: 'idle' });
      return null;
    }

    const requestSignature = communicationConversationSignature(orgId, conversationId);
    const generation = ++detailGenerationRef.current;
    setDetailRequest({ signature: requestSignature, status: 'loading' });
    setDetailErrorState({ signature: requestSignature, code: null });
    setDetailNotFoundState({ signature: requestSignature, notFound: false });

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
        timelineGenerationRef.current += 1;
        invalidatePaginationAuthority();
        resetPaginationRequest(requestSignature);
        setDetailNotFoundState({ signature: requestSignature, notFound: true });
        setCommittedDetail({ signature: requestSignature, conversation: null });
        setTimelineRequest({ signature: requestSignature, status: 'idle' });
        setTimelineErrorState({ signature: requestSignature, code: null });
        setCommittedTimeline({ ...EMPTY_TIMELINE, signature: requestSignature });
      } else {
        setDetailErrorState({ signature: requestSignature, code: mapClientError(err) });
      }
      setDetailRequest({ signature: requestSignature, status: 'error' });
      return null;
    }
  }, [orgId, conversationId, enabled, signature, invalidatePaginationAuthority, resetPaginationRequest]);

  const reloadTimeline = useCallback(async (): Promise<CommunicationEvent[]> => {
    if (!orgId || !conversationId || !enabled) {
      setCommittedTimeline({ ...EMPTY_TIMELINE, signature });
      setTimelineErrorState({ signature, code: null });
      resetPaginationRequest(signature);
      setTimelineRequest({ signature, status: 'idle' });
      return [];
    }

    const requestSignature = communicationConversationSignature(orgId, conversationId);
    const generation = ++timelineGenerationRef.current;
    invalidatePaginationAuthority();
    resetPaginationRequest(requestSignature);

    setTimelineRequest({ signature: requestSignature, status: 'loading' });
    setTimelineErrorState({ signature: requestSignature, code: null });

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
        const stallToken = ++loadOlderRequestTokenRef.current;
        setPaginationRequest({
          signature: requestSignature,
          cursor: null,
          status: 'error',
          error: 'unknown',
          requestToken: stallToken,
        });
      }
      return items;
    } catch (err) {
      if (generation !== timelineGenerationRef.current) return [];
      setTimelineErrorState({ signature: requestSignature, code: mapClientError(err) });
      setTimelineRequest({ signature: requestSignature, status: 'error' });
      return [];
    }
  }, [orgId, conversationId, enabled, signature, invalidatePaginationAuthority, resetPaginationRequest]);

  const isLoadOlderAuthoritative = useCallback(
    (authority: LoadOlderAuthority, requestSignature: string): boolean => {
      const currentSignature = communicationConversationSignature(orgId, conversationId);
      return (
        authority.signature === currentSignature &&
        authority.signature === requestSignature &&
        authority.timelineDataVersion === timelineDataVersionRef.current &&
        authority.paginationGeneration === paginationGenerationRef.current
      );
    },
    [orgId, conversationId],
  );

  const loadOlder = useCallback(async (): Promise<CommunicationEvent[]> => {
    if (!orgId || !conversationId || !enabled) return [];

    const requestSignature = communicationConversationSignature(orgId, conversationId);
    const current = committedTimelineRef.current;
    if (current.signature !== requestSignature || !current.hasMore || !current.nextCursor) {
      return current.signature === requestSignature ? current.events : [];
    }

    const cursor = current.nextCursor;
    const inFlight = loadOlderInFlightRef.current;
    if (
      inFlight &&
      inFlight.signature === requestSignature &&
      inFlight.cursor === cursor
    ) {
      return current.events;
    }

    const requestToken = ++loadOlderRequestTokenRef.current;
    loadOlderInFlightRef.current = { signature: requestSignature, cursor, requestToken };
    const authority: LoadOlderAuthority = {
      requestToken,
      signature: requestSignature,
      cursor,
      timelineDataVersion: timelineDataVersionRef.current,
      paginationGeneration: paginationGenerationRef.current,
    };

    setPaginationRequest({
      signature: requestSignature,
      cursor,
      status: 'loading',
      error: null,
      requestToken,
    });

    const mergeBaseEvents = current.events;

    try {
      const page = await communicationClient.listConversationEvents(orgId, conversationId, {
        cursor,
        limit: COMMUNICATION_TIMELINE_PAGE_SIZE,
      });

      if (!isLoadOlderAuthoritative(authority, requestSignature)) {
        return committedTimelineRef.current.signature === requestSignature
          ? committedTimelineRef.current.events
          : [];
      }

      const pagination = resolveCommunicationPagination(cursor, page);
      const merged = dedupeEventsById([...page.items, ...mergeBaseEvents]);
      setCommittedTimeline({
        signature: requestSignature,
        events: merged,
        hasMore: pagination.hasMore,
        nextCursor: pagination.nextCursor,
      });

      if (pagination.stalled) {
        setPaginationRequest({
          signature: requestSignature,
          cursor,
          status: 'error',
          error: 'unknown',
          requestToken,
        });
      } else {
        setPaginationRequest({
          signature: requestSignature,
          cursor: null,
          status: 'idle',
          error: null,
          requestToken: 0,
        });
      }
      return merged;
    } catch {
      if (isLoadOlderAuthoritative(authority, requestSignature)) {
        setPaginationRequest({
          signature: requestSignature,
          cursor,
          status: 'error',
          error: 'unknown',
          requestToken,
        });
      }
      return committedTimelineRef.current.signature === requestSignature
        ? committedTimelineRef.current.events
        : [];
    } finally {
      const inFlightOwner = loadOlderInFlightRef.current;
      if (
        inFlightOwner &&
        inFlightOwner.requestToken === requestToken &&
        inFlightOwner.signature === requestSignature &&
        inFlightOwner.cursor === cursor
      ) {
        loadOlderInFlightRef.current = null;
      }

      if (
        paginationRequestRef.current.requestToken === requestToken &&
        paginationRequestRef.current.signature === requestSignature &&
        paginationRequestRef.current.cursor === cursor
      ) {
        setPaginationRequest((prev) =>
          prev.requestToken === requestToken && prev.status === 'loading'
            ? { ...prev, status: 'idle', cursor: null, requestToken: 0 }
            : prev,
        );
      }
    }
  }, [orgId, conversationId, enabled, isLoadOlderAuthoritative]);

  const retryLoadOlder = useCallback(async () => {
    const requestSignature = communicationConversationSignature(orgId, conversationId);
    setPaginationRequest((prev) =>
      prev.signature === requestSignature
        ? { ...prev, status: 'idle', error: null }
        : { signature: requestSignature, cursor: null, status: 'idle', error: null, requestToken: 0 },
    );
    return loadOlder();
  }, [orgId, conversationId, loadOlder]);

  useEffect(() => {
    paginationGenerationRef.current += 1;
    timelineDataVersionRef.current += 1;
    loadOlderInFlightRef.current = null;
    resetPaginationRequest(signature);

    if (!enabled || !orgId || !conversationId) {
      setCommittedDetail(EMPTY_DETAIL);
      setCommittedTimeline(EMPTY_TIMELINE);
      setDetailRequest({ signature: '', status: 'idle' });
      setTimelineRequest({ signature: '', status: 'idle' });
      setDetailErrorState({ signature: '', code: null });
      setDetailNotFoundState({ signature: '', notFound: false });
      setTimelineErrorState({ signature: '', code: null });
      return;
    }

    void reloadDetail();
    void reloadTimeline();
  }, [enabled, orgId, conversationId, reloadDetail, reloadTimeline, resetPaginationRequest, signature]);

  return useMemo(
    () => ({
      conversation,
      events,
      detailLoading,
      timelineLoading,
      loadingOlder: visibleLoadingOlder,
      hasMore,
      detailError: visibleDetailError,
      detailNotFound: visibleDetailNotFound,
      timelineError: visibleTimelineError,
      paginationError: visiblePaginationError,
      conversationSignature: signature,
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
      visibleLoadingOlder,
      hasMore,
      visibleDetailError,
      visibleDetailNotFound,
      visibleTimelineError,
      visiblePaginationError,
      signature,
      reloadDetail,
      reloadTimeline,
      loadOlder,
      retryLoadOlder,
    ],
  );
}
