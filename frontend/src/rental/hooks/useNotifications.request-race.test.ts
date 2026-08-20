// @vitest-environment happy-dom
import { act } from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../test/renderHook';
import { useNotifications } from './useNotifications';

vi.mock('../../lib/api', () => ({
  api: {
    notifications: {
      list: vi.fn(),
      counts: vi.fn(),
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

function listResponse(ids: string[], page = 1, totalPages = 1) {
  return {
    data: ids.map((id) => ({
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
    })),
    meta: { page, totalPages, total: ids.length * totalPages, limit: 50 },
  };
}

describe('useNotifications request identity (P32-F02)', () => {
  beforeEach(() => {
    vi.mocked(api.notifications.list).mockReset();
    vi.mocked(api.notifications.counts).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Test A: stale station A response does not overwrite station B after B resolves first', async () => {
    const stationA = deferred<ReturnType<typeof listResponse>>();
    const stationB = deferred<ReturnType<typeof listResponse>>();
    let call = 0;

    vi.mocked(api.notifications.list).mockImplementation(() => {
      call += 1;
      return call === 1 ? stationA.promise : stationB.promise;
    });

    const { result, rerender, unmount } = renderHook(
      ({ stationId }: { stationId: string }) =>
        useNotifications({
          orgId: 'org-1',
          locale: 'en',
          stationId,
          attentionScope: 'FLEET_READINESS',
          fetchCounts: false,
        }),
      { initialProps: { stationId: 'st-a' } },
    );

    await waitForHook(() => api.notifications.list.mock.calls.length >= 1);

    rerender({ stationId: 'st-b' });
    await waitForHook(() => api.notifications.list.mock.calls.length >= 2);

    stationB.resolve(listResponse(['notif-b']) as never);
    await waitForHook(() => result.current.loading === false);
    expect(result.current.apiRows.map((row) => row.id)).toEqual(['notif-b']);

    stationA.resolve(listResponse(['notif-a']) as never);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(result.current.apiRows.map((row) => row.id)).toEqual(['notif-b']);
    unmount();
  });

  it('Test B: stale station-A page-2 loadMore does not append after station B page-1', async () => {
    const page1A = deferred<ReturnType<typeof listResponse>>();
    const page2A = deferred<ReturnType<typeof listResponse>>();
    const page1B = deferred<ReturnType<typeof listResponse>>();

    vi.mocked(api.notifications.list).mockImplementation((_orgId, params) => {
      if (params?.stationId === 'st-a' && params.page === 1) return page1A.promise as never;
      if (params?.stationId === 'st-a' && params.page === 2) return page2A.promise as never;
      if (params?.stationId === 'st-b' && params.page === 1) return page1B.promise as never;
      return Promise.reject(new Error('unexpected list call')) as never;
    });

    const { result, rerender, unmount } = renderHook(
      ({ stationId }: { stationId: string }) =>
        useNotifications({
          orgId: 'org-1',
          locale: 'en',
          stationId,
          attentionScope: 'FLEET_READINESS',
          fetchCounts: false,
        }),
      { initialProps: { stationId: 'st-a' } },
    );

    await waitForHook(() => api.notifications.list.mock.calls.length >= 1);
    page1A.resolve(listResponse(['page1-a'], 1, 2) as never);
    await waitForHook(() => result.current.loading === false);
    expect(result.current.apiRows.map((row) => row.id)).toEqual(['page1-a']);

    act(() => {
      void result.current.loadMore();
    });

    rerender({ stationId: 'st-b' });
    await waitForHook(() =>
      api.notifications.list.mock.calls.some((call) => call[1]?.stationId === 'st-b'),
    );

    page1B.resolve(listResponse(['page1-b'], 1, 1) as never);
    await waitForHook(() => result.current.apiRows.map((row) => row.id).includes('page1-b'));

    page2A.resolve(listResponse(['page2-a'], 2, 2) as never);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(result.current.apiRows.map((row) => row.id)).toEqual(['page1-b']);
    unmount();
  });

  it('Test C: stale station-A error does not replace station-B success', async () => {
    const stationA = deferred<ReturnType<typeof listResponse>>();
    const stationB = deferred<ReturnType<typeof listResponse>>();
    let call = 0;

    vi.mocked(api.notifications.list).mockImplementation(() => {
      call += 1;
      return call === 1 ? stationA.promise : stationB.promise;
    });

    const { result, rerender, unmount } = renderHook(
      ({ stationId }: { stationId: string }) =>
        useNotifications({
          orgId: 'org-1',
          locale: 'en',
          stationId,
          attentionScope: 'OPERATIONS',
          fetchCounts: false,
        }),
      { initialProps: { stationId: 'st-a' } },
    );

    await waitForHook(() => api.notifications.list.mock.calls.length >= 1);
    rerender({ stationId: 'st-b' });
    await waitForHook(() => api.notifications.list.mock.calls.length >= 2);

    stationB.resolve(listResponse(['ops-b']) as never);
    await waitForHook(() => result.current.loading === false);
    expect(result.current.error).toBeNull();

    stationA.reject(new Error('station A failed'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(result.current.error).toBeNull();
    expect(result.current.apiRows.map((row) => row.id)).toEqual(['ops-b']);
    unmount();
  });

  it('Test D: stale request A resolves while B is pending — loading stays owned by B', async () => {
    const stationA = deferred<ReturnType<typeof listResponse>>();
    const stationB = deferred<ReturnType<typeof listResponse>>();
    let call = 0;

    vi.mocked(api.notifications.list).mockImplementation(() => {
      call += 1;
      return call === 1 ? stationA.promise : stationB.promise;
    });

    const { result, rerender, unmount } = renderHook(
      ({ stationId }: { stationId: string }) =>
        useNotifications({
          orgId: 'org-1',
          locale: 'en',
          stationId,
          attentionScope: 'FLEET_READINESS',
          fetchCounts: false,
        }),
      { initialProps: { stationId: 'st-a' } },
    );

    await waitForHook(() => result.current.loading === true);
    rerender({ stationId: 'st-b' });
    await waitForHook(() => api.notifications.list.mock.calls.length >= 2);
    expect(result.current.loading).toBe(true);
    expect(result.current.apiRows).toEqual([]);

    stationA.resolve(listResponse(['stale-a']) as never);
    await waitForHook(() => result.current.loading === true);
    expect(result.current.apiRows.map((row) => row.id)).toEqual([]);

    stationB.resolve(listResponse(['fresh-b']) as never);
    await waitForHook(() => result.current.loading === false);
    expect(result.current.apiRows.map((row) => row.id)).toEqual(['fresh-b']);
    unmount();
  });

  it('stale org-A response does not overwrite org-B rows after org-B resolves first', async () => {
    const orgA = deferred<ReturnType<typeof listResponse>>();
    const orgB = deferred<ReturnType<typeof listResponse>>();
    let call = 0;

    vi.mocked(api.notifications.list).mockImplementation(() => {
      call += 1;
      return call === 1 ? orgA.promise : orgB.promise;
    });

    const { result, rerender, unmount } = renderHook(
      ({ orgId }: { orgId: string }) =>
        useNotifications({
          orgId,
          locale: 'en',
          attentionScope: 'OPERATIONS',
          fetchCounts: false,
        }),
      { initialProps: { orgId: 'org-a' } },
    );

    await waitForHook(() => api.notifications.list.mock.calls.length >= 1);
    rerender({ orgId: 'org-b' });
    await waitForHook(() => api.notifications.list.mock.calls.length >= 2);

    orgB.resolve(listResponse(['ops-org-b']) as never);
    await waitForHook(() => result.current.loading === false);
    expect(result.current.apiRows.map((row) => row.id)).toEqual(['ops-org-b']);

    orgA.resolve(listResponse(['ops-org-a']) as never);
    await waitForHook(() => result.current.apiRows.map((row) => row.id).includes('ops-org-b'));
    expect(result.current.apiRows.map((row) => row.id)).toEqual(['ops-org-b']);
    unmount();
  });

  it('forwards stationId on each scoped request after station change', async () => {
    vi.mocked(api.notifications.list).mockResolvedValue(listResponse(['n-1']) as never);

    const { rerender, unmount } = renderHook(
      ({ stationId }: { stationId: string }) =>
        useNotifications({
          orgId: 'org-1',
          locale: 'en',
          stationId,
          attentionScope: 'OPERATIONS',
          fetchCounts: false,
        }),
      { initialProps: { stationId: 'st-a' } },
    );

    await waitForHook(() => api.notifications.list.mock.calls.length >= 1);
    rerender({ stationId: 'st-b' });
    await waitForHook(() =>
      api.notifications.list.mock.calls.some((call) => call[1]?.stationId === 'st-b'),
    );

    expect(api.notifications.list).toHaveBeenLastCalledWith(
      'org-1',
      expect.objectContaining({ stationId: 'st-b', attentionScope: 'OPERATIONS' }),
    );
    unmount();
  });
});
