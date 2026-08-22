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
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function detail(id: string, label: string, channel: 'WHATSAPP' | 'SMS' | 'VOICE' = 'WHATSAPP'): CommunicationConversationDetail {
  return {
    id,
    channel,
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

function event(id: string, text: string, occurredAt = '2026-08-22T10:00:00.000Z'): CommunicationEvent {
  return {
    id,
    eventType: 'MESSAGE_RECEIVED',
    direction: 'INBOUND',
    occurredAt,
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

function timelineResponse(
  items: CommunicationEvent[],
  nextCursor: string | null = null,
  hasMore = false,
): CommunicationEventListResponse {
  return { items, nextCursor, hasMore };
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

  it('ABA detail race keeps newest generation for same signature', async () => {
    const first = deferred<CommunicationConversationDetail>();
    const third = deferred<CommunicationConversationDetail>();
    let call = 0;

    vi.mocked(communicationClient.getConversation).mockImplementation(() => {
      call += 1;
      if (call === 1) return first.promise;
      if (call === 3) return third.promise;
      return Promise.resolve(detail('conv-a', 'Conversation A gen2'));
    });

    const { result, rerender, unmount } = renderHook(
      ({ conversationId }: { conversationId: string }) =>
        useCommunicationConversation({ orgId: 'org-1', conversationId }),
      { initialProps: { conversationId: 'conv-a' } },
    );
    unmountCurrent = unmount;

    await waitForHook(() => call >= 1);
    rerender({ conversationId: 'conv-b' });
    rerender({ conversationId: 'conv-a' });
    await waitForHook(() => call >= 3);

    third.resolve(detail('conv-a', 'Conversation A gen3'));
    await waitForHook(() => result.current.conversation?.displayLabel === 'Conversation A gen3');

    first.resolve(detail('conv-a', 'Conversation A gen1'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(result.current.conversation?.displayLabel).toBe('Conversation A gen3');
  });

  it('ABA timeline race keeps newest generation for same signature', async () => {
    const first = deferred<CommunicationEventListResponse>();
    const third = deferred<CommunicationEventListResponse>();
    let call = 0;

    vi.mocked(communicationClient.listConversationEvents).mockImplementation(() => {
      call += 1;
      if (call === 1) return first.promise;
      if (call === 3) return third.promise;
      return Promise.resolve(timelineResponse([event('evt-gen2', 'A generation 2')]));
    });

    const { result, rerender, unmount } = renderHook(
      ({ conversationId }: { conversationId: string }) =>
        useCommunicationConversation({ orgId: 'org-1', conversationId }),
      { initialProps: { conversationId: 'conv-a' } },
    );
    unmountCurrent = unmount;

    await waitForHook(() => call >= 1);
    rerender({ conversationId: 'conv-b' });
    rerender({ conversationId: 'conv-a' });
    await waitForHook(() => call >= 3);

    third.resolve(timelineResponse([event('evt-gen3', 'A generation 3')]));
    await waitForHook(() => result.current.events[0]?.content?.text === 'A generation 3');

    first.resolve(timelineResponse([event('evt-gen1', 'A generation 1')]));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(result.current.events[0]?.content?.text).toBe('A generation 3');
  });

  it('ignores stale loadOlder from conversation A after switching to B', async () => {
    const olderA = deferred<CommunicationEventListResponse>();
    const firstPage = timelineResponse([event('evt-c', 'C'), event('evt-d', 'D')], 'cursor-older', true);

    vi.mocked(communicationClient.listConversationEvents).mockImplementation((_org, convId, query) => {
      if (convId === 'conv-a' && query?.cursor === 'cursor-older') return olderA.promise;
      if (convId === 'conv-b') {
        return Promise.resolve(timelineResponse([event('evt-b', 'B only')]));
      }
      return Promise.resolve(firstPage);
    });

    const { result, rerender, unmount } = renderHook(
      ({ conversationId }: { conversationId: string }) =>
        useCommunicationConversation({ orgId: 'org-1', conversationId }),
      { initialProps: { conversationId: 'conv-a' } },
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.events.length === 2);
    void result.current.loadOlder();

    rerender({ conversationId: 'conv-b' });
    await waitForHook(() => result.current.events[0]?.content?.text === 'B only');

    olderA.resolve(
      timelineResponse([event('evt-a', 'A older'), event('evt-b-dup', 'C')], null, false),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });

    expect(result.current.events.map((e) => e.content?.text)).toEqual(['B only']);
    expect(result.current.loadingOlder).toBe(false);
    expect(result.current.paginationError).toBeNull();
  });

  it('does not let conversation A loadOlder clear B in-flight pagination state for same cursor', async () => {
    const olderA = deferred<CommunicationEventListResponse>();
    const olderB = deferred<CommunicationEventListResponse>();
    const page = timelineResponse([event('evt-1', 'One')], 'cursor-older', true);

    vi.mocked(communicationClient.listConversationEvents).mockImplementation((_org, convId, query) => {
      if (!query?.cursor) return Promise.resolve(page);
      if (convId === 'conv-a') return olderA.promise;
      return olderB.promise;
    });

    const { result, rerender, unmount } = renderHook(
      ({ conversationId }: { conversationId: string }) =>
        useCommunicationConversation({ orgId: 'org-1', conversationId }),
      { initialProps: { conversationId: 'conv-a' } },
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.hasMore);
    void result.current.loadOlder();
    await waitForHook(() => result.current.loadingOlder);

    rerender({ conversationId: 'conv-b' });
    await waitForHook(() => result.current.events.length === 1);
    void result.current.loadOlder();
    await waitForHook(() => result.current.loadingOlder);

    olderA.resolve(timelineResponse([event('evt-a', 'A stale')], null, false));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(result.current.loadingOlder).toBe(true);

    olderB.resolve(timelineResponse([event('evt-b-old', 'B older')], null, false));
    await waitForHook(() => !result.current.loadingOlder);
    expect(result.current.events.map((e) => e.content?.text)).toEqual(['B older', 'One']);
  });

  it('full timeline reload invalidates stale loadOlder merge', async () => {
    const olderPage = deferred<CommunicationEventListResponse>();
    const firstPage = timelineResponse(
      [event('evt-c', 'C'), event('evt-d', 'D')],
      'cursor-older',
      true,
    );
    const reloadedPage = timelineResponse(
      [event('evt-c', 'C'), event('evt-d', 'D'), event('evt-e', 'E')],
      null,
      false,
    );

    vi.mocked(communicationClient.listConversationEvents).mockImplementation((_org, _id, query) => {
      if (query?.cursor === 'cursor-older') return olderPage.promise;
      if (vi.mocked(communicationClient.listConversationEvents).mock.calls.length <= 1) {
        return Promise.resolve(firstPage);
      }
      return Promise.resolve(reloadedPage);
    });

    const { result, unmount } = renderHook(() =>
      useCommunicationConversation({ orgId: 'org-1', conversationId: 'conv-1' }),
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.events.length === 2);
    void result.current.loadOlder();
    await act(async () => {
      await result.current.reloadTimeline();
    });
    await waitForHook(() => result.current.events.some((e) => e.content?.text === 'E'));

    olderPage.resolve(
      timelineResponse([event('evt-a', 'A'), event('evt-b', 'B'), event('evt-c', 'C')], null, false),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });

    expect(result.current.events.map((e) => e.content?.text)).toEqual(['C', 'D', 'E']);
  });

  it('scopes notFound to current signature only', async () => {
    vi.mocked(communicationClient.getConversation)
      .mockRejectedValueOnce(new CommunicationClientError('unknown', 'Not found', 404))
      .mockResolvedValueOnce(detail('conv-b', 'Conversation B'));

    const { result, rerender, unmount } = renderHook(
      ({ conversationId }: { conversationId: string }) =>
        useCommunicationConversation({ orgId: 'org-1', conversationId }),
      { initialProps: { conversationId: 'conv-missing' } },
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.detailNotFound);
    rerender({ conversationId: 'conv-b' });
    expect(result.current.detailNotFound).toBe(false);
    await waitForHook(() => result.current.conversation?.displayLabel === 'Conversation B');
  });

  it('clears org A pagination state immediately on org switch', async () => {
    const olderA = deferred<CommunicationEventListResponse>();
    const page = timelineResponse([event('evt-1', 'A private message')], 'cursor-older', true);

    vi.mocked(communicationClient.listConversationEvents).mockImplementation((orgId, _convId, query) => {
      if (orgId === 'org-a' && query?.cursor === 'cursor-older') return olderA.promise;
      if (orgId === 'org-b') {
        return Promise.resolve(timelineResponse([event('evt-b', 'B only')]));
      }
      return Promise.resolve(page);
    });

    const { result, rerender, unmount } = renderHook(
      ({ orgId }: { orgId: string }) =>
        useCommunicationConversation({ orgId, conversationId: 'conv-1' }),
      { initialProps: { orgId: 'org-a' } },
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.events[0]?.content?.text === 'A private message');
    void result.current.loadOlder();
    await waitForHook(() => result.current.loadingOlder);

    rerender({ orgId: 'org-b' });
    expect(result.current.loadingOlder).toBe(false);
    expect(result.current.paginationError).toBeNull();
    expect(result.current.events).toEqual([]);

    await waitForHook(() => result.current.events[0]?.content?.text === 'B only');
    expect(result.current.events.map((e) => e.content?.text)).toEqual(['B only']);

    olderA.resolve(timelineResponse([event('evt-stale', 'Stale A')], null, false));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(result.current.events.map((e) => e.content?.text)).toEqual(['B only']);
    expect(result.current.loadingOlder).toBe(false);
  });

  it('scopes pagination error to current signature only', async () => {
    const olderA = deferred<CommunicationEventListResponse>();
    const page = timelineResponse([event('evt-1', 'One')], 'cursor-older', true);

    vi.mocked(communicationClient.listConversationEvents).mockImplementation((_org, convId, query) => {
      if (convId === 'conv-a' && query?.cursor) return olderA.promise;
      if (convId === 'conv-b') return Promise.resolve(timelineResponse([event('evt-b', 'B')]));
      return Promise.resolve(page);
    });

    const { result, rerender, unmount } = renderHook(
      ({ conversationId }: { conversationId: string }) =>
        useCommunicationConversation({ orgId: 'org-1', conversationId }),
      { initialProps: { conversationId: 'conv-a' } },
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.hasMore);
    void result.current.loadOlder();
    rerender({ conversationId: 'conv-b' });
    await waitForHook(() => result.current.events[0]?.content?.text === 'B');
    expect(result.current.paginationError).toBeNull();

    olderA.reject(new Error('pagination failed'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(result.current.paginationError).toBeNull();
  });

  it('detail 404 does not surface timeline error', async () => {
    vi.mocked(communicationClient.getConversation).mockRejectedValue(
      new CommunicationClientError('unknown', 'Not found', 404),
    );
    vi.mocked(communicationClient.listConversationEvents).mockRejectedValue(
      new CommunicationClientError('unknown', 'Timeline failed', 500),
    );

    const { result, unmount } = renderHook(() =>
      useCommunicationConversation({ orgId: 'org-1', conversationId: 'missing' }),
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.detailNotFound);
    expect(result.current.timelineError).toBeNull();
    expect(result.current.events).toEqual([]);
  });

  it('detail error does not appear under different conversation signature', async () => {
    vi.mocked(communicationClient.getConversation)
      .mockRejectedValueOnce(new CommunicationClientError('unknown', 'Server error', 500))
      .mockResolvedValueOnce(detail('conv-b', 'Conversation B'));

    const { result, rerender, unmount } = renderHook(
      ({ conversationId }: { conversationId: string }) =>
        useCommunicationConversation({ orgId: 'org-1', conversationId }),
      { initialProps: { conversationId: 'conv-a' } },
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.detailError === 'unknown');
    rerender({ conversationId: 'conv-b' });
    expect(result.current.detailError).toBeNull();
    await waitForHook(() => result.current.conversation?.displayLabel === 'Conversation B');
  });

  it('timeline error does not appear under different conversation signature', async () => {
    vi.mocked(communicationClient.getConversation).mockResolvedValue(detail('conv-b', 'Conversation B'));
    vi.mocked(communicationClient.listConversationEvents)
      .mockRejectedValueOnce(new CommunicationClientError('unknown', 'Timeline failed', 500))
      .mockResolvedValueOnce(timelineResponse([event('evt-b', 'B only')]));

    const { result, rerender, unmount } = renderHook(
      ({ conversationId }: { conversationId: string }) =>
        useCommunicationConversation({ orgId: 'org-1', conversationId }),
      { initialProps: { conversationId: 'conv-a' } },
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.timelineError === 'unknown');
    rerender({ conversationId: 'conv-b' });
    expect(result.current.timelineError).toBeNull();
    await waitForHook(() => result.current.events[0]?.content?.text === 'B only');
  });

  it('prepends older timeline page and dedupes overlapping events', async () => {
    const firstPage = timelineResponse([event('evt-c', 'C'), event('evt-d', 'D')], 'cursor-older', true);

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
  });

  it('stops pagination when cursor stalls on load older', async () => {
    vi.mocked(communicationClient.listConversationEvents)
      .mockResolvedValueOnce({
        items: [event('evt-1', 'One')],
        nextCursor: 'cursor-older',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [event('evt-1', 'One')],
        nextCursor: 'cursor-older',
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

  it('single-flights duplicate loadOlder for same cursor', async () => {
    const older = deferred<CommunicationEventListResponse>();
    const firstPage = timelineResponse([event('evt-1', 'One')], 'cursor-older', true);

    vi.mocked(communicationClient.listConversationEvents).mockImplementation((_org, _id, query) => {
      if (query?.cursor) return older.promise;
      return Promise.resolve(firstPage);
    });

    const { result, unmount } = renderHook(() =>
      useCommunicationConversation({ orgId: 'org-1', conversationId: 'conv-1' }),
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.hasMore);
    await act(async () => {
      void result.current.loadOlder();
    });
    void result.current.loadOlder();

    await act(async () => {
      older.resolve(timelineResponse([event('evt-old', 'Older')], null, false));
    });
    await waitForHook(() => !result.current.loadingOlder);

    const cursorCalls = vi
      .mocked(communicationClient.listConversationEvents)
      .mock.calls.filter((call) => call[2]?.cursor === 'cursor-older');
    expect(cursorCalls).toHaveLength(1);
  });
});
