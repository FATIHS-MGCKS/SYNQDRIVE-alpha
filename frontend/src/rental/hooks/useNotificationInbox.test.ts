// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook, waitForHook } from '../../test/renderHook';
import type { ApiNotificationResponse } from '../lib/notifications/notification-api.types';
import { buildNotificationInboxScopeParams } from '../lib/notifications/notification-inbox-query';

vi.mock('../lib/notifications/notification-client', () => ({
  notificationClient: {
    list: vi.fn(),
    counts: vi.fn(),
    markRead: vi.fn(),
    markUnread: vi.fn(),
    acknowledge: vi.fn(),
    snooze: vi.fn(),
    unsnooze: vi.fn(),
    resolve: vi.fn(),
    archive: vi.fn(),
  },
  NotificationClientError: class NotificationClientError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'NotificationClientError';
    }
  },
}));

import { notificationClient } from '../lib/notifications/notification-client';
import { useNotificationInbox } from './useNotificationInbox';

function apiRow(id: string, overrides: Partial<ApiNotificationResponse> = {}): ApiNotificationResponse {
  return {
    id,
    eventType: 'TEST_EVENT',
    domain: 'OPERATIONS',
    severity: 'WARNING',
    status: 'OPEN',
    entity: { type: 'FLEET', id: 'fleet-1' },
    titleKey: 'notification.test.title',
    bodyKey: 'notification.test.body',
    templateParams: { label: 'Test' },
    action: { type: 'OPEN_RENTAL', target: {} },
    source: { type: 'test', ref: 'test' },
    firstSeenAt: '2026-07-10T08:00:00.000Z',
    lastSeenAt: '2026-07-10T10:00:00.000Z',
    occurrenceCount: 1,
    resolvedAt: null,
    expiresAt: null,
    createdAt: '2026-07-10T08:00:00.000Z',
    updatedAt: '2026-07-10T10:00:00.000Z',
    userReceipt: {
      readAt: null,
      acknowledgedAt: null,
      snoozedUntil: null,
      hiddenAt: null,
    },
    availableActions: ['read'],
    ...overrides,
  };
}

const activeScope = buildNotificationInboxScopeParams('active');

describe('useNotificationInbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notificationClient.list).mockResolvedValue({
      data: [apiRow('n-1'), apiRow('n-2')],
      meta: { limit: 50, nextCursor: null },
    });
    vi.mocked(notificationClient.counts).mockResolvedValue({
      totalActive: 2,
      unread: 2,
      critical: 0,
      warning: 2,
      info: 0,
      resolvedRecent: 0,
      byDomain: { OPERATIONS: 2 },
    });
  });

  it('loads list and counts with matching active scope', async () => {
    const { result, unmount } = renderHook(() =>
      useNotificationInbox({ orgId: 'org-1', locale: 'de', enabled: true }),
    );

    await waitForHook(() => !result.current.loading);

    expect(notificationClient.list).toHaveBeenCalledWith('org-1', expect.objectContaining(activeScope));
    expect(notificationClient.counts).toHaveBeenCalledWith('org-1', expect.objectContaining(activeScope));
    expect(result.current.items).toHaveLength(2);
    expect(result.current.tabCounts.all).toBe(2);
    expect(result.current.primaryTabCounts.warning).toBe(2);
    unmount();
  });

  it('does not duplicate notification ids across cursor pages', async () => {
    vi.mocked(notificationClient.list)
      .mockResolvedValueOnce({
        data: [apiRow('n-1'), apiRow('n-2')],
        meta: { limit: 50, nextCursor: 'cursor-2' },
      })
      .mockResolvedValueOnce({
        data: [apiRow('n-2'), apiRow('n-3')],
        meta: { limit: 50, nextCursor: null },
      });

    const { result, unmount } = renderHook(() =>
      useNotificationInbox({ orgId: 'org-1', locale: 'de', enabled: true }),
    );

    await waitForHook(() => !result.current.loading);
    await result.current.loadMore();
    await waitForHook(() => result.current.items.length === 3);

    const ids = result.current.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(3);
    unmount();
  });

  it('applies read state optimistically from userReceipt only', async () => {
    const readAt = '2026-07-10T12:00:00.000Z';
    vi.mocked(notificationClient.markRead).mockResolvedValue(
      apiRow('n-1', {
        userReceipt: {
          readAt,
          acknowledgedAt: null,
          snoozedUntil: null,
          hiddenAt: null,
        },
      }),
    );

    const { result, unmount } = renderHook(() =>
      useNotificationInbox({ orgId: 'org-1', locale: 'de', enabled: true }),
    );

    await waitForHook(() => !result.current.loading);
    await act(async () => {
      await result.current.markRead('n-1');
    });
    await waitForHook(() => result.current.apiRows.find((r) => r.id === 'n-1')?.userReceipt.readAt === readAt);

    const row = result.current.apiRows.find((r) => r.id === 'n-1');
    expect(row?.userReceipt.readAt).toBe(readAt);
    expect(row?.status).toBe('OPEN');
    unmount();
  });

  it('removes resolved notifications from active list after server success', async () => {
    vi.mocked(notificationClient.resolve).mockResolvedValue(
      apiRow('n-1', { status: 'RESOLVED', resolvedAt: '2026-07-10T12:00:00.000Z' }),
    );

    const { result, unmount } = renderHook(() =>
      useNotificationInbox({ orgId: 'org-1', locale: 'de', enabled: true }),
    );

    await waitForHook(() => !result.current.loading);
    await act(async () => {
      await result.current.resolveNotification('n-1');
    });
    await waitForHook(() => !result.current.items.some((item) => item.id === 'n-1'));

    expect(result.current.items.some((item) => item.id === 'n-1')).toBe(false);
    expect(notificationClient.counts).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('surfaces errors and supports retry', async () => {
    vi.mocked(notificationClient.list).mockRejectedValueOnce(
      Object.assign(new Error('API error 503'), { status: 503 }),
    );
    vi.mocked(notificationClient.list).mockResolvedValueOnce({
      data: [apiRow('n-1')],
      meta: { limit: 50, nextCursor: null },
    });

    const { result, unmount } = renderHook(() =>
      useNotificationInbox({ orgId: 'org-1', locale: 'de', enabled: true }),
    );

    await waitForHook(() => result.current.error != null);
    expect(result.current.items).toHaveLength(0);

    await result.current.retry();
    await waitForHook(() => result.current.items.length === 1);
    expect(result.current.error).toBeNull();
    unmount();
  });

  it('uses resolved scope when list mode is resolved', async () => {
    const { result, unmount } = renderHook(() =>
      useNotificationInbox({ orgId: 'org-1', locale: 'de', enabled: true }),
    );

    await waitForHook(() => !result.current.loading);
    await act(() => {
      result.current.setListMode('resolved');
    });
    await waitForHook(() =>
      vi.mocked(notificationClient.list).mock.calls.some((call) => call[1]?.resolvedOnly === true),
    );

    const lastListCall = vi.mocked(notificationClient.list).mock.calls.at(-1);
    expect(lastListCall?.[1]).toMatchObject({
      resolvedOnly: true,
      timeField: 'resolvedAt',
    });
    expect(lastListCall?.[1]?.from).toEqual(expect.any(String));
    unmount();
  });
});
