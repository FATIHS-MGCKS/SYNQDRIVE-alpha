import { describe, expect, it } from 'vitest';
import type { ApiTask } from '../../lib/api';
import {
  getTaskListDisplayFields,
  taskListDisplayAvoidsRawUuid,
} from '../components/tasks/task-display';
import {
  mapApiTaskToTaskListRow,
  sortTaskListRows,
  taskPriorityLabelDe,
  taskStatusLabelDe,
} from './task-list.utils';

function makeTask(overrides: Partial<ApiTask> = {}): ApiTask {
  return {
    id: '947134ba-a6af-43ae-b627-d5350455bc10',
    organizationId: 'org-1',
    title: 'Batterie kritisch beobachten',
    description: 'Test',
    category: 'Maintenance',
    type: 'BATTERY_CHECK',
    status: 'OPEN',
    priority: 'HIGH',
    source: 'INSIGHT_HEALTH',
    sourceType: 'SYSTEM',
    dedupKey: 'health:battery:1',
    vehicleId: 'veh-1',
    bookingId: null,
    customerId: null,
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    serviceCaseId: null,
    assignedUserId: 'user-assignee',
    createdByUserId: 'user-creator',
    updatedByUserId: null,
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: false,
    metadata: { stationId: 'station-1' },
    isOverdue: false,
    dueDate: '2026-07-01T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    ...overrides,
  };
}

const ctx = {
  fleetVehicles: [{ id: 'veh-1', license: 'B-SD 100', model: 'Mercedes E-Klasse', station: 'Berlin' }],
  orgMembers: [
    { id: 'user-creator', name: 'Anna Admin' },
    { id: 'user-assignee', name: 'Max Mechaniker' },
  ],
  orgStations: [{ id: 'station-1', name: 'Berlin Mitte' }],
};

describe('task display parity', () => {
  it('maps German status and priority labels consistently', () => {
    expect(taskStatusLabelDe('Open')).toBe('Offen');
    expect(taskStatusLabelDe('In Progress')).toBe('In Bearbeitung');
    expect(taskPriorityLabelDe('Critical')).toBe('Kritisch');
    expect(taskPriorityLabelDe('High')).toBe('Hoch');
  });

  it('includes assigned to and created by in list display fields', () => {
    const row = mapApiTaskToTaskListRow(makeTask(), ctx);
    const fields = getTaskListDisplayFields(row);

    expect(fields).toContain('Max Mechaniker');
    expect(fields).toContain('Anna Admin');
    expect(fields).toContain(row.title);
    expect(fields).toContain('Hoch');
    expect(fields).toContain('Offen');
  });

  it('does not expose raw UUID in list display fields', () => {
    const row = mapApiTaskToTaskListRow(makeTask(), ctx);
    expect(taskListDisplayAvoidsRawUuid(row)).toBe(true);
    expect(getTaskListDisplayFields(row).join(' ')).not.toContain(row.id);
  });

  it('sorts filtered rows by due date for desktop and mobile parity', () => {
    const later = mapApiTaskToTaskListRow(
      makeTask({ id: 'later', dueDate: '2026-12-01T00:00:00.000Z' }),
      ctx,
    );
    const sooner = mapApiTaskToTaskListRow(
      makeTask({ id: 'sooner', dueDate: '2026-03-01T00:00:00.000Z' }),
      ctx,
    );
    const sorted = sortTaskListRows([later, sooner], 'dueDate');
    expect(sorted.map((t) => t.id)).toEqual(['sooner', 'later']);
  });
});
