// @vitest-environment happy-dom
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../../test/renderHook';
import { useServiceCaseList } from './useServiceCaseList';

const listPage = vi.fn();
const list = vi.fn();

vi.mock('../../api', () => ({
  api: {
    serviceCases: {
      listPage: (...args: unknown[]) => listPage(...args),
      list: (...args: unknown[]) => list(...args),
    },
  },
}));

vi.mock('../invalidate', () => ({
  matchesServiceCaseListInvalidation: () => false,
  subscribeServiceCaseQueryInvalidation: () => () => undefined,
}));

function page(ids: string[], nextCursor: string | null = null) {
  return {
    data: ids.map((id) => ({
      id,
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      vendorId: null,
      title: id,
      description: '',
      category: 'SERVICE',
      status: 'OPEN',
      priority: 'NORMAL',
      source: 'MANUAL',
      openedAt: '2026-07-01T00:00:00.000Z',
      scheduledAt: null,
      expectedReadyAt: null,
      completedAt: null,
      cancelledAt: null,
      estimatedCostCents: null,
      actualCostCents: null,
      downtimeStart: null,
      downtimeEnd: null,
      blocksRental: false,
      completionNotes: null,
      documentId: null,
      metadata: null,
      createdByUserId: null,
      updatedByUserId: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      taskCount: 0,
    })),
    meta: { limit: 50, nextCursor },
  };
}

describe('useServiceCaseList', () => {
  beforeEach(() => {
    listPage.mockReset();
    list.mockReset();
  });

  it('loads the initial page and exposes hasMore', async () => {
    listPage.mockResolvedValueOnce(page(['sc-1', 'sc-2'], 'cursor-2'));

    const { result, unmount } = renderHook(() =>
      useServiceCaseList({
        orgId: 'org-1',
        filters: { status: 'OPEN', vehicleId: 'veh-1' },
        paginated: true,
      }),
    );

    await waitForHook(() => result.current.loading === false);
    expect(result.current.serviceCases.map((row) => row.id)).toEqual(['sc-1', 'sc-2']);
    expect(result.current.hasMore).toBe(true);
    expect(listPage).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ status: 'OPEN', vehicleId: 'veh-1', limit: 50 }),
    );
    unmount();
  });

  it('loads more without duplicating ids', async () => {
    listPage
      .mockResolvedValueOnce(page(['sc-1'], 'cursor-2'))
      .mockResolvedValueOnce(page(['sc-1', 'sc-2'], null));

    const { result, unmount } = renderHook(() =>
      useServiceCaseList({ orgId: 'org-1', paginated: true }),
    );

    await waitForHook(() => result.current.loading === false);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.serviceCases.map((row) => row.id)).toEqual(['sc-1', 'sc-2']);
    expect(result.current.hasMore).toBe(false);
    unmount();
  });

  it('resets when filters change', async () => {
    listPage
      .mockResolvedValueOnce(page(['veh-a'], 'cursor-a'))
      .mockResolvedValueOnce(page(['veh-b'], null));

    const { result, rerender, unmount } = renderHook(
      ({ vehicleId }: { vehicleId: string }) =>
        useServiceCaseList({ orgId: 'org-1', filters: { vehicleId }, paginated: true }),
      { initialProps: { vehicleId: 'veh-a' } },
    );

    await waitForHook(() => result.current.serviceCases[0]?.id === 'veh-a');
    rerender({ vehicleId: 'veh-b' });
    await waitForHook(() => result.current.serviceCases[0]?.id === 'veh-b');
    unmount();
  });

  it('keeps stale rows visible when reload fails', async () => {
    listPage.mockResolvedValueOnce(page(['sc-1'], null)).mockRejectedValueOnce(new Error('network down'));

    const { result, unmount } = renderHook(() =>
      useServiceCaseList({ orgId: 'org-1', paginated: true }),
    );

    await waitForHook(() => result.current.serviceCases.length === 1);

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.serviceCases.map((row) => row.id)).toEqual(['sc-1']);
    expect(result.current.isStale).toBe(true);
    expect(result.current.error).toBe('network down');
    unmount();
  });

  it('surfaces load-more errors separately', async () => {
    listPage.mockResolvedValueOnce(page(['sc-1'], 'cursor-2')).mockRejectedValueOnce(new Error('page 2 failed'));

    const { result, unmount } = renderHook(() =>
      useServiceCaseList({ orgId: 'org-1', paginated: true }),
    );

    await waitForHook(() => result.current.loading === false);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.serviceCases.map((row) => row.id)).toEqual(['sc-1']);
    expect(result.current.loadMoreError).toBe('page 2 failed');
    expect(result.current.error).toBeNull();
    unmount();
  });
});
