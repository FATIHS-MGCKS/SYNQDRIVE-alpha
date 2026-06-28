import { describe, expect, it } from 'vitest';
import type { ApiTask } from '../../lib/api';
import {
  isSystemTask,
  mapApiTaskToTaskListRow,
  resolveCreatorName,
  resolveDisplaySource,
  shortTaskId,
  sortTaskListRows,
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
    createdByUserId: null,
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

const members = [
  { id: 'user-creator', name: 'Anna Admin', roleKey: 'ORG_ADMIN', membershipRole: 'ORG_ADMIN' },
  { id: 'user-assignee', name: 'Max Mechaniker' },
  {
    id: 'station-mgr',
    name: 'Stefan Stationsleiter',
    roleLabel: 'Stationsleiter',
    stationIds: ['station-1'],
  },
];

const ctx = {
  fleetVehicles: [{ id: 'veh-1', license: 'B-SD 100', model: 'Mercedes E-Klasse', station: 'Berlin' }],
  orgMembers: members,
  orgStations: [{ id: 'station-1', name: 'Berlin Mitte' }],
};

describe('task-list.utils', () => {
  it('shortens task ids for muted display', () => {
    expect(shortTaskId('947134ba-a6af-43ae-b627-d5350455bc10')).toBe('#…bc10');
  });

  it('maps manual tasks with creator and assignee names', () => {
    const row = mapApiTaskToTaskListRow(
      makeTask({
        sourceType: 'MANUAL',
        source: null,
        createdByUserId: 'user-creator',
      }),
      ctx,
    );

    expect(row.title).toBe('Batterie kritisch beobachten');
    expect(row.createdByUserName).toBe('Anna Admin');
    expect(row.assignedUserName).toBe('Max Mechaniker');
    expect(row.displaySource).toBe('Manuell');
    expect(row.isSystemTask).toBe(false);
  });

  it('labels system tasks without creator as SynqDrive Insights', () => {
    const row = mapApiTaskToTaskListRow(makeTask({ assignedUserId: null }), ctx);
    expect(row.createdByUserName).toBe('SynqDrive Insights');
    expect(row.isSystemTask).toBe(true);
    expect(row.assignedUserName).toBe('Stefan Stationsleiter');
    expect(resolveDisplaySource('SYSTEM', 'INSIGHT_HEALTH')).toBe('SynqDrive Insights');
  });

  it('does not treat UUID as assignee display name when member is missing', () => {
    const row = mapApiTaskToTaskListRow(
      makeTask({ assignedUserId: 'missing-user-id' }),
      ctx,
    );
    expect(row.assignedUserName).toBe('Unbekannt');
    expect(row.assignedUserName).not.toContain('missing-user-id');
  });

  it('sorts newest first by createdAtRaw, not id', () => {
    const older = mapApiTaskToTaskListRow(
      makeTask({ id: 'zzz-old', createdAt: '2026-01-01T00:00:00.000Z' }),
      ctx,
    );
    const newer = mapApiTaskToTaskListRow(
      makeTask({ id: 'aaa-new', createdAt: '2026-06-15T00:00:00.000Z' }),
      ctx,
    );
    const sorted = sortTaskListRows([older, newer], 'created');
    expect(sorted[0].id).toBe('aaa-new');
  });

  it('sorts due dates using raw ISO values', () => {
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

  it('resolves creator from members when createdByUserId is present', () => {
    expect(
      resolveCreatorName(
        { createdByUserId: 'user-creator', sourceType: 'MANUAL', source: null },
        members,
      ),
    ).toBe('Anna Admin');
  });

  it('detects system tasks without createdByUserId', () => {
    expect(isSystemTask({ createdByUserId: null, sourceType: 'SYSTEM', source: 'INSIGHT_HEALTH' })).toBe(true);
    expect(isSystemTask({ createdByUserId: 'user-creator', sourceType: 'SYSTEM', source: 'INSIGHT_HEALTH' })).toBe(false);
  });
});
