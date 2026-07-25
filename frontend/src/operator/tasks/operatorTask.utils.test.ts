import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiTask } from '../../lib/api';
import {
  buildTaskListApiFilters,
  filterOperatorTasks,
  isDueToday,
  sortOperatorTasks,
} from './operatorTask.utils';

function task(partial: Partial<ApiTask> & Pick<ApiTask, 'id' | 'title' | 'type'>): ApiTask {
  return {
    organizationId: 'org-1',
    description: '',
    category: 'Custom',
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
    assignedUserName: null,
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
    ...partial,
  };
}

describe('sortOperatorTasks', () => {
  it('orders overdue tasks before on-time tasks', () => {
    const sorted = sortOperatorTasks([
      task({ id: '1', title: 'On time', type: 'CUSTOM', isOverdue: false }),
      task({ id: '2', title: 'Overdue', type: 'CUSTOM', isOverdue: true }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['2', '1']);
  });

  it('orders by priority when overdue flag matches', () => {
    const sorted = sortOperatorTasks([
      task({ id: '1', title: 'Normal', type: 'CUSTOM', priority: 'NORMAL' }),
      task({ id: '2', title: 'Critical', type: 'CUSTOM', priority: 'CRITICAL' }),
      task({ id: '3', title: 'High', type: 'CUSTOM', priority: 'HIGH' }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['2', '3', '1']);
  });

  it('orders by due date when priority matches', () => {
    const sorted = sortOperatorTasks([
      task({ id: 'late', title: 'Later', type: 'CUSTOM', dueDate: '2026-07-15T10:00:00.000Z' }),
      task({ id: 'soon', title: 'Sooner', type: 'CUSTOM', dueDate: '2026-07-14T10:00:00.000Z' }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['soon', 'late']);
  });
});

describe('isDueToday', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true for same local calendar day in UTC', () => {
    expect(isDueToday('2026-07-15T08:30:00.000Z')).toBe(true);
  });

  it('returns false for previous day', () => {
    expect(isDueToday('2026-07-14T23:59:59.000Z')).toBe(false);
  });

  it('returns false for invalid timestamps', () => {
    expect(isDueToday('invalid')).toBe(false);
    expect(isDueToday(null)).toBe(false);
  });
});

describe('filterOperatorTasks', () => {
  const rows = [
    task({ id: 'mine', title: 'Mine', type: 'CUSTOM', assignedUserId: 'user-1', dueDate: '2026-07-15T10:00:00.000Z' }),
    task({ id: 'other', title: 'Other', type: 'CUSTOM', assignedUserId: 'user-2' }),
    task({ id: 'veh', title: 'Vehicle', type: 'CUSTOM', vehicleId: 'veh-1' }),
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('filters mine scope to assigned user', () => {
    const filtered = filterOperatorTasks(rows, { ...{ scope: 'mine', today: false, overdue: false, vehicleId: null, bookingId: null, priority: 'all' }, scope: 'mine' }, 'user-1');
    expect(filtered.map((t) => t.id)).toEqual(['mine']);
  });

  it('filters today tasks using local day boundary', () => {
    const filtered = filterOperatorTasks(
      rows,
      { scope: 'all', today: true, overdue: false, vehicleId: null, bookingId: null, priority: 'all' },
      'user-1',
    );
    expect(filtered.map((t) => t.id)).toEqual(['mine']);
  });

  it('builds API due range for today filter', () => {
    const api = buildTaskListApiFilters(
      { scope: 'all', today: true, overdue: false, vehicleId: null, bookingId: null, priority: 'all' },
      'user-1',
    );
    expect(api?.dueFrom).toBe('2026-07-15T00:00:00.000Z');
    expect(api?.dueTo).toBe('2026-07-15T23:59:59.999Z');
  });
});
