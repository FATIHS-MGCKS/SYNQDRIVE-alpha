// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../../test/renderHook';
import {
  SERVICE_CASES_ERROR_MESSAGE,
  TASK_SUMMARY_ERROR_MESSAGE,
  TASKS_ERROR_MESSAGE,
  VENDOR_SOURCE_ERROR_MESSAGE,
} from './useServiceCenterData';

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
      serviceCases: {
        ...actual.api.serviceCases,
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

describe('useServiceCenterData source states', () => {
  let unmountCurrent: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.tasks.summary).mockResolvedValue(taskSummary as never);
    vi.mocked(api.tasks.list).mockResolvedValue([task] as never);
    vi.mocked(api.vendors.list).mockResolvedValue([vendor] as never);
    vi.mocked(api.serviceCases.list).mockResolvedValue([] as never);
  });

  afterEach(() => {
    unmountCurrent?.();
    unmountCurrent = null;
  });

  it('loads all sources independently on success', async () => {
    const { result, unmount } = renderHook(() => useServiceCenterData('org-1'));
    unmountCurrent = unmount;

    await waitForHook(() => result.current.taskSummary.status === 'ready');
    await waitForHook(() => result.current.tasks.status === 'ready');
    await waitForHook(() => result.current.vendors.status === 'ready');
    await waitForHook(() => result.current.serviceCases.status === 'ready');

    expect(result.current.taskSummary.data).toEqual(taskSummary);
    expect(result.current.tasks.data).toHaveLength(1);
    expect(result.current.vendors.data).toHaveLength(1);
    expect(result.current.serviceCases.data).toEqual([]);
    expect(result.current.partialData).toBe(false);
    expect(result.current.allTasks).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('treats successful empty vendor and service case responses as zero items', async () => {
    vi.mocked(api.vendors.list).mockResolvedValue([] as never);
    vi.mocked(api.serviceCases.list).mockResolvedValue([] as never);

    const { result, unmount } = renderHook(() => useServiceCenterData('org-1'));
    unmountCurrent = unmount;

    await waitForHook(() => result.current.vendors.status === 'ready');
    await waitForHook(() => result.current.serviceCases.status === 'ready');

    expect(result.current.vendors.data).toEqual([]);
    expect(result.current.vendors.error).toBeNull();
    expect(result.current.serviceCases.data).toEqual([]);
    expect(result.current.serviceCases.error).toBeNull();
  });

  it('keeps task data visible when vendor loading fails', async () => {
    vi.mocked(api.vendors.list).mockRejectedValue(new Error('API error 503'));

    const { result, unmount } = renderHook(() => useServiceCenterData('org-1'));
    unmountCurrent = unmount;

    await waitForHook(() => result.current.vendors.status === 'error');
    await waitForHook(() => result.current.tasks.status === 'ready');

    expect(result.current.vendors.data).toEqual([]);
    expect(result.current.vendors.error).toBe(VENDOR_SOURCE_ERROR_MESSAGE);
    expect(result.current.tasks.data).toHaveLength(1);
    expect(result.current.taskSummary.data).toEqual(taskSummary);
    expect(result.current.partialData).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('does not clear task summary when only the task list fails', async () => {
    vi.mocked(api.tasks.list).mockRejectedValue(new Error('tasks unavailable'));

    const { result, unmount } = renderHook(() => useServiceCenterData('org-1'));
    unmountCurrent = unmount;

    await waitForHook(() => result.current.tasks.status === 'error');
    await waitForHook(() => result.current.taskSummary.status === 'ready');

    expect(result.current.taskSummary.data).toEqual(taskSummary);
    expect(result.current.tasks.data).toEqual([]);
    expect(result.current.tasks.error).toBe(TASKS_ERROR_MESSAGE);
    expect(result.current.summary).toEqual(taskSummary);
    expect(result.current.partialData).toBe(true);
  });

  it('does not clear task list when only task summary fails', async () => {
    vi.mocked(api.tasks.summary).mockRejectedValue(new Error('summary unavailable'));

    const { result, unmount } = renderHook(() => useServiceCenterData('org-1'));
    unmountCurrent = unmount;

    await waitForHook(() => result.current.taskSummary.status === 'error');
    await waitForHook(() => result.current.tasks.status === 'ready');

    expect(result.current.taskSummary.data).toBeNull();
    expect(result.current.taskSummary.error).toBe(TASK_SUMMARY_ERROR_MESSAGE);
    expect(result.current.tasks.data).toHaveLength(1);
    expect(result.current.allTasks).toHaveLength(1);
    expect(result.current.partialData).toBe(true);
  });

  it('reloads vendors without touching tasks or summary', async () => {
    vi.mocked(api.vendors.list)
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce([vendor] as never);

    const { result, unmount } = renderHook(() => useServiceCenterData('org-1'));
    unmountCurrent = unmount;

    await waitForHook(() => result.current.vendors.status === 'error');
    const summaryCallsAfterInitial = vi.mocked(api.tasks.summary).mock.calls.length;
    const listCallsAfterInitial = vi.mocked(api.tasks.list).mock.calls.length;

    await act(async () => {
      await result.current.vendors.reload();
    });
    await waitForHook(() => result.current.vendors.status === 'ready');

    expect(result.current.vendors.data).toHaveLength(1);
    expect(vi.mocked(api.tasks.summary).mock.calls.length).toBe(summaryCallsAfterInitial);
    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(listCallsAfterInitial);
  });

  it('marks vendor source stale when reload fails after prior success', async () => {
    const { result, unmount } = renderHook(() => useServiceCenterData('org-1'));
    unmountCurrent = unmount;

    await waitForHook(() => result.current.vendors.status === 'ready');

    vi.mocked(api.vendors.list).mockRejectedValue(new Error('temporary outage'));
    await act(async () => {
      await result.current.reloadVendors();
    });
    await waitForHook(() => result.current.vendors.status === 'stale');

    expect(result.current.vendors.data).toHaveLength(1);
    expect(result.current.vendors.error).toBe(VENDOR_SOURCE_ERROR_MESSAGE);
    expect(result.current.tasks.data).toHaveLength(1);
  });

  it('loads service cases as a real source before UI binding', async () => {
    vi.mocked(api.serviceCases.list).mockRejectedValue(new Error('service cases unavailable'));

    const { result, unmount } = renderHook(() => useServiceCenterData('org-1'));
    unmountCurrent = unmount;

    await waitForHook(() => result.current.serviceCases.status === 'error');

    expect(result.current.serviceCases.data).toEqual([]);
    expect(result.current.serviceCases.error).toBe(SERVICE_CASES_ERROR_MESSAGE);
    expect(result.current.tasks.data).toHaveLength(1);
  });
});
