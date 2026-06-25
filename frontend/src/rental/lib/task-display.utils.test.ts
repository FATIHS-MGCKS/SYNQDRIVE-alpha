import { describe, expect, it } from 'vitest';
import {
  countVehicleTasks,
  deriveTaskIsOverdue,
  formatVehicleMaintenanceDueLabel,
  mapApiTaskToDisplayStatus,
  mapApiTaskToVehicleRow,
  matchesVehicleTaskFilter,
  parseVehicleTaskList,
} from './task-display.utils';
import type { ApiTask } from '../../lib/api';

function makeTask(overrides: Partial<ApiTask> = {}): ApiTask {
  return {
    id: 'task-1',
    organizationId: 'org-1',
    title: 'Reifenwechsel',
    description: 'Winterreifen montieren',
    category: 'Wartung',
    type: 'TIRE_CHECK',
    status: 'OPEN',
    priority: 'NORMAL',
    source: null,
    sourceType: 'MANUAL',
    dedupKey: null,
    vehicleId: 'veh-1',
    bookingId: null,
    customerId: null,
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    assignedUserId: null,
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    metadata: null,
    isOverdue: false,
    dueDate: '2026-12-01T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('task-display.utils', () => {
  it('maps API statuses without mixing DONE and CANCELLED', () => {
    expect(mapApiTaskToDisplayStatus('DONE')).toBe('done');
    expect(mapApiTaskToDisplayStatus('CANCELLED')).toBe('cancelled');
    expect(mapApiTaskToDisplayStatus('WAITING')).toBe('waiting');
    expect(mapApiTaskToDisplayStatus('IN_PROGRESS')).toBe('in-progress');
  });

  it('uses server isOverdue and never marks terminal tasks overdue', () => {
    expect(deriveTaskIsOverdue(makeTask({ isOverdue: true, status: 'OPEN' }))).toBe(true);
    expect(deriveTaskIsOverdue(makeTask({ isOverdue: true, status: 'DONE' }))).toBe(false);
    expect(deriveTaskIsOverdue(makeTask({ isOverdue: true, status: 'CANCELLED' }))).toBe(false);
  });

  it('falls back to dueDate only when isOverdue is missing', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(
      deriveTaskIsOverdue({
        status: 'OPEN',
        dueDate: past,
        isOverdue: undefined as unknown as boolean,
      }),
    ).toBe(true);
  });

  it('parseVehicleTaskList drops invalid rows', () => {
    expect(parseVehicleTaskList([makeTask(), { id: '' } as ApiTask])).toHaveLength(1);
    expect(parseVehicleTaskList(null)).toEqual([]);
  });

  it('counts active tasks without including done/cancelled', () => {
    const counts = countVehicleTasks([
      mapApiTaskToVehicleRow(makeTask({ id: '1', status: 'OPEN' }))!,
      mapApiTaskToVehicleRow(makeTask({ id: '2', status: 'IN_PROGRESS' }))!,
      mapApiTaskToVehicleRow(makeTask({ id: '3', status: 'WAITING' }))!,
      mapApiTaskToVehicleRow(makeTask({ id: '4', status: 'DONE' }))!,
      mapApiTaskToVehicleRow(makeTask({ id: '5', status: 'CANCELLED' }))!,
    ]);
    expect(counts.active).toBe(3);
    expect(counts.done).toBe(1);
    expect(counts.cancelled).toBe(1);
  });

  it('formats the maintenance due label as "Fällig bis" when not overdue', () => {
    const label = formatVehicleMaintenanceDueLabel(
      makeTask({ status: 'OPEN', isOverdue: false, dueDate: '2026-02-27T00:00:00.000Z' }),
    );
    expect(label).toBe('Fällig bis 27.02.26');
  });

  it('formats the maintenance due label as "Fällig seit" when overdue', () => {
    const label = formatVehicleMaintenanceDueLabel(
      makeTask({ status: 'OPEN', isOverdue: true, dueDate: '2026-02-27T00:00:00.000Z' }),
    );
    expect(label).toBe('Fällig seit 27.02.26');
  });

  it('returns null for the maintenance due label without a due date', () => {
    expect(
      formatVehicleMaintenanceDueLabel(makeTask({ status: 'OPEN', dueDate: null })),
    ).toBeNull();
  });

  it('overdue filter only matches active overdue tasks', () => {
    const overdueOpen = mapApiTaskToVehicleRow(
      makeTask({ id: 'o', status: 'OPEN', isOverdue: true }),
    )!;
    const doneOverdueFlag = mapApiTaskToVehicleRow(
      makeTask({ id: 'd', status: 'DONE', isOverdue: true }),
    )!;
    expect(matchesVehicleTaskFilter(overdueOpen, 'overdue')).toBe(true);
    expect(matchesVehicleTaskFilter(doneOverdueFlag, 'overdue')).toBe(false);
  });
});
