// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../../test/renderHook';
import { useCommunicationInbox } from './useCommunicationInbox';
import { CommunicationInboxList } from '../../../rental/components/communication-center/CommunicationInboxList';
import { DEFAULT_COMMUNICATION_INBOX_FILTERS } from '../../../rental/components/communication-center/communication-inbox-state';
import { LanguageProvider } from '../../../rental/i18n/LanguageContext';
import type {
  CommunicationConversationListItem,
  CommunicationConversationListResponse,
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
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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
): CommunicationConversationListResponse {
  return { items, nextCursor: null, hasMore: false };
}

function InboxHarness({
  orgId,
  filters = {},
}: {
  orgId: string;
  filters?: { channel?: 'WHATSAPP' | 'SMS' };
}) {
  const inbox = useCommunicationInbox({ orgId, filters });
  return createElement(CommunicationInboxList, {
    conversations: inbox.conversations,
    selectedConversationId: null,
    filters: DEFAULT_COMMUNICATION_INBOX_FILTERS,
    activeChannel: 'all',
    locale: 'en',
    loading: inbox.loading,
    loadingMore: inbox.loadingMore,
    hasMore: inbox.hasMore,
    error: inbox.error,
    paginationError: inbox.paginationError,
    onSelect: () => undefined,
    onRetry: () => void inbox.reload(),
    onLoadMore: () => void inbox.loadMore(),
    onRetryLoadMore: () => void inbox.retryLoadMore(),
    onClearFilters: () => undefined,
  });
}

describe('useCommunicationInbox error-state convergence', () => {
  let unmountCurrent: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(communicationClient.getConversationSummary).mockResolvedValue({
      totalUnreadMessages: 0,
      unreadConversations: 0,
      unassigned: 0,
      requiresAttention: 0,
      byChannel: {},
    });
  });

  afterEach(() => {
    unmountCurrent?.();
    unmountCurrent = null;
  });

  it('converges initial 403 to loading=false with permission_denied error', async () => {
    vi.mocked(communicationClient.listConversations).mockRejectedValue(
      new CommunicationClientError('permission_denied', 'API error 403: forbidden'),
    );

    const { result, unmount } = renderHook(() => useCommunicationInbox({ orgId: 'org-1', filters: {} }));
    unmountCurrent = unmount;

    await waitForHook(() => result.current.error === 'permission_denied');
    expect(result.current.loading).toBe(false);
    expect(result.current.conversations).toEqual([]);
  });

  it('converges initial network error and recovers on retry', async () => {
    vi.mocked(communicationClient.listConversations)
      .mockRejectedValueOnce(new CommunicationClientError('network', 'network down'))
      .mockResolvedValueOnce(listResponse([row('a', 'Customer A')]));

    const { result, unmount } = renderHook(() => useCommunicationInbox({ orgId: 'org-1', filters: {} }));
    unmountCurrent = unmount;

    await waitForHook(() => result.current.error === 'network');
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await result.current.reload();
    });

    await waitForHook(() => result.current.conversations.length === 1);
    expect(result.current.error).toBeNull();
    expect(result.current.conversations[0]?.displayLabel).toBe('Customer A');
  });

  it('shows loading during filter switch and SMS failure without resurrecting WhatsApp rows', async () => {
    const whatsapp = deferred<CommunicationConversationListResponse>();
    const smsFail = deferred<CommunicationConversationListResponse>();

    vi.mocked(communicationClient.listConversations).mockImplementation(() => {
      if (vi.mocked(communicationClient.listConversations).mock.calls.length === 1) {
        return whatsapp.promise;
      }
      return smsFail.promise;
    });

    const { result, rerender, unmount } = renderHook(
      ({ filters }: { filters: { channel?: 'WHATSAPP' | 'SMS' } }) =>
        useCommunicationInbox({ orgId: 'org-1', filters }),
      { initialProps: { filters: { channel: 'WHATSAPP' } } },
    );
    unmountCurrent = unmount;

    whatsapp.resolve(listResponse([row('wa-a', 'WhatsApp A')]));
    await waitForHook(() => result.current.conversations.some((item) => item.displayLabel === 'WhatsApp A'));

    rerender({ filters: { channel: 'SMS' } });
    expect(result.current.conversations).toEqual([]);
    expect(result.current.loading).toBe(true);

    smsFail.reject(new CommunicationClientError('unknown', 'API error 500'));
    await waitForHook(() => result.current.error === 'unknown');
    expect(result.current.loading).toBe(false);
    expect(result.current.conversations).toEqual([]);
    expect(result.current.conversations.some((item) => item.displayLabel === 'WhatsApp A')).toBe(false);
  });

  it('hides Org A immediately and converges Org B failure without infinite loading', async () => {
    const orgA = deferred<CommunicationConversationListResponse>();
    const orgBFail = deferred<CommunicationConversationListResponse>();

    vi.mocked(communicationClient.listConversations).mockImplementation(() => {
      if (vi.mocked(communicationClient.listConversations).mock.calls.length === 1) {
        return orgA.promise;
      }
      return orgBFail.promise;
    });

    const { result, rerender, unmount } = renderHook(
      ({ orgId }: { orgId: string }) => useCommunicationInbox({ orgId, filters: {} }),
      { initialProps: { orgId: 'org-a' } },
    );
    unmountCurrent = unmount;

    orgA.resolve(listResponse([row('org-a', 'Org A customer')]));
    await waitForHook(() => result.current.conversations.some((item) => item.displayLabel === 'Org A customer'));

    rerender({ orgId: 'org-b' });
    expect(result.current.conversations).toEqual([]);
    expect(result.current.summary).toBeNull();
    expect(result.current.loading).toBe(true);

    orgBFail.reject(new CommunicationClientError('network', 'network down'));
    await waitForHook(() => result.current.error === 'network');
    expect(result.current.loading).toBe(false);
    expect(result.current.conversations).toEqual([]);
    expect(result.current.conversations.some((item) => item.displayLabel === 'Org A customer')).toBe(false);
  });

  it('retains same-query rows when refresh fails', async () => {
    vi.mocked(communicationClient.listConversations)
      .mockResolvedValueOnce(listResponse([row('a', 'Customer A')]))
      .mockRejectedValueOnce(new CommunicationClientError('network', 'network down'));

    const { result, unmount } = renderHook(() => useCommunicationInbox({ orgId: 'org-1', filters: {} }));
    unmountCurrent = unmount;

    await waitForHook(() => result.current.conversations.length === 1);

    await act(async () => {
      await result.current.reload();
    });

    await waitForHook(() => result.current.error === 'network');
    expect(result.current.loading).toBe(false);
    expect(result.current.conversations.map((item) => item.displayLabel)).toEqual(['Customer A']);
    expect(result.current.isStale).toBe(true);
  });
});

