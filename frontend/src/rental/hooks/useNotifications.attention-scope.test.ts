// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function listResponse(ids: string[], page = 1) {
  return {
    data: ids.map((id) => ({
      id,
      eventType: 'STATION_SHORTAGE',
      domain: 'OPERATIONS',
      severity: 'WARNING',
      status: 'OPEN',
      entity: { type: 'ORGANIZATION', id: 'org-1', displayLabel: 'Org' },
      titleKey: 'notification.stationShortage.title',
      bodyKey: 'notification.stationShortage.body',
      templateParams: {},
      action: { type: 'OPEN_DASHBOARD', target: {} },
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
    meta: { page, totalPages: 1, total: ids.length, limit: 50 },
  };
}

describe('useNotifications attentionScope', () => {
  beforeEach(() => {
    vi.mocked(api.notifications.list).mockReset();
    vi.mocked(api.notifications.counts).mockReset();
    vi.mocked(api.notifications.list).mockResolvedValue(listResponse(['n-1']) as never);
  });

  it('passes OPERATIONS attentionScope to api.notifications.list', async () => {
    const { result, unmount } = renderHook(() =>
      useNotifications({
        orgId: 'org-1',
        locale: 'de',
        attentionScope: 'OPERATIONS',
        stationId: 'st-1',
      }),
    );

    await waitForHook(() => result.current.loading === false);

    expect(api.notifications.list).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        attentionScope: 'OPERATIONS',
        stationId: 'st-1',
        activeOnly: true,
        page: 1,
      }),
    );
    expect(api.notifications.counts).not.toHaveBeenCalled();
    unmount();
  });

  it('passes FLEET_READINESS attentionScope to api.notifications.list', async () => {
    const { result, unmount } = renderHook(() =>
      useNotifications({
        orgId: 'org-1',
        locale: 'de',
        attentionScope: 'FLEET_READINESS',
        stationId: 'st-2',
      }),
    );

    await waitForHook(() => result.current.loading === false);

    expect(api.notifications.list).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        attentionScope: 'FLEET_READINESS',
        stationId: 'st-2',
        activeOnly: true,
        page: 1,
      }),
    );
    unmount();
  });

  it('refetches from page 1 when attentionScope changes (pagination reset)', async () => {
    vi.mocked(api.notifications.list)
      .mockResolvedValueOnce(listResponse(['ops-1']) as never)
      .mockResolvedValueOnce(listResponse(['fleet-1']) as never);

    const { result, rerender, unmount } = renderHook(
      ({ attentionScope }: { attentionScope: 'OPERATIONS' | 'FLEET_READINESS' }) =>
        useNotifications({
          orgId: 'org-1',
          locale: 'de',
          attentionScope,
          stationId: 'st-1',
        }),
      { initialProps: { attentionScope: 'OPERATIONS' as const } },
    );

    await waitForHook(() => result.current.loading === false);
    expect(result.current.items.map((item) => item.id)).toEqual(['ops-1']);
    expect(result.current.page).toBe(1);

    rerender({ attentionScope: 'FLEET_READINESS' });
    await waitForHook(() => result.current.items.some((item) => item.id === 'fleet-1'));

    expect(api.notifications.list).toHaveBeenLastCalledWith(
      'org-1',
      expect.objectContaining({
        attentionScope: 'FLEET_READINESS',
        page: 1,
      }),
    );
    expect(result.current.items.map((item) => item.id)).toEqual(['fleet-1']);
    expect(result.current.page).toBe(1);
    unmount();
  });
});
