import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ApiTask } from '../../../lib/api';
import { buildDashboardTaskPreview } from './dashboardTasksOverview.utils';

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
