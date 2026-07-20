import { describe, expect, it } from 'vitest';
import type { ApiServiceCase, ApiTask, VehicleServiceEventRecord } from '../../lib/api';
import {
  applyUnifiedServiceHistoryFilters,
  buildUnifiedServiceHistory,
  paginateUnifiedServiceHistory,
} from './unified-service-history.utils';

function task(overrides: Partial<ApiTask> = {}): ApiTask {
  return {
    id: 'task-1',
    organizationId: 'org-1',
    title: 'Bremsen prüfen',
    description: '',
    type: 'BRAKE_CHECK',
    status: 'DONE',
    priority: 'HIGH',
    vehicleId: 'veh-1',
    vendorId: 'vendor-1',
    dueDate: null,
    completedAt: '2026-07-18T14:00:00.000Z',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-18T14:00:00.000Z',
    ...overrides,
  } as ApiTask;
}

function serviceCase(overrides: Partial<ApiServiceCase> = {}): ApiServiceCase {
  return {
    id: 'sc-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    vendorId: 'vendor-1',
    title: 'Werkstattfall Bremsen',
    description: '',
    category: 'BRAKES',
    status: 'COMPLETED',
    priority: 'NORMAL',
    source: 'HEALTH',
    openedAt: '2026-07-10T08:00:00.000Z',
    scheduledAt: '2026-07-12T09:00:00.000Z',
    expectedReadyAt: null,
    completedAt: '2026-07-18T16:00:00.000Z',
    cancelledAt: null,
    estimatedCostCents: null,
    actualCostCents: null,
    downtimeStart: null,
    downtimeEnd: null,
    blocksRental: false,
    completionNotes: 'Erledigt',
    documentId: 'doc-1',
    metadata: null,
    createdByUserId: 'user-1',
    updatedByUserId: 'user-2',
    createdAt: '2026-07-10T08:00:00.000Z',
    updatedAt: '2026-07-18T16:00:00.000Z',
    taskCount: 1,
    tasks: [],
    attachments: [],
    ...overrides,
  };
}

describe('unified-service-history.utils', () => {
  it('builds entries for tasks, cases, milestones and service events', () => {
    const events: VehicleServiceEventRecord[] = [
      {
        id: 'evt-1',
        vehicleId: 'veh-1',
        eventType: 'SERVICE',
        eventDate: '2026-07-15T10:00:00.000Z',
        odometerKm: 12000,
        notes: 'Inspektion',
        workshopName: 'Werkstatt Nord',
        costCents: 15000,
        provider: null,
        documentUrl: null,
        origin: 'MANUAL',
        createdById: 'user-1',
        updatedById: null,
        createdAt: '2026-07-15T10:00:00.000Z',
        updatedAt: '2026-07-15T10:00:00.000Z',
      },
    ];

    const entries = buildUnifiedServiceHistory({
      tasks: [task()],
      serviceCases: [serviceCase()],
      serviceEvents: events,
    });

    const kinds = entries.map((entry) => entry.kind);
    expect(kinds).toContain('task_completed');
    expect(kinds).toContain('case_completed');
    expect(kinds).toContain('case_status_change');
    expect(kinds).toContain('service_event');
    expect(kinds).toContain('linked_document');
  });

  it('suppresses linked task when parent service case is terminal', () => {
    const entries = buildUnifiedServiceHistory({
      tasks: [task({ id: 'task-linked', serviceCaseId: 'sc-1' })],
      serviceCases: [serviceCase({ id: 'sc-1' })],
    });

    expect(entries.some((entry) => entry.kind === 'task_completed')).toBe(false);
    expect(entries.some((entry) => entry.kind === 'case_completed')).toBe(true);
  });

  it('deduplicates document links by document id', () => {
    const entries = buildUnifiedServiceHistory({
      tasks: [task({ documentId: 'doc-1' })],
      serviceCases: [serviceCase({ documentId: 'doc-1' })],
    });

    const documentEntries = entries.filter((entry) => entry.kind === 'linked_document');
    expect(documentEntries).toHaveLength(1);
    expect(documentEntries[0]?.dedupeKey).toBe('document:doc-1');
  });

  it('filters cancelled entries unless includeCancelled is true', () => {
    const entries = buildUnifiedServiceHistory({
      tasks: [task({ id: 't-done' }), task({ id: 't-cancel', status: 'CANCELLED', completedAt: null, cancelledAt: '2026-07-17T10:00:00.000Z' })],
      serviceCases: [serviceCase({ id: 'sc-cancel', status: 'CANCELLED', completedAt: null, cancelledAt: '2026-07-16T10:00:00.000Z' })],
    });

    const withoutCancelled = applyUnifiedServiceHistoryFilters(entries, {
      vehicleId: 'ALL',
      vendorId: 'ALL',
      type: 'ALL',
      dateFrom: '',
      dateTo: '',
      includeCancelled: false,
      kind: 'ALL',
    });
    expect(withoutCancelled.some((entry) => entry.kind === 'task_cancelled')).toBe(false);
    expect(withoutCancelled.some((entry) => entry.kind === 'case_cancelled')).toBe(false);

    const withCancelled = applyUnifiedServiceHistoryFilters(entries, {
      vehicleId: 'ALL',
      vendorId: 'ALL',
      type: 'ALL',
      dateFrom: '',
      dateTo: '',
      includeCancelled: true,
      kind: 'ALL',
    });
    expect(withCancelled.some((entry) => entry.kind === 'task_cancelled')).toBe(true);
    expect(withCancelled.some((entry) => entry.kind === 'case_cancelled')).toBe(true);
  });

  it('paginates unified history entries', () => {
    const entries = buildUnifiedServiceHistory({
      tasks: [
        task({ id: 't1', completedAt: '2026-07-20T10:00:00.000Z' }),
        task({ id: 't2', completedAt: '2026-07-19T10:00:00.000Z' }),
        task({ id: 't3', completedAt: '2026-07-18T10:00:00.000Z' }),
      ],
      serviceCases: [],
    });

    const page1 = paginateUnifiedServiceHistory(entries, { offset: 0, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBeGreaterThanOrEqual(3);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextOffset).toBe(2);

    const page2 = paginateUnifiedServiceHistory(entries, { offset: 2, limit: 2 });
    expect(page2.hasMore).toBe(false);
  });
});
