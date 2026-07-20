import { describe, expect, it } from 'vitest';
import type { ApiServiceCase, ApiTask } from '../../../lib/api';
import {
  buildFleetScheduleItems,
  FLEET_SCHEDULE_BUCKET_ORDER,
  getFleetScheduleBucket,
  groupFleetScheduleItems,
} from './fleet-health-service-schedule.utils';

const TZ = 'Europe/Berlin';

function task(overrides: Partial<ApiTask> = {}): ApiTask {
  return {
    id: 'task-1',
    organizationId: 'org-1',
    title: 'Bremsen prüfen',
    description: '',
    type: 'BRAKE_CHECK',
    status: 'OPEN',
    priority: 'HIGH',
    vehicleId: 'veh-1',
    vendorId: 'vendor-1',
    dueDate: '2026-07-20T12:00:00.000Z',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  } as ApiTask;
}

function serviceCase(overrides: Partial<ApiServiceCase> = {}): ApiServiceCase {
  return {
    id: 'sc-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    vendorId: 'vendor-1',
    title: 'Werkstattfall',
    description: '',
    category: 'BRAKES',
    status: 'SCHEDULED',
    priority: 'NORMAL',
    source: 'HEALTH',
    openedAt: '2026-07-01T00:00:00.000Z',
    scheduledAt: '2026-07-22T09:00:00.000Z',
    expectedReadyAt: '2026-07-23T17:00:00.000Z',
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
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    taskCount: 0,
    tasks: [],
    ...overrides,
  };
}

describe('fleet-health-service-schedule.utils', () => {
  const now = new Date('2026-07-20T10:00:00.000Z');

  it('classifies overdue, today and next 7 days in org timezone', () => {
    expect(
      getFleetScheduleBucket('2026-07-19T12:00:00.000Z', { now, timeZone: TZ, dateKind: 'case_workshop' }),
    ).toBe('overdue');
    expect(
      getFleetScheduleBucket('2026-07-20T15:00:00.000Z', { now, timeZone: TZ, dateKind: 'case_workshop' }),
    ).toBe('today');
    expect(
      getFleetScheduleBucket('2026-07-25T09:00:00.000Z', { now, timeZone: TZ, dateKind: 'case_expected_ready' }),
    ).toBe('next_7_days');
    expect(
      getFleetScheduleBucket('2026-08-05T09:00:00.000Z', { now, timeZone: TZ, dateKind: 'case_workshop' }),
    ).toBe('later');
  });

  it('builds separate items for task due, workshop and expected ready', () => {
    const items = buildFleetScheduleItems({
      tasks: [task()],
      serviceCases: [serviceCase()],
      now,
      timeZone: TZ,
    });

    const kinds = items.map((item) => item.dateKind);
    expect(kinds).toContain('task_due');
    expect(kinds).toContain('case_workshop');
    expect(kinds).toContain('case_expected_ready');
    expect(items.filter((item) => item.entityKind === 'service_case')).toHaveLength(2);
  });

  it('places items without dates in no_date bucket', () => {
    const items = buildFleetScheduleItems({
      tasks: [task({ dueDate: null })],
      serviceCases: [serviceCase({ scheduledAt: null, expectedReadyAt: null })],
      now,
      timeZone: TZ,
    });
    expect(items.every((item) => item.bucket === 'no_date')).toBe(true);
  });

  it('groups items by bucket in stable order', () => {
    const items = buildFleetScheduleItems({
      tasks: [
        task({ id: 't-overdue', dueDate: '2026-07-18T10:00:00.000Z' }),
        task({ id: 't-today', dueDate: '2026-07-20T15:00:00.000Z' }),
      ],
      serviceCases: [],
      now,
      timeZone: TZ,
    });
    const groups = groupFleetScheduleItems(items);
    expect(groups.get('overdue')?.[0]?.entityId).toBe('t-overdue');
    expect(groups.get('today')?.[0]?.entityId).toBe('t-today');
    expect(FLEET_SCHEDULE_BUCKET_ORDER).toContain('next_7_days');
  });

  it('ignores terminal service cases and completed tasks', () => {
    const items = buildFleetScheduleItems({
      tasks: [task({ status: 'DONE' })],
      serviceCases: [serviceCase({ status: 'COMPLETED' })],
      now,
      timeZone: TZ,
    });
    expect(items).toHaveLength(0);
  });
});
