// @vitest-environment happy-dom
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../../test/renderHook';
import { useTaskList } from './useTaskList';

const listPage = vi.fn();
const list = vi.fn();

vi.mock('../../api', () => ({
  api: {
    tasks: {
      listPage: (...args: unknown[]) => listPage(...args),
      list: (...args: unknown[]) => list(...args),
    },
  },
}));

vi.mock('../invalidate', () => ({
  matchesTaskListInvalidation: () => false,
  subscribeTaskQueryInvalidation: () => () => undefined,
}));

function page(ids: string[], nextCursor: string | null = null) {
  return {
    data: ids.map((id) => ({
      id,
      organizationId: 'org-1',
      title: id,
      description: '',
      category: '',
      type: 'CUSTOM',
      status: 'OPEN',
      priority: 'NORMAL',
      source: null,
      sourceType: 'MANUAL',
      dedupKey: null,
      vehicleId: null,
      bookingId: null,
      customerId: null,
      vendorId: null,
      alertId: null,
      documentId: null,
      fineId: null,
      invoiceId: null,
      serviceCaseId: null,
      assignedUserId: null,
      estimatedCostCents: null,
      actualCostCents: null,
      resolutionNote: null,
      blocksVehicleAvailability: false,
      metadata: null,
      isOverdue: false,
      dueDate: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    })),
    meta: { limit: 50, nextCursor },
  };
}

describe('useTaskList', () => {
  beforeEach(() => {
    listPage.mockReset();
    list.mockReset();
  });

  it('loads the initial page and exposes hasMore', async () => {
    listPage.mockResolvedValueOnce(page(['t-1', 't-2'], 'cursor-2'));

    const { result, unmount } = renderHook(() =>
      useTaskList({ orgId: 'org-1', filters: { vehicleId: 'veh-1' }, paginated: true }),
    );

    await waitForHook(() => result.current.loading === false);
    expect(result.current.tasks.map((task) => task.id)).toEqual(['t-1', 't-2']);
    expect(result.current.hasMore).toBe(true);
    expect(listPage).toHaveBeenCalledWith('org-1', expect.objectContaining({ vehicleId: 'veh-1', limit: 50 }));
    unmount();
  });

  it('loads more without duplicating task ids', async () => {
    listPage
      .mockResolvedValueOnce(page(['t-1'], 'cursor-2'))
      .mockResolvedValueOnce(page(['t-1', 't-2'], null));

    const { result, unmount } = renderHook(() => useTaskList({ orgId: 'org-1', paginated: true }));

    await waitForHook(() => result.current.loading === false);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.tasks.map((task) => task.id)).toEqual(['t-1', 't-2']);
    expect(result.current.hasMore).toBe(false);
    unmount();
  });

  it('resets to the first page when filters change', async () => {
    listPage
      .mockResolvedValueOnce(page(['veh-a'], 'cursor-a'))
      .mockResolvedValueOnce(page(['veh-b'], null));

    const { result, rerender, unmount } = renderHook(
      ({ vehicleId }: { vehicleId: string }) =>
        useTaskList({ orgId: 'org-1', filters: { vehicleId }, paginated: true }),
      { initialProps: { vehicleId: 'veh-a' } },
    );

    await waitForHook(() => result.current.tasks[0]?.id === 'veh-a');

    rerender({ vehicleId: 'veh-b' });

    await waitForHook(() => result.current.tasks[0]?.id === 'veh-b');
    expect(result.current.hasMore).toBe(false);
    unmount();
  });

  it('keeps stale tasks visible when reload fails', async () => {
    listPage.mockResolvedValueOnce(page(['t-1'], null)).mockRejectedValueOnce(new Error('network down'));

    const { result, unmount } = renderHook(() => useTaskList({ orgId: 'org-1', paginated: true }));

    await waitForHook(() => result.current.tasks.length === 1);

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.tasks.map((task) => task.id)).toEqual(['t-1']);
    expect(result.current.isStale).toBe(true);
    expect(result.current.error).toBe('network down');
    unmount();
  });

  it('surfaces load-more errors separately from the initial page error', async () => {
    listPage.mockResolvedValueOnce(page(['t-1'], 'cursor-2')).mockRejectedValueOnce(new Error('page 2 failed'));

    const { result, unmount } = renderHook(() => useTaskList({ orgId: 'org-1', paginated: true }));

    await waitForHook(() => result.current.loading === false);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.tasks.map((task) => task.id)).toEqual(['t-1']);
    expect(result.current.loadMoreError).toBe('page 2 failed');
    expect(result.current.error).toBeNull();
    unmount();
  });
});
