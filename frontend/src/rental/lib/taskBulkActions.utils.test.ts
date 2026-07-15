import { describe, expect, it } from 'vitest';
import type { ApiTask } from '../../lib/api';
import {
  bulkActionFailureMessages,
  canOfferBulkComplete,
  formatBulkActionSummary,
  isActiveApiTask,
} from './taskBulkActions.utils';

function task(over: Partial<ApiTask> = {}): ApiTask {
  return {
    id: 't1',
    organizationId: 'org1',
    title: 'Task',
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('taskBulkActions.utils', () => {
  it('identifies active tasks for bulk selection', () => {
    expect(isActiveApiTask(task({ status: 'OPEN' }))).toBe(true);
    expect(isActiveApiTask(task({ status: 'DONE' }))).toBe(false);
    expect(isActiveApiTask(task({ status: 'CANCELLED' }))).toBe(false);
  });

  it('does not offer bulk complete for heterogeneous or checklist tasks', () => {
    expect(
      canOfferBulkComplete([
        task({ type: 'CUSTOM' }),
        task({ id: 't2', type: 'REPAIR' }),
      ]),
    ).toBe(false);

    expect(
      canOfferBulkComplete([
        task({
          checklistProgress: {
            totalItems: 2,
            completedItems: 0,
            requiredItems: 1,
            completedRequiredItems: 0,
            remainingRequiredItems: 1,
            progressPercent: 0,
            hasChecklist: true,
            areRequiredItemsComplete: false,
            canCompleteByChecklist: false,
            completionBlockers: ['REQUIRED_CHECKLIST_ITEMS_OPEN'],
          },
        }),
      ]),
    ).toBe(false);

    expect(
      canOfferBulkComplete([
        task({ type: 'REPAIR' }),
        task({ id: 't2', type: 'REPAIR' }),
      ]),
    ).toBe(false);
  });

  it('formats partial bulk results', () => {
    const summary = formatBulkActionSummary({
      results: [
        { taskId: 'a', success: true },
        { taskId: 'b', success: false, error: 'Task not found' },
      ],
      succeeded: 1,
      failed: 1,
    });
    expect(summary).toBe('1 erfolgreich, 1 fehlgeschlagen');
    expect(bulkActionFailureMessages({
      results: [{ taskId: 'b', success: false, error: 'Task not found' }],
      succeeded: 0,
      failed: 1,
    })).toEqual(['b: Task not found']);
  });
});
