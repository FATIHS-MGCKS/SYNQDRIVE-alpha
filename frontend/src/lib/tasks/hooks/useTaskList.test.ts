// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../../test/renderHook';
import { invalidateTaskQueries } from '../invalidate';
import type { ApiTask } from '../types';

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      tasks: {
        ...actual.api.tasks,
        list: vi.fn(),
      },
    },
  };
});

import { api } from '../../api';
import { useTaskList } from './useTaskList';

function task(id: string): ApiTask {
  return {
    id,
    organizationId: 'org-1',
    title: `Task ${id}`,
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
    bucket: 'ALL_OPEN',
    dueDate: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function listPage(ids: string[], nextCursor: string | null = null) {
  return {
    data: ids.map(task),
    meta: { limit: 50, nextCursor },
  };
}

describe('useTaskList query identity', () => {
  let unmountCurrent: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.tasks.list).mockResolvedValue(listPage(['t1']) as never);
  });

  afterEach(() => {
    unmountCurrent?.();
    unmountCurrent = null;
  });

  async function waitForInitialLoad(result: { current: ReturnType<typeof useTaskList> }) {
    await waitForHook(() => !result.current.loading && result.current.tasks.length > 0);
  }

  it('does not refetch on rerender with identical semantic query', async () => {
    const filters = { status: 'OPEN' as const };
    const { result, rerender, unmount } = renderHook(
      ({ orgId }: { orgId: string }) =>
        useTaskList({ orgId, bucket: 'ALL_OPEN', filters }),
      { initialProps: { orgId: 'org-1' } },
    );
    unmountCurrent = unmount;

    await waitForInitialLoad(result);
    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(1);

    rerender({ orgId: 'org-1' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(1);
  });

  it('does not refetch when callers recreate filter objects with identical values', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ stationId }: { stationId: string }) =>
        useTaskList({
          orgId: 'org-1',
          bucket: 'ALL_OPEN',
          filters: { stationId },
        }),
      { initialProps: { stationId: 'st-1' } },
    );
    unmountCurrent = unmount;

    await waitForInitialLoad(result);
    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(1);

    rerender({ stationId: 'st-1' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(1);
  });

  it('does not refetch when only loading state changes after initial fetch', async () => {
    const { result, unmount } = renderHook(() =>
      useTaskList({ orgId: 'org-1', bucket: 'ALL_OPEN' }),
    );
    unmountCurrent = unmount;

    await waitForInitialLoad(result);
    const callsAfterInitial = vi.mocked(api.tasks.list).mock.calls.length;

    expect(result.current.loading).toBe(false);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(callsAfterInitial);
  });

  it('refetches when meaningful filters change', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ vehicleId }: { vehicleId: string | undefined }) =>
        useTaskList({
          orgId: 'org-1',
          bucket: 'ALL_OPEN',
          filters: vehicleId ? { vehicleId } : undefined,
        }),
      { initialProps: { vehicleId: undefined as string | undefined } },
    );
    unmountCurrent = unmount;

    await waitForInitialLoad(result);
    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(1);

    rerender({ vehicleId: 'veh-1' });
    await waitForHook(() => vi.mocked(api.tasks.list).mock.calls.length >= 2);

    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(2);
    expect(vi.mocked(api.tasks.list).mock.calls[1]?.[1]).toMatchObject({ vehicleId: 'veh-1' });
  });

  it('refetches when bucket changes', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ bucket }: { bucket: 'ALL_OPEN' | 'OVERDUE' }) =>
        useTaskList({ orgId: 'org-1', bucket }),
      { initialProps: { bucket: 'ALL_OPEN' as const } },
    );
    unmountCurrent = unmount;

    await waitForInitialLoad(result);
    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(1);

    rerender({ bucket: 'OVERDUE' });
    await waitForHook(() => vi.mocked(api.tasks.list).mock.calls.length >= 2);

    expect(vi.mocked(api.tasks.list).mock.calls[1]?.[1]).toMatchObject({ bucket: 'OVERDUE' });
  });

  it('refetches when orgId changes', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ orgId }: { orgId: string }) => useTaskList({ orgId, bucket: 'ALL_OPEN' }),
      { initialProps: { orgId: 'org-1' } },
    );
    unmountCurrent = unmount;

    await waitForInitialLoad(result);
    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(1);

    rerender({ orgId: 'org-2' });
    await waitForHook(() => vi.mocked(api.tasks.list).mock.calls.length >= 2);

    expect(vi.mocked(api.tasks.list).mock.calls[1]?.[0]).toBe('org-2');
  });

  it('refetches on task query invalidation', async () => {
    const { result, unmount } = renderHook(() =>
      useTaskList({ orgId: 'org-1', bucket: 'ALL_OPEN' }),
    );
    unmountCurrent = unmount;

    await waitForInitialLoad(result);
    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(1);

    await act(async () => {
      invalidateTaskQueries({ orgId: 'org-1', lists: true, buckets: ['ALL_OPEN'] });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitForHook(() => vi.mocked(api.tasks.list).mock.calls.length >= 2);

    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(2);
  });

  it('loadMore does not trigger a fresh page-1 reload', async () => {
    vi.mocked(api.tasks.list)
      .mockResolvedValueOnce(listPage(['page-1'], 'cursor-1') as never)
      .mockResolvedValueOnce(listPage(['page-2'], null) as never);

    const { result, unmount } = renderHook(() =>
      useTaskList({ orgId: 'org-1', bucket: 'ALL_OPEN' }),
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.tasks.length === 1 && !result.current.loading);
    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(1);

    await act(async () => {
      await result.current.loadMore();
    });
    await waitForHook(() => result.current.tasks.length === 2);

    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(2);
    expect(vi.mocked(api.tasks.list).mock.calls[1]?.[1]).toMatchObject({ cursor: 'cursor-1' });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(2);
  });

  it('respects enabled=false without fetching until enabled', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useTaskList({ orgId: 'org-1', bucket: 'ALL_OPEN', enabled }),
      { initialProps: { enabled: false } },
    );
    unmountCurrent = unmount;

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(0);
    expect(result.current.tasks).toEqual([]);

    rerender({ enabled: true });
    await waitForInitialLoad(result);
    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(1);
  });

  it('still exposes queryKey on the hook result', async () => {
    const { result, unmount } = renderHook(() =>
      useTaskList({ orgId: 'org-1', bucket: 'ALL_OPEN', filters: { status: 'OPEN' } }),
    );
    unmountCurrent = unmount;

    await waitForInitialLoad(result);
    expect(Array.isArray(result.current.queryKey)).toBe(true);
    expect(result.current.queryKey).toContain('ALL_OPEN');
  });
});
