import { TaskCompletionMode, TaskType } from '@prisma/client';
import {
  groupActiveDuplicates,
  inferCompletedAt,
  inferCompletionMode,
  pickCanonicalTask,
} from './task-data-repair.util';
import type { RepairTaskRow } from './task-data-repair.types';

function task(overrides: Partial<RepairTaskRow> = {}): RepairTaskRow {
  return {
    id: 'task-1',
    organizationId: 'org-1',
    title: 'Test',
    status: 'DONE',
    type: TaskType.CUSTOM,
    completionMode: null,
    completedAt: null,
    completedByUserId: null,
    cancelledAt: null,
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-02T10:00:00.000Z'),
    activatesAt: null,
    dueDate: null,
    resolutionNote: null,
    resolutionCode: null,
    assignedUserId: null,
    supersededByTaskId: null,
    bookingId: null,
    vehicleId: null,
    invoiceId: null,
    documentId: null,
    source: null,
    dedupKey: null,
    metadata: null,
    checklistItems: [],
    events: [],
    ...overrides,
  };
}

describe('task-data-repair.util', () => {
  it('infers MANUAL when completedByUserId is set', () => {
    expect(inferCompletionMode(task({ completedByUserId: 'user-1' }))).toBe(TaskCompletionMode.MANUAL);
  });

  it('infers AUTO_RESOLVED for system source without actor', () => {
    expect(
      inferCompletionMode(task({ source: 'BOOKING', completedByUserId: null })),
    ).toBe(TaskCompletionMode.AUTO_RESOLVED);
  });

  it('returns null for unclear completion provenance', () => {
    expect(inferCompletionMode(task({ source: null, completedByUserId: null }))).toBeNull();
  });

  it('infers SUPERSEDED from supersededByTaskId', () => {
    expect(
      inferCompletionMode(task({ supersededByTaskId: 'task-canonical' })),
    ).toBe(TaskCompletionMode.SUPERSEDED);
  });

  it('infers completedAt from completion event timestamp', () => {
    const completedAt = new Date('2026-07-03T12:00:00.000Z');
    expect(
      inferCompletedAt(
        task({
          events: [{ type: 'AUTO_RESOLVED', oldValue: 'OPEN', newValue: 'DONE', createdAt: completedAt }],
        }),
      ),
    ).toEqual(completedAt);
  });

  it('prefers canonical dedup key when picking duplicate winner', () => {
    const canonical = task({
      id: 'canonical',
      status: 'OPEN',
      type: TaskType.BOOKING_PREPARATION,
      bookingId: 'b1',
      dedupKey: 'booking:prep:b1',
      createdAt: new Date('2026-07-02T10:00:00.000Z'),
    });
    const duplicate = task({
      id: 'duplicate',
      status: 'OPEN',
      type: TaskType.BOOKING_PREPARATION,
      bookingId: 'b1',
      dedupKey: 'legacy:prep:b1',
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
    });

    expect(pickCanonicalTask([duplicate, canonical]).id).toBe('canonical');
  });

  it('groups active booking preparation duplicates', () => {
    const groups = groupActiveDuplicates([
      task({
        id: 'a',
        status: 'OPEN',
        type: TaskType.BOOKING_PREPARATION,
        bookingId: 'b1',
        dedupKey: 'booking:prep:b1',
      }),
      task({
        id: 'b',
        status: 'IN_PROGRESS',
        type: TaskType.BOOKING_PREPARATION,
        bookingId: 'b1',
        dedupKey: 'booking:prep:b1',
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });
});
