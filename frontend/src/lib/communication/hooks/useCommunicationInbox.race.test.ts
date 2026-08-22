// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../../test/renderHook';
import { useCommunicationInbox } from './useCommunicationInbox';
import type {
  CommunicationConversationListItem,
  CommunicationConversationListResponse,
  CommunicationConversationSummary,
} from '../types';

vi.mock('../communication-client', () => ({
  communicationClient: {
    listConversations: vi.fn(),
    getConversationSummary: vi.fn(),
  },
  CommunicationClientError: class CommunicationClientError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
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

function row(id: string, label: string): CommunicationConversationListItem {
  return {
    id,
    channel: 'WHATSAPP',
    status: 'AI_ACTIVE',
    unreadCount: 1,
    lastActivityAt: '2026-08-22T10:00:00.000Z',
    displayLabel: label,
    lastMessagePreview: 'preview',
    customer: null,
    booking: null,
    vehicle: null,
    station: null,
    assignedUser: null,
    assignedAgent: null,
  };
}

function listResponse(
  items: CommunicationConversationListItem[],
  nextCursor: string | null = null,
  hasMore = false,
): CommunicationConversationListResponse {
  return { items, nextCursor, hasMore };
}

function summary(unreadConversations: number): CommunicationConversationSummary {
  return {
    totalUnreadMessages: unreadConversations,
    unreadConversations,
    unassigned: 0,
    requiresAttention: 0,
    byChannel: {},
  };
}

describe('useCommunicationInbox race hardening', () => {
  let unmountCurrent: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(communicationClient.listConversations).mockResolvedValue(
      listResponse([row('conv-1', 'Default customer')]),
    );
    vi.mocked(communicationClient.getConversationSummary).mockResolvedValue(summary(1));
  });

  afterEach(() => {
    unmountCurrent?.();
    unmountCurrent = null;
  });

  async function waitForLoaded(result: { current: ReturnType<typeof useCommunicationInbox> }) {
    await waitForHook(() => !result.current.loading && result.current.conversations.length > 0);
  }

  it('hides org A rows immediately after org switch before org B resolves', async () => {
    const orgA = deferred<CommunicationConversationListResponse>();
    const orgB = deferred<CommunicationConversationListResponse>();
    let call = 0;

    vi.mocked(communicationClient.listConversations).mockImplementation(() => {
      call += 1;
      return call === 1 ? orgA.promise : orgB.promise;
    });

    const { result, rerender, unmount } = renderHook(
      ({ orgId }: { orgId: string }) => useCommunicationInbox({ orgId, filters: {} }),
      { initialProps: { orgId: 'org-a' } },
    );
    unmountCurrent = unmount;

    await waitForHook(() => vi.mocked(communicationClient.listConversations).mock.calls.length >= 1);

    rerender({ orgId: 'org-b' });
    expect(result.current.conversations.map((item) => item.displayLabel)).toEqual([]);

    orgB.resolve(listResponse([row('conv-b', 'Org B customer')]));
    await waitForHook(() => result.current.conversations.some((item) => item.displayLabel === 'Org B customer'));
    expect(result.current.conversations.map((item) => item.displayLabel)).toEqual(['Org B customer']);

    orgA.resolve(listResponse([row('conv-a', 'Org A customer')]));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(result.current.conversations.map((item) => item.displayLabel)).toEqual(['Org B customer']);
  });

  it('hides stale summary counts after org switch', async () => {
    const summaryA = deferred<CommunicationConversationSummary>();
    const summaryB = deferred<CommunicationConversationSummary>();
    let summaryCall = 0;

    vi.mocked(communicationClient.getConversationSummary).mockImplementation(() => {
      summaryCall += 1;
      return summaryCall === 1 ? summaryA.promise : summaryB.promise;
    });

    const { result, rerender, unmount } = renderHook(
      ({ orgId }: { orgId: string }) => useCommunicationInbox({ orgId, filters: {} }),
      { initialProps: { orgId: 'org-a' } },
    );
    unmountCurrent = unmount;

    await waitForHook(() => vi.mocked(communicationClient.getConversationSummary).mock.calls.length >= 1);

    rerender({ orgId: 'org-b' });
    expect(result.current.summary).toBeNull();

    summaryB.resolve(summary(1));
    await waitForHook(() => result.current.summary?.unreadConversations === 1);
    expect(result.current.summary?.unreadConversations).toBe(1);

    summaryA.resolve(summary(9));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(result.current.summary?.unreadConversations).toBe(1);
  });

  it('hides WhatsApp rows while SMS filter response is pending', async () => {
    const whatsapp = deferred<CommunicationConversationListResponse>();
    const sms = deferred<CommunicationConversationListResponse>();
    let call = 0;

    vi.mocked(communicationClient.listConversations).mockImplementation(() => {
      call += 1;
      return call === 1 ? whatsapp.promise : sms.promise;
    });

    const { result, rerender, unmount } = renderHook(
      ({ filters }: { filters: { channel?: 'WHATSAPP' | 'SMS' } }) =>
        useCommunicationInbox({ orgId: 'org-1', filters }),
      { initialProps: { filters: { channel: 'WHATSAPP' } } },
    );
    unmountCurrent = unmount;

    await waitForHook(() => vi.mocked(communicationClient.listConversations).mock.calls.length >= 1);

    rerender({ filters: { channel: 'SMS' } });
    expect(result.current.conversations.map((item) => item.displayLabel)).toEqual([]);

    sms.resolve(listResponse([row('sms-b', 'SMS B')]));
    await waitForHook(() => result.current.conversations.some((item) => item.displayLabel === 'SMS B'));
    expect(result.current.conversations.map((item) => item.displayLabel)).toEqual(['SMS B']);

    whatsapp.resolve(listResponse([row('wa-a', 'WhatsApp A')]));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(result.current.conversations.map((item) => item.displayLabel)).toEqual(['SMS B']);
  });

  it('keeps newer summary when slower stale summary completes later', async () => {
    const summaryA = deferred<CommunicationConversationSummary>();
    const summaryB = deferred<CommunicationConversationSummary>();
    let summaryCall = 0;

    vi.mocked(communicationClient.getConversationSummary).mockImplementation(() => {
      summaryCall += 1;
      return summaryCall === 1 ? summaryA.promise : summaryB.promise;
    });

    const { result, rerender, unmount } = renderHook(
      ({ filters }: { filters: { search?: string } }) =>
        useCommunicationInbox({ orgId: 'org-1', filters }),
      { initialProps: { filters: { search: 'A' } } },
    );
    unmountCurrent = unmount;

    await waitForHook(() => vi.mocked(communicationClient.getConversationSummary).mock.calls.length >= 1);

    rerender({ filters: { search: 'B' } });
    expect(result.current.summary).toBeNull();

    summaryB.resolve(summary(2));
    await waitForHook(() => result.current.summary?.unreadConversations === 2);

    summaryA.resolve(summary(8));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(result.current.summary?.unreadConversations).toBe(2);
  });

  it('dedupes parallel loadMore calls for the same cursor', async () => {
    vi.mocked(communicationClient.listConversations)
      .mockResolvedValueOnce(listResponse([row('a', 'A')], 'page-2', true))
      .mockResolvedValueOnce(
        listResponse([row('a', 'A'), row('b', 'B')], null, false),
      );

    const { result, unmount } = renderHook(() =>
      useCommunicationInbox({ orgId: 'org-1', filters: {} }),
    );
    unmountCurrent = unmount;

    await waitForLoaded(result);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      const first = result.current.loadMore();
      const second = result.current.loadMore();
      await Promise.all([first, second]);
    });

    const cursorCalls = vi
      .mocked(communicationClient.listConversations)
      .mock.calls.filter((call) => call[1]?.cursor === 'page-2');
    expect(cursorCalls).toHaveLength(1);
    expect(result.current.conversations.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('retains page 1 rows when load more fails and appends after retry', async () => {
    vi.mocked(communicationClient.listConversations)
      .mockResolvedValueOnce(listResponse([row('a', 'A'), row('b', 'B')], 'page-2', true))
      .mockRejectedValueOnce(new CommunicationClientError('unknown', 'API error 500'))
      .mockResolvedValueOnce(listResponse([row('c', 'C')], null, false));

    const { result, unmount } = renderHook(() =>
      useCommunicationInbox({ orgId: 'org-1', filters: {} }),
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.conversations.length === 2);

    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.conversations.map((item) => item.id)).toEqual(['a', 'b']);
    expect(result.current.paginationError).toBe('unknown');

    await act(async () => {
      await result.current.retryLoadMore();
    });
    expect(result.current.conversations.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(result.current.paginationError).toBeNull();
  });

  it('stops pagination when backend cursor does not advance', async () => {
    vi.mocked(communicationClient.listConversations)
      .mockResolvedValueOnce(listResponse([row('a', 'A')], 'page-2', true))
      .mockResolvedValueOnce(listResponse([row('b', 'B')], 'page-2', true));

    const { result, unmount } = renderHook(() =>
      useCommunicationInbox({ orgId: 'org-1', filters: {} }),
    );
    unmountCurrent = unmount;

    await waitForLoaded(result);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.hasMore).toBe(false);
    expect(result.current.paginationError).toBe('unknown');
  });

  it('maps permission errors to permission_denied code', async () => {
    vi.mocked(communicationClient.listConversations).mockRejectedValue(
      new CommunicationClientError('permission_denied', 'API error 403'),
    );

    const { result, unmount } = renderHook(() =>
      useCommunicationInbox({ orgId: 'org-1', filters: {} }),
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.error === 'permission_denied');
    expect(result.current.conversations).toEqual([]);
  });
});
