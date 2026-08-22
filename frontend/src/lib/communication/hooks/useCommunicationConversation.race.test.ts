// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../../test/renderHook';
import { useCommunicationConversation } from './useCommunicationConversation';
import type {
  CommunicationConversationDetail,
  CommunicationEvent,
  CommunicationEventListResponse,
} from '../types';

vi.mock('../communication-client', () => ({
  communicationClient: {
    getConversation: vi.fn(),
    listConversationEvents: vi.fn(),
  },
  CommunicationClientError: class CommunicationClientError extends Error {
    code: string;
    status?: number;
    constructor(code: string, message: string, status?: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

import { communicationClient, CommunicationClientError } from '../communication-client';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function detail(id: string, label: string): CommunicationConversationDetail {
  return {
    id,
    channel: 'WHATSAPP',
    status: 'AI_ACTIVE',
    unreadCount: 0,
    lastActivityAt: '2026-08-22T10:00:00.000Z',
    displayLabel: label,
    customer: null,
    booking: null,
    vehicle: null,
    station: null,
    assignedUser: null,
    assignedAgent: null,
    createdAt: '2026-08-20T08:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
  };
}

function event(id: string, text: string): CommunicationEvent {
  return {
    id,
    eventType: 'MESSAGE_RECEIVED',
    direction: 'INBOUND',
    occurredAt: '2026-08-22T10:00:00.000Z',
    content: {
      id: `cnt-${id}`,
      contentType: 'TEXT',
      text,
      truncated: false,
      hasAttachments: false,
      attachmentCount: 0,
    },
  };
}

function timelineResponse(items: CommunicationEvent[]): CommunicationEventListResponse {
  return { items, nextCursor: null, hasMore: false };
}

describe('useCommunicationConversation race hardening', () => {
  let unmountCurrent: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(communicationClient.getConversation).mockResolvedValue(
      detail('conv-1', 'Default'),
    );
    vi.mocked(communicationClient.listConversationEvents).mockResolvedValue(
      timelineResponse([event('evt-1', 'Default message')]),
    );
  });

  afterEach(() => {
    unmountCurrent?.();
    unmountCurrent = null;
  });

  it('hides conversation A detail when switching to B', async () => {
    const detailA = deferred<CommunicationConversationDetail>();
    const detailB = deferred<CommunicationConversationDetail>();
    let call = 0;

    vi.mocked(communicationClient.getConversation).mockImplementation(() => {
      call += 1;
      return call === 1 ? detailA.promise : detailB.promise;
    });

    const { result, rerender, unmount } = renderHook(
      ({ conversationId }: { conversationId: string }) =>
        useCommunicationConversation({ orgId: 'org-1', conversationId }),
      { initialProps: { conversationId: 'conv-a' } },
    );
    unmountCurrent = unmount;

    await waitForHook(() => vi.mocked(communicationClient.getConversation).mock.calls.length >= 1);

    await act(async () => {
      rerender({ conversationId: 'conv-b' });
    });
    expect(result.current.conversation).toBeNull();

    await act(async () => {
      detailB.resolve(detail('conv-b', 'Conversation B'));
    });
    await waitForHook(() => result.current.conversation?.displayLabel === 'Conversation B');

    await act(async () => {
      detailA.resolve(detail('conv-a', 'Conversation A'));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(result.current.conversation?.displayLabel).toBe('Conversation B');
  });

  it('hides timeline A when switching to B', async () => {
    const timelineA = deferred<CommunicationEventListResponse>();
    const timelineB = deferred<CommunicationEventListResponse>();
    let call = 0;

    vi.mocked(communicationClient.listConversationEvents).mockImplementation(() => {
      call += 1;
      return call === 1 ? timelineA.promise : timelineB.promise;
    });

    const { result, rerender, unmount } = renderHook(
      ({ conversationId }: { conversationId: string }) =>
        useCommunicationConversation({ orgId: 'org-1', conversationId }),
      { initialProps: { conversationId: 'conv-a' } },
    );
    unmountCurrent = unmount;

    rerender({ conversationId: 'conv-b' });
    expect(result.current.events).toEqual([]);

    timelineB.resolve(timelineResponse([event('evt-b', 'B private message')]));
    await waitForHook(() => result.current.events.some((e) => e.content?.text === 'B private message'));

    timelineA.resolve(timelineResponse([event('evt-a', 'A private message')]));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(result.current.events.map((e) => e.content?.text)).toEqual(['B private message']);
  });

  it('clears org A data immediately on org switch', async () => {
    const detailA = deferred<CommunicationConversationDetail>();
    const detailB = deferred<CommunicationConversationDetail>();
    let call = 0;

    vi.mocked(communicationClient.getConversation).mockImplementation(() => {
      call += 1;
      return call === 1 ? detailA.promise : detailB.promise;
    });

    const { result, rerender, unmount } = renderHook(
      ({ orgId }: { orgId: string }) =>
        useCommunicationConversation({ orgId, conversationId: 'conv-1' }),
      { initialProps: { orgId: 'org-a' } },
    );
    unmountCurrent = unmount;

    rerender({ orgId: 'org-b' });
    expect(result.current.conversation).toBeNull();

    detailB.resolve(detail('conv-1', 'Org B header'));
    await waitForHook(() => result.current.conversation?.displayLabel === 'Org B header');

    detailA.resolve(detail('conv-1', 'Org A header'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(result.current.conversation?.displayLabel).toBe('Org B header');
  });

  it('prepends older timeline page and dedupes overlapping events', async () => {
    const firstPage = timelineResponse([event('evt-c', 'C'), event('evt-d', 'D')]);
    firstPage.nextCursor = 'older-cursor';
    firstPage.hasMore = true;

    vi.mocked(communicationClient.listConversationEvents)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce({
        items: [event('evt-a', 'A'), event('evt-b', 'B'), event('evt-c', 'C')],
        nextCursor: null,
        hasMore: false,
      });

    const { result, unmount } = renderHook(() =>
      useCommunicationConversation({ orgId: 'org-1', conversationId: 'conv-1' }),
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.events.length === 2 && !result.current.timelineLoading);

    await act(async () => {
      await result.current.loadOlder();
    });

    const texts = result.current.events.map((e) => e.content?.text);
    expect(texts).toEqual(['A', 'B', 'C', 'D']);
    expect(new Set(result.current.events.map((e) => e.id)).size).toBe(4);
  });

  it('stops pagination when cursor stalls on load older', async () => {
    vi.mocked(communicationClient.listConversationEvents)
      .mockResolvedValueOnce({
        items: [event('evt-1', 'One')],
        nextCursor: 'older-cursor',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [event('evt-1', 'One')],
        nextCursor: 'older-cursor',
        hasMore: true,
      });

    const { result, unmount } = renderHook(() =>
      useCommunicationConversation({ orgId: 'org-1', conversationId: 'conv-1' }),
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.events.length === 1);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadOlder();
    });

    expect(result.current.hasMore).toBe(false);
    expect(result.current.paginationError).toBe('unknown');
  });

  it('sets notFound on 404 detail', async () => {
    vi.mocked(communicationClient.getConversation).mockRejectedValue(
      new CommunicationClientError('unknown', 'Not found', 404),
    );

    const { result, unmount } = renderHook(() =>
      useCommunicationConversation({ orgId: 'org-1', conversationId: 'missing' }),
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.detailNotFound);
    expect(result.current.conversation).toBeNull();
  });
});
