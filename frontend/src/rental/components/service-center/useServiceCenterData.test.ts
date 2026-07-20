// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../../test/renderHook';
import { VENDOR_SOURCE_ERROR_MESSAGE } from './useServiceCenterData';

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      tasks: {
        ...actual.api.tasks,
        summary: vi.fn(),
        list: vi.fn(),
      },
      vendors: {
        ...actual.api.vendors,
        list: vi.fn(),
      },
    },
  };
});

import { api } from '../../../lib/api';
import { useServiceCenterData } from './useServiceCenterData';

const taskSummary = {
  open: 1,
  overdue: 0,
  dueSoon: 0,
  inProgress: 0,
  waitingVendor: 0,
  urgent: 0,
  tuvDue: 0,
  openRepairs: 0,
  openService: 1,
} as const;

const task = {
  id: 't1',
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  title: 'Service',
  description: '',
  category: 'Service',
  type: 'VEHICLE_SERVICE',
  status: 'OPEN',
  priority: 'NORMAL',
  source: null,
  sourceType: 'MANUAL',
  dedupKey: null,
  bookingId: null,
  customerId: null,
  vendorId: null,
  assignedUserId: null,
  dueDate: null,
  blocksVehicleAvailability: false,
  serviceCaseId: null,
  metadata: null,
} as const;

const vendor = {
  id: 'vendor-1',
  organizationId: 'org-1',
  name: 'Werkstatt Nord',
  category: 'WORKSHOP',
  status: 'ACTIVE',
  source: 'MANUAL',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const;

describe('useServiceCenterData vendor source', () => {
  let unmountCurrent: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.tasks.summary).mockResolvedValue(taskSummary as never);
    vi.mocked(api.tasks.list).mockResolvedValue([task] as never);
    vi.mocked(api.vendors.list).mockResolvedValue([vendor] as never);
  });

  afterEach(() => {
    unmountCurrent?.();
    unmountCurrent = null;
  });

  it('loads vendors independently on success', async () => {
    const { result, unmount } = renderHook(() => useServiceCenterData('org-1'));
    unmountCurrent = unmount;

    await waitForHook(() => result.current.vendorsStatus === 'ready');

    expect(result.current.vendors).toHaveLength(1);
    expect(result.current.vendorsError).toBeNull();
    expect(result.current.vendorsFetchedAt).toBeTruthy();
    expect(result.current.allTasks).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('treats a successful empty vendor response as zero partners', async () => {
    vi.mocked(api.vendors.list).mockResolvedValue([] as never);

    const { result, unmount } = renderHook(() => useServiceCenterData('org-1'));
    unmountCurrent = unmount;

    await waitForHook(() => result.current.vendorsStatus === 'ready');

    expect(result.current.vendors).toEqual([]);
    expect(result.current.vendorsError).toBeNull();
    expect(result.current.vendorsStatus).toBe('ready');
  });

  it('keeps task data visible when vendor loading fails', async () => {
    vi.mocked(api.vendors.list).mockRejectedValue(new Error('API error 503'));

    const { result, unmount } = renderHook(() => useServiceCenterData('org-1'));
    unmountCurrent = unmount;

    await waitForHook(() => result.current.vendorsStatus === 'error');
    await waitForHook(() => result.current.allTasks.length === 1);

    expect(result.current.vendors).toEqual([]);
    expect(result.current.vendorsError).toBe(VENDOR_SOURCE_ERROR_MESSAGE);
    expect(result.current.vendorsStatus).toBe('error');
    expect(result.current.allTasks).toHaveLength(1);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('reloadVendors can recover vendor data without reloading tasks', async () => {
    vi.mocked(api.vendors.list)
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce([vendor] as never);

    const { result, unmount } = renderHook(() => useServiceCenterData('org-1'));
    unmountCurrent = unmount;

    await waitForHook(() => result.current.vendorsStatus === 'error');
    const summaryCallsAfterInitial = vi.mocked(api.tasks.summary).mock.calls.length;

    await act(async () => {
      await result.current.reloadVendors();
    });
    await waitForHook(() => result.current.vendorsStatus === 'ready');

    expect(result.current.vendors).toHaveLength(1);
    expect(result.current.vendorsError).toBeNull();
    expect(vi.mocked(api.tasks.summary).mock.calls.length).toBe(summaryCallsAfterInitial);
  });

  it('marks vendor source stale when reload fails after prior success', async () => {
    const { result, unmount } = renderHook(() => useServiceCenterData('org-1'));
    unmountCurrent = unmount;

    await waitForHook(() => result.current.vendorsStatus === 'ready');

    vi.mocked(api.vendors.list).mockRejectedValue(new Error('temporary outage'));
    await act(async () => {
      await result.current.reloadVendors();
    });
    await waitForHook(() => result.current.vendorsStatus === 'stale');

    expect(result.current.vendors).toHaveLength(1);
    expect(result.current.vendorsError).toBe(VENDOR_SOURCE_ERROR_MESSAGE);
    expect(result.current.allTasks).toHaveLength(1);
  });
});
