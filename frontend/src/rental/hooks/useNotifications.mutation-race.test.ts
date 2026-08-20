// @vitest-environment happy-dom
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../test/renderHook';
import { useNotifications } from './useNotifications';

vi.mock('../../lib/api', () => ({
  api: {
    notifications: {
      list: vi.fn(),
      counts: vi.fn(),
      markRead: vi.fn(),
    },
  },
}));

import { api } from '../../lib/api';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function listRow(id: string) {
  return {
    id,
    eventType: 'TIRE_CRITICAL',
    domain: 'vehicle-health',
    severity: 'WARNING',
    status: 'OPEN',
    entity: { type: 'VEHICLE', id: 'veh-1', displayLabel: 'WOB L 1' },
    titleKey: 'notification.tireCritical.title',
    bodyKey: 'notification.tireCritical.body',
    templateParams: {},
    action: { type: 'OPEN_VEHICLE', target: { vehicleId: 'veh-1' } },
    source: { type: 'runtime', ref: 'test' },
    firstSeenAt: '2026-08-20T00:00:00.000Z',
    lastSeenAt: '2026-08-20T00:00:00.000Z',
    occurrenceCount: 1,
    resolvedAt: null,
    expiresAt: null,
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    userReceipt: {
      readAt: null,
      acknowledgedAt: null,
      snoozedUntil: null,
      hiddenAt: null,
    },
    availableActions: ['read'],
  };
}

function listResponse(ids: string[]) {
  return {
    data: ids.map(listRow),
    meta: { page: 1, totalPages: 1, total: ids.length, limit: 50 },
  };
}

