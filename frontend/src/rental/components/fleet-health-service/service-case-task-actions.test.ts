import { describe, expect, it } from 'vitest';
import type { ApiServiceCase } from '../../../lib/api';
import {
  canLinkTaskToServiceCase,
  canUnlinkTaskFromServiceCase,
  filterLinkableVehicleTasks,
  hasServiceCaseOpenTaskInconsistency,
  isServiceCaseTaskLinkAuditComment,
  resolveServiceCaseOpenTaskCount,
  serviceCaseTaskLinkAuditTitle,
} from './service-case-task-actions';

function caseRow(overrides: Partial<ApiServiceCase> = {}): ApiServiceCase {
  return {
    id: 'sc-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    vendorId: null,
    title: 'Fall',
    description: '',
    category: 'REPAIR',
    status: 'OPEN',
    priority: 'NORMAL',
    source: 'MANUAL',
    openedAt: '2026-01-01T00:00:00.000Z',
    scheduledAt: null,
    expectedReadyAt: null,
    completedAt: null,
    cancelledAt: null,
    estimatedCostCents: null,
    actualCostCents: null,
    downtimeStart: null,
    downtimeEnd: null,
    blocksRental: false,
    completionNotes: null,
    documentId: null,
    metadata: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    taskCount: 0,
    tasks: [],
    ...overrides,
  };
}

describe('service-case-task-actions', () => {
  it('detects task-link audit comments', () => {
    expect(isServiceCaseTaskLinkAuditComment('[task-link] Aufgabe verknüpft')).toBe(true);
    expect(serviceCaseTaskLinkAuditTitle('[task-link] Aufgabe „X“ getrennt')).toBe(
      'Aufgabenverknüpfung getrennt',
    );
  });

  it('allows link only on active cases', () => {
    expect(canLinkTaskToServiceCase(caseRow())).toBe(true);
    expect(canLinkTaskToServiceCase(caseRow({ status: 'COMPLETED' }))).toBe(false);
  });

  it('allows unlink on terminal case only for open tasks', () => {
    expect(
      canUnlinkTaskFromServiceCase(caseRow({ status: 'COMPLETED' }), {
        id: 't1',
        title: 'Offen',
        status: 'OPEN',
        type: 'REPAIR',
        dueDate: null,
      }),
    ).toBe(true);
    expect(
      canUnlinkTaskFromServiceCase(caseRow({ status: 'COMPLETED' }), {
        id: 't2',
        title: 'Done',
        status: 'DONE',
        type: 'REPAIR',
        dueDate: null,
      }),
    ).toBe(false);
  });

  it('flags inconsistency when terminal case has open tasks', () => {
    expect(
      hasServiceCaseOpenTaskInconsistency(
        caseRow({
          status: 'COMPLETED',
          openTaskCount: 1,
          tasks: [{ id: 't1', title: 'Offen', status: 'OPEN', type: 'REPAIR', dueDate: null }],
        }),
      ),
    ).toBe(true);
  });

  it('prefers backend openTaskCount', () => {
    expect(resolveServiceCaseOpenTaskCount(caseRow({ openTaskCount: 2, taskCount: 5 }))).toBe(2);
  });

  it('filters linkable vehicle tasks', () => {
    const tasks = [
      { id: 'a', vehicleId: 'veh-1', serviceCaseId: null, status: 'OPEN' },
      { id: 'b', vehicleId: 'veh-2', serviceCaseId: null, status: 'OPEN' },
      { id: 'c', vehicleId: 'veh-1', serviceCaseId: 'sc-other', status: 'OPEN' },
      { id: 'd', vehicleId: 'veh-1', serviceCaseId: null, status: 'DONE' },
    ];
    expect(filterLinkableVehicleTasks(tasks, 'veh-1', 'sc-1').map((t) => t.id)).toEqual(['a']);
  });
});
