import { describe, expect, it } from 'vitest';
import type { ApiTask } from '../../lib/api';
import {
  getTaskListDisplayFields,
  taskListDisplayAvoidsRawUuid,
} from '../components/tasks/task-display';
import { taskListPriorityLabel, taskListStatusLabel } from '../components/tasks-settings/tasks-i18n';
import { mapApiTaskToTaskListRow, sortTaskListRows } from './task-list.utils';

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
  locale: 'de',
  formattingLocale: 'de-DE',
};

describe('task display parity', () => {
  it('maps German status and priority labels consistently', () => {
    expect(taskListStatusLabel('de', 'Open')).toBe('Offen');
    expect(taskListStatusLabel('de', 'In Progress')).toBe('In Bearbeitung');
    expect(taskListPriorityLabel('de', 'Critical')).toBe('Kritisch');
    expect(taskListPriorityLabel('de', 'High')).toBe('Hoch');
  });

  it('includes assigned to and created by in list display fields', () => {
    const row = mapApiTaskToTaskListRow(
      makeTask({ dueDate: '2027-01-01T00:00:00.000Z', isOverdue: false }),
      ctx,
    );
    const fields = getTaskListDisplayFields('de', row);

    expect(fields).toContain('Max Mechaniker');
    expect(fields).toContain('Anna Admin');
    expect(taskListDisplayAvoidsRawUuid('de', row)).toBe(true);
  });

  it('sorts rows by due date using raw ISO values', () => {
    const later = mapApiTaskToTaskListRow(
      makeTask({ id: 'later', dueDate: '2026-12-01T00:00:00.000Z' }),
      ctx,
    );
    const sooner = mapApiTaskToTaskListRow(
      makeTask({ id: 'sooner', dueDate: '2026-03-01T00:00:00.000Z' }),
      ctx,
    );
    const sorted = sortTaskListRows([later, sooner], 'dueDate');
    expect(sorted[0].id).toBe('sooner');
  });
});
