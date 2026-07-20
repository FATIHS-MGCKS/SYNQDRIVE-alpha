import { describe, expect, it } from 'vitest';
import type { ApiTask } from './types';
import { mergeTaskListPages, replaceTaskListFirstPage } from './taskListPagination.utils';

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
    dueDate: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

describe('taskListPagination.utils', () => {
  it('replaces the first page on reload', () => {
    expect(replaceTaskListFirstPage([task('old')], [task('new-1'), task('new-2')])).toEqual([
      task('new-1'),
      task('new-2'),
    ]);
  });

  it('appends later pages without duplicates', () => {
    const merged = mergeTaskListPages([task('a'), task('b')], [task('b'), task('c')]);
    expect(merged.map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });
});
