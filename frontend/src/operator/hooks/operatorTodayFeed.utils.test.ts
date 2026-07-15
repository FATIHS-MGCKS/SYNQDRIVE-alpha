import { describe, expect, it } from 'vitest';
import type { ApiTask, ApiTaskSummary } from '../../lib/api';
import {
  bucketsAffectedByTaskMutation,
  canViewOperatorUnassignedBucket,
  dedupeTasksById,
  mergeOperatorTodayActionableTasks,
  bucketCount,
} from './operatorTodayFeed.utils';
import { matchesTaskListInvalidation } from '../../lib/tasks/invalidate';

function task(partial: Partial<ApiTask> & Pick<ApiTask, 'id'>): ApiTask {
  return {
    organizationId: 'org-1',
    title: partial.title ?? 'Task',
    description: '',
    category: 'Custom',
    type: 'INVOICE_REQUIRED',
    status: 'OPEN',
    priority: 'NORMAL',
    source: 'INVOICE',
    sourceType: 'MANUAL',
    dedupKey: null,
    vehicleId: null,
    bookingId: null,
    customerId: null,
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: 'inv-1',
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
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
    bucket: partial.bucket,
    ...partial,
  };
}

describe('operatorTodayFeed.utils', () => {
  it('merges actionable buckets without duplicates', () => {
    const merged = mergeOperatorTodayActionableTasks({
      NOW: [task({ id: 'a', bucket: 'NOW' })],
      TODAY: [task({ id: 'a', bucket: 'TODAY' }), task({ id: 'b', bucket: 'TODAY' })],
      UPCOMING: [task({ id: 'c', bucket: 'UPCOMING' })],
    });
    expect(merged.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(dedupeTasksById(merged)).toHaveLength(3);
  });

  it('excludes PLANNED tasks from actionable merge', () => {
    const merged = mergeOperatorTodayActionableTasks({
      NOW: [],
      TODAY: [],
      UPCOMING: [],
    });
    const plannedOnly = [task({ id: 'planned-1', bucket: 'PLANNED' })];
    expect(merged).toEqual([]);
    expect(plannedOnly[0]?.bucket).toBe('PLANNED');
    expect(merged.some((t) => t.bucket === 'PLANNED')).toBe(false);
  });

  it('uses summary bucket counts when available', () => {
    const summary = {
      buckets: { PLANNED: 2, NOW: 1, TODAY: 0, UPCOMING: 0, OVERDUE: 0, UNASSIGNED: 0, ALL_OPEN: 3, COMPLETED: 0 },
    } as ApiTaskSummary;
    expect(bucketCount(summary, 'PLANNED', 0)).toBe(2);
    expect(bucketCount(summary, 'NOW', 5)).toBe(1);
  });

  it('gates unassigned bucket by tasks.manage permission', () => {
    expect(
      canViewOperatorUnassignedBucket({
        userRole: 'WORKER',
        hasPermission: () => false,
      }),
    ).toBe(false);
    expect(
      canViewOperatorUnassignedBucket({
        userRole: 'WORKER',
        hasPermission: (module, level) => module === 'tasks' && level === 'manage',
      }),
    ).toBe(true);
    expect(
      canViewOperatorUnassignedBucket({
        userRole: 'ORG_ADMIN',
        hasPermission: () => false,
      }),
    ).toBe(true);
  });

  it('invalidates all operator feed buckets after mutation', () => {
    const buckets = bucketsAffectedByTaskMutation(task({ id: 't1', bucket: 'TODAY' }));
    expect(buckets).toContain('TODAY');
    expect(buckets).toContain('PLANNED');
    expect(buckets).toContain('ALL_OPEN');
    expect(buckets).toContain('NOW');
    expect(
      matchesTaskListInvalidation({ orgId: 'org-1', buckets, lists: true }, 'org-1', 'PLANNED'),
    ).toBe(true);
    expect(
      matchesTaskListInvalidation({ orgId: 'org-1', buckets, lists: true }, 'org-1', 'COMPLETED'),
    ).toBe(false);
  });
});

describe('operator today bucket placement (fixture expectations)', () => {
  it('future invoice task is only represented in PLANNED feed slice', () => {
    const plannedTask = task({
      id: 'invoice-future',
      type: 'INVOICE_REQUIRED',
      bucket: 'PLANNED',
      activatesAt: '2026-12-01T08:00:00.000Z',
    });
    const actionable = mergeOperatorTodayActionableTasks({
      NOW: [task({ id: 'other', bucket: 'NOW' })],
      TODAY: [],
      UPCOMING: [],
    });

    expect([plannedTask].some((t) => t.id === 'invoice-future')).toBe(true);
    expect(actionable.some((t) => t.id === 'invoice-future')).toBe(false);
  });

  it('overdue task belongs to NOW feed slice', () => {
    const overdue = task({ id: 'od-1', bucket: 'NOW', isOverdue: true });
    const merged = mergeOperatorTodayActionableTasks({ NOW: [overdue], TODAY: [], UPCOMING: [] });
    expect(merged[0]?.id).toBe('od-1');
    expect(merged[0]?.bucket).toBe('NOW');
  });

  it('today-due task belongs to TODAY feed slice', () => {
    const todayTask = task({
      id: 'td-1',
      bucket: 'TODAY',
      dueDate: '2026-07-15T14:00:00.000Z',
    });
    const merged = mergeOperatorTodayActionableTasks({
      NOW: [],
      TODAY: [todayTask],
      UPCOMING: [],
    });
    expect(merged.map((t) => t.id)).toEqual(['td-1']);
  });
});