describe('CommunicationInboxList rendered error states', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.setItem('synqdrive.locale', 'en');
    vi.clearAllMocks();
    vi.mocked(communicationClient.getConversationSummary).mockResolvedValue({
      totalUnreadMessages: 0,
      unreadConversations: 0,
      unassigned: 0,
      requiresAttention: 0,
      byChannel: {},
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders permission-denied surface after initial 403 (no endless skeleton)', async () => {
    vi.mocked(communicationClient.listConversations).mockRejectedValue(
      new CommunicationClientError('permission_denied', 'API error 403: Prisma forbidden stack'),
    );

    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(InboxHarness, { orgId: 'org-1' })));
    });

    expect(container.querySelector('[data-testid="communication-inbox-skeleton"]')).not.toBeNull();

    await waitForHook(() =>
      container.querySelector('[data-testid="communication-inbox-permission-denied"]') !== null,
    );

    expect(container.querySelector('[data-testid="communication-inbox-skeleton"]')).toBeNull();
    expect(container.textContent).toContain('You do not have permission to view conversations');
    expect(container.textContent).not.toContain('Prisma');
    expect(
      container.querySelector('[data-testid="communication-inbox-permission-denied"] button'),
    ).toBeNull();
  });

  it('renders safe network error with retry and recovers to rows', async () => {
    vi.mocked(communicationClient.listConversations)
      .mockRejectedValueOnce(new CommunicationClientError('network', 'socket hang up'))
      .mockResolvedValueOnce(listResponse([row('a', 'Customer A')]));

    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(InboxHarness, { orgId: 'org-1' })));
    });

    await waitForHook(() => container.querySelector('[data-testid="communication-inbox-error"]') !== null);
    expect(container.querySelector('[data-testid="communication-inbox-skeleton"]')).toBeNull();
    expect(container.textContent).toContain('Connection failed');
    expect(container.textContent).not.toContain('socket hang up');

    const retryButton = container.querySelector('[data-testid="communication-inbox-error"] button');
    expect(retryButton).not.toBeNull();

    await act(async () => {
      retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitForHook(() => container.textContent?.includes('Customer A') ?? false);
    expect(container.querySelector('[data-testid="communication-inbox-error"]')).toBeNull();
  });
});
