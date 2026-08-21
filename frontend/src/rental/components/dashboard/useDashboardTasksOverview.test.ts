// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../../test/renderHook';
import type { ApiTask } from '../../../lib/api';
import { buildDashboardTaskPreview } from './dashboardTasksOverview.utils';
import { useDashboardTasksOverview } from './useDashboardTasksOverview';

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
    },
  };
});

import { api } from '../../../lib/api';

function task(over: Partial<ApiTask> = {}): ApiTask {
  return {
    id: over.id ?? 'task-1',
    organizationId: 'org-1',
    title: over.title ?? 'Task',
    description: '',
    category: '',
    type: 'CUSTOM',
    status: over.status ?? 'OPEN',
    priority: over.priority ?? 'NORMAL',
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
    isOverdue: over.isOverdue ?? false,
    bucket: over.bucket,
    dueDate: over.dueDate ?? null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('useDashboardTasksOverview invalidation wiring', () => {
  it('relies on shared task hooks with invalidation subscriptions', () => {
    const hookSrc = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), './useDashboardTasksOverview.ts'),
      'utf8',
    );
    expect(hookSrc).toContain('useTaskList');
    expect(hookSrc).toContain('useTaskSummary');
    expect(hookSrc).not.toContain('OperatorDataContext');
    expect(hookSrc).not.toContain('useServiceCenterData');
  });
});

describe('useDashboardTasksOverview org-wide preview pagination contract', () => {
  const hookSrc = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), './useDashboardTasksOverview.ts'),
    'utf8',
  );

  it('paginates ALL_OPEN for org-wide preview correctness', () => {
    expect(hookSrc).toMatch(/shouldPaginateList/);
    expect(hookSrc).not.toMatch(/if \(!stationScoped \|\| !queryEnabled/);
    expect(hookSrc).toMatch(/previewReady = \(listComplete \|\| orgWideSummaryEmpty\)/);
    expect(hookSrc).toMatch(/if \(!previewReady\) return \[\]/);
  });

  it('keeps org-wide summary counts authoritative while preview waits for list completion', () => {
    expect(hookSrc).toMatch(/buildDashboardTasksOverviewCountsFromSummary/);
    expect(hookSrc).toMatch(/countsLoading = stationScoped/);
    expect(hookSrc).toMatch(/previewLoading/);
  });

  it('skips list pagination when org-wide summary reports zero active tasks', () => {
    expect(hookSrc).toMatch(/orgWideSummaryEmpty/);
    expect(hookSrc).toMatch(/!orgWideSummaryEmpty/);
  });
});

describe('org-wide preview ordering across paginated ALL_OPEN pages', () => {
  it('promotes an overdue task from a later page once the full open set is available', () => {
    const preview = buildDashboardTaskPreview([
      task({ id: 'page-1-planned', bucket: 'PLANNED', dueDate: '2026-12-01T00:00:00.000Z' }),
      task({ id: 'page-2-overdue', isOverdue: true, bucket: 'OVERDUE', dueDate: '2026-01-01T00:00:00.000Z' }),
    ]);

    expect(preview[0]?.id).toBe('page-2-overdue');
  });
});

describe('useDashboardTasksOverview runtime pagination', () => {
  let unmountCurrent: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.tasks.summary).mockImplementation(async () =>
      ({
        open: 2,
        active: 2,
        inProgress: 0,
        waiting: 0,
        done: 0,
        cancelled: 0,
        dueToday: 0,
        overdue: 0,
        critical: 0,
        assignedToMe: 0,
        byStatus: {},
        byPriority: {},
      }) as never,
    );
    let listCall = 0;
    vi.mocked(api.tasks.list).mockImplementation(async () => {
      listCall += 1;
      if (listCall === 1) {
        return {
          data: [task({ id: 'page-1' })],
          meta: { limit: 50, nextCursor: 'cursor-1' },
        } as never;
      }
      return {
        data: [task({ id: 'page-2' })],
        meta: { limit: 50, nextCursor: null },
      } as never;
    });
  });

  afterEach(() => {
    unmountCurrent?.();
    unmountCurrent = null;
  });

  it('paginates each cursor once and stabilizes without repeated page-1 reloads', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ version }: { version: number }) => {
        void version;
        return useDashboardTasksOverview({
          orgId: 'org-1',
          selectedStationId: null,
          fleetVehicles: [],
          userRole: 'ORG_ADMIN',
          hasPermission: () => true,
        });
      },
      { initialProps: { version: 0 } },
    );
    unmountCurrent = unmount;

    await waitForHook(() => vi.mocked(api.tasks.list).mock.calls.length >= 1);
    await waitForHook(
      () => result.current.listComplete === true && vi.mocked(api.tasks.list).mock.calls.length >= 2,
    );
    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(2);
    expect(vi.mocked(api.tasks.list).mock.calls[0]?.[1]).not.toMatchObject({ cursor: expect.anything() });
    expect(vi.mocked(api.tasks.list).mock.calls[1]?.[1]).toMatchObject({ cursor: 'cursor-1', bucket: 'ALL_OPEN' });

    const callsAfterPagination = vi.mocked(api.tasks.list).mock.calls.length;
    rerender({ version: 1 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(callsAfterPagination);
    expect(result.current.error).toBeNull();
    expect(result.current.previewTasks.length).toBeGreaterThan(0);
  });

  it('does not restart pagination after list error', async () => {
    vi.mocked(api.tasks.list).mockReset();
    vi.mocked(api.tasks.list).mockRejectedValue(new Error('Aufgaben konnten nicht geladen werden'));

    const { result, unmount } = renderHook(() =>
      useDashboardTasksOverview({
        orgId: 'org-1',
        selectedStationId: null,
        fleetVehicles: [],
        userRole: 'ORG_ADMIN',
        hasPermission: () => true,
      }),
    );
    unmountCurrent = unmount;

    await waitForHook(() => result.current.error != null);
    const callsAfterError = vi.mocked(api.tasks.list).mock.calls.length;

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    expect(vi.mocked(api.tasks.list).mock.calls.length).toBe(callsAfterError);
  });
});
