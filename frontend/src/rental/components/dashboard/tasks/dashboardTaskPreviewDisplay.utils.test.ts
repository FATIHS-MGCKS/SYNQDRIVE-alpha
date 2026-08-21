import { describe, expect, it } from 'vitest';
import type { ApiTask, ApiTaskType } from '../../../../lib/api';
import {
  resolveDashboardTaskDomainKey,
  resolveTaskPreviewPriority,
  taskPreviewPriorityLabelKey,
  taskPreviewDueTone,
} from './dashboardTaskPreviewDisplay.utils';

function task(over: Partial<ApiTask> = {}): ApiTask {
  return {
    id: 'task-1',
    organizationId: 'org-1',
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
    bucket: 'ALL_OPEN',
    dueDate: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('dashboardTaskPreviewDisplay.utils', () => {
  describe('resolveDashboardTaskDomainKey', () => {
    it('maps maintenance tasks with vehicleId to maintenance domain', () => {
      expect(
        resolveDashboardTaskDomainKey(
          task({ vehicleId: 'veh-1', type: 'VEHICLE_SERVICE', category: 'Maintenance' }),
        ),
      ).toBe('dashboardTasksOverview.domain.maintenance');
    });

    it('maps service tasks with vehicleId to maintenance domain', () => {
      expect(
        resolveDashboardTaskDomainKey(task({ vehicleId: 'veh-1', type: 'VEHICLE_SERVICE' })),
      ).toBe('dashboardTasksOverview.domain.maintenance');
    });

    it('maps repair tasks with vehicleId to maintenance domain', () => {
      expect(
        resolveDashboardTaskDomainKey(task({ vehicleId: 'veh-1', type: 'REPAIR', category: 'Repair' })),
      ).toBe('dashboardTasksOverview.domain.maintenance');
    });

    it('maps generic vehicle-linked tasks without maintenance semantics to vehicle domain', () => {
      expect(
        resolveDashboardTaskDomainKey(
          task({
            vehicleId: 'veh-1',
            type: 'GENERIC_VEHICLE_TASK' as ApiTaskType,
            category: 'Cleaning',
          }),
        ),
      ).toBe('dashboardTasksOverview.domain.vehicle');
    });

    it('keeps invoice tasks in finance domain even with vehicleId', () => {
      expect(
        resolveDashboardTaskDomainKey(
          task({ vehicleId: 'veh-1', invoiceId: 'inv-1', type: 'INVOICE_REQUIRED' }),
        ),
      ).toBe('dashboardTasksOverview.domain.finance');
    });

    it('keeps booking tasks in booking domain even with vehicleId', () => {
      expect(
        resolveDashboardTaskDomainKey(
          task({ vehicleId: 'veh-1', bookingId: 'book-1', type: 'BOOKING_PREPARATION' }),
        ),
      ).toBe('dashboardTasksOverview.domain.booking');
    });

    it('maps custom tasks with vehicleId to maintenance domain', () => {
      expect(resolveDashboardTaskDomainKey(task({ vehicleId: 'veh-1' }))).toBe(
        'dashboardTasksOverview.domain.maintenance',
      );
    });
  });

  it('maps finance tasks to finance domain', () => {
    expect(resolveDashboardTaskDomainKey(task({ invoiceId: 'inv-1' }))).toBe(
      'dashboardTasksOverview.domain.finance',
    );
  });

  it('maps priority to preview priority labels', () => {
    expect(resolveTaskPreviewPriority(task({ priority: 'CRITICAL' }))).toBe('Critical');
    expect(taskPreviewPriorityLabelKey('Medium')).toBe('dashboardTasksOverview.priorityMedium');
  });

  it('derives due tone from overdue state', () => {
    expect(taskPreviewDueTone(task({ isOverdue: true }))).toBe('critical');
    expect(taskPreviewDueTone(task({ dueDate: null }))).toBe('muted');
  });
});