describe('useNotifications mutation request identity', () => {
  beforeEach(() => {
    vi.mocked(api.notifications.list).mockReset();
    vi.mocked(api.notifications.counts).mockReset();
    vi.mocked(api.notifications.markRead).mockReset();
    vi.mocked(api.notifications.counts).mockResolvedValue({
      totalActive: 1,
      unread: 1,
      critical: 0,
      warning: 1,
      info: 0,
      resolvedRecent: 0,
      byDomain: {},
    } as never);
  });

  it('stale mutation rollback does not restore rows after station switch', async () => {
    const pageA = deferred<ReturnType<typeof listResponse>>();
    const pageB = deferred<ReturnType<typeof listResponse>>();
    const markReadReq = deferred<ReturnType<typeof listRow>>();

    vi.mocked(api.notifications.list).mockImplementation((_orgId, params) => {
      if (params?.stationId === 'st-a') return pageA.promise as never;
      if (params?.stationId === 'st-b') return pageB.promise as never;
      return Promise.reject(new Error('unexpected list call')) as never;
    });
    vi.mocked(api.notifications.markRead).mockImplementation(() => markReadReq.promise as never);

    const { result, rerender, unmount } = renderHook(
      ({ stationId }: { stationId: string }) =>
        useNotifications({
          orgId: 'org-1',
          locale: 'en',
          stationId,
          fetchCounts: true,
        }),
      { initialProps: { stationId: 'st-a' } },
    );

    pageA.resolve(listResponse(['notif-a']));
    await waitForHook(() => result.current.apiRows.map((row) => row.id).includes('notif-a'));

    act(() => {
      void result.current.markRead('notif-a');
    });

    rerender({ stationId: 'st-b' });
    await waitForHook(() =>
      api.notifications.list.mock.calls.some((call) => call[1]?.stationId === 'st-b'),
    );

    pageB.resolve(listResponse(['notif-b']));
    await waitForHook(() => result.current.apiRows.map((row) => row.id).includes('notif-b'));

    markReadReq.reject(new Error('mark read failed'));
    await waitForHook(() => result.current.mutation.id === null);

    expect(result.current.apiRows.map((row) => row.id)).toEqual(['notif-b']);
    expect(result.current.apiRows[0]?.userReceipt?.readAt).toBeNull();
    unmount();
  });

  it('stale mutation success does not patch rows after station switch', async () => {
    const pageA = deferred<ReturnType<typeof listResponse>>();
    const pageB = deferred<ReturnType<typeof listResponse>>();
    const markReadReq = deferred<ReturnType<typeof listRow>>();

    vi.mocked(api.notifications.list).mockImplementation((_orgId, params) => {
      if (params?.stationId === 'st-a') return pageA.promise as never;
      if (params?.stationId === 'st-b') return pageB.promise as never;
      return Promise.reject(new Error('unexpected list call')) as never;
    });
    vi.mocked(api.notifications.markRead).mockImplementation(() => markReadReq.promise as never);

    const { result, rerender, unmount } = renderHook(
      ({ stationId }: { stationId: string }) =>
        useNotifications({
          orgId: 'org-1',
          locale: 'en',
          stationId,
          fetchCounts: false,
        }),
      { initialProps: { stationId: 'st-a' } },
    );

    pageA.resolve(listResponse(['notif-a']));
    await waitForHook(() => result.current.apiRows.map((row) => row.id).includes('notif-a'));

    act(() => {
      void result.current.markRead('notif-a');
    });

    rerender({ stationId: 'st-b' });
    await waitForHook(() =>
      api.notifications.list.mock.calls.some((call) => call[1]?.stationId === 'st-b'),
    );

    pageB.resolve(listResponse(['notif-b']));
    await waitForHook(() => result.current.apiRows.map((row) => row.id).includes('notif-b'));

    markReadReq.resolve({
      ...listRow('notif-a'),
      userReceipt: {
        readAt: '2026-08-20T01:00:00.000Z',
        acknowledgedAt: null,
        snoozedUntil: null,
        hiddenAt: null,
      },
    });
    await waitForHook(() => result.current.mutation.id === null);

    expect(result.current.apiRows.map((row) => row.id)).toEqual(['notif-b']);
    expect(result.current.apiRows[0]?.userReceipt?.readAt).toBeNull();
    unmount();
  });

  it('stale mutation count refresh does not commit after org switch', async () => {
    const pageA = deferred<ReturnType<typeof listResponse>>();
    const pageB = deferred<ReturnType<typeof listResponse>>();
    const markReadReq = deferred<ReturnType<typeof listRow>>();
    const countsA = { totalActive: 9, unread: 4, critical: 1, warning: 3, info: 0, resolvedRecent: 0, byDomain: {} };
    const countsB = { totalActive: 2, unread: 1, critical: 0, warning: 1, info: 0, resolvedRecent: 0, byDomain: {} };
    const countsStale = { totalActive: 99, unread: 99, critical: 99, warning: 99, info: 99, resolvedRecent: 99, byDomain: {} };

    vi.mocked(api.notifications.list).mockImplementation((_orgId, params) => {
      if (params?.page === 1 && _orgId === 'org-a') return pageA.promise as never;
      if (params?.page === 1 && _orgId === 'org-b') return pageB.promise as never;
      return Promise.reject(new Error('unexpected list call')) as never;
    });
    vi.mocked(api.notifications.counts).mockImplementation((orgId) => {
      if (orgId === 'org-a') return Promise.resolve(countsA as never);
      if (orgId === 'org-b') return Promise.resolve(countsB as never);
      return Promise.resolve(countsStale as never);
    });
    vi.mocked(api.notifications.markRead).mockImplementation(() => markReadReq.promise as never);

    const { result, rerender, unmount } = renderHook(
      ({ orgId }: { orgId: string }) =>
        useNotifications({
          orgId,
          locale: 'en',
          fetchCounts: true,
        }),
      { initialProps: { orgId: 'org-a' } },
    );

    pageA.resolve(listResponse(['notif-a']));
    await waitForHook(() => result.current.tabCounts.all === 9);

    act(() => {
      void result.current.markRead('notif-a');
    });

    rerender({ orgId: 'org-b' });
    await waitForHook(() => api.notifications.list.mock.calls.some((call) => call[0] === 'org-b'));

    pageB.resolve(listResponse(['notif-b']));
    await waitForHook(() => result.current.tabCounts.all === 2);

    markReadReq.resolve({
      ...listRow('notif-a'),
      userReceipt: {
        readAt: '2026-08-20T01:00:00.000Z',
        acknowledgedAt: null,
        snoozedUntil: null,
        hiddenAt: null,
      },
    });
    await waitForHook(() => result.current.mutation.id === null);

    expect(result.current.tabCounts.all).toBe(2);
    unmount();
  });
});
