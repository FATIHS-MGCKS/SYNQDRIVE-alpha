import { TaskPriority, TaskStatus } from '@prisma/client';
import {
  classifyPrimaryTaskBucket,
  createTaskBucketContext,
  isTaskActivated,
  isTaskDueTodayOrg,
  isTaskNowRequired,
  isTaskOverdue,
  isTaskPlanned,
  isTaskUpcoming,
  taskMatchesBucket,
  TASK_UPCOMING_HORIZON_MS,
  type TaskBucketInput,
} from './task-bucket.util';

function task(over: Partial<TaskBucketInput> = {}): TaskBucketInput {
  return {
    status: 'OPEN',
    priority: 'NORMAL',
    dueDate: null,
    activatesAt: null,
    createdAt: new Date('2026-07-15T08:00:00.000Z'),
    assignedUserId: 'u1',
    blocksVehicleAvailability: false,
    ...over,
  };
}

describe('task-bucket.util', () => {
  describe('activation semantics', () => {
    const now = new Date('2026-07-15T12:00:00.000Z');

    it('treats null activatesAt as immediately active', () => {
      expect(isTaskActivated(task({ activatesAt: null }), now)).toBe(true);
    });

    it('treats past activatesAt as active', () => {
      expect(isTaskActivated(task({ activatesAt: new Date('2026-07-15T10:00:00.000Z') }), now)).toBe(true);
    });

    it('treats future activatesAt as not yet active', () => {
      expect(isTaskActivated(task({ activatesAt: new Date('2026-07-16T08:00:00.000Z') }), now)).toBe(false);
      expect(isTaskPlanned(task({ activatesAt: new Date('2026-07-16T08:00:00.000Z') }), now)).toBe(true);
    });

    it('does not use createdAt as activation fallback', () => {
      const futureActivates = new Date('2026-07-20T08:00:00.000Z');
      expect(
        isTaskActivated(
          task({
            activatesAt: futureActivates,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          }),
          now,
        ),
      ).toBe(false);
    });
  });

  describe('overdue semantics', () => {
    const now = new Date('2026-07-15T12:00:00.000Z');

    it('is overdue only when active, activated, and dueDate is in the past', () => {
      expect(
        isTaskOverdue(
          task({ dueDate: new Date('2026-07-14T12:00:00.000Z') }),
          now,
        ),
      ).toBe(true);
    });

    it('is not overdue before activatesAt even with past dueDate', () => {
      expect(
        isTaskOverdue(
          task({
            dueDate: new Date('2026-07-14T12:00:00.000Z'),
            activatesAt: new Date('2026-07-16T08:00:00.000Z'),
          }),
          now,
        ),
      ).toBe(false);
    });

    it('is not overdue without dueDate', () => {
      expect(isTaskOverdue(task({ dueDate: null }), now)).toBe(false);
    });

    it('is not overdue for completed tasks', () => {
      expect(
        isTaskOverdue(
          task({
            status: 'DONE',
            dueDate: new Date('2026-07-01T00:00:00.000Z'),
          }),
          now,
        ),
      ).toBe(false);
    });
  });

  describe('org timezone — today boundaries', () => {
    it('classifies due today in Europe/Berlin summer (late UTC evening → next org day)', () => {
      const now = new Date('2026-07-12T23:17:00.000Z');
      const ctx = createTaskBucketContext(now, 'Europe/Berlin');
      const row = task({
        dueDate: new Date('2026-07-13T10:00:00.000Z'),
        activatesAt: null,
      });

      expect(isTaskDueTodayOrg(row, ctx)).toBe(true);
      expect(classifyPrimaryTaskBucket(row, ctx)).toBe('TODAY');
    });

    it('classifies due today in Europe/Berlin winter (CET)', () => {
      const now = new Date('2026-01-15T10:00:00.000Z');
      const ctx = createTaskBucketContext(now, 'Europe/Berlin');
      const row = task({
        dueDate: new Date('2026-01-15T18:00:00.000Z'),
      });

      expect(isTaskDueTodayOrg(row, ctx)).toBe(true);
      expect(classifyPrimaryTaskBucket(row, ctx)).toBe('TODAY');
    });

    it('does not mark overdue morning task as TODAY when due was yesterday org day', () => {
      const now = new Date('2026-07-15T06:00:00.000Z');
      const ctx = createTaskBucketContext(now, 'Europe/Berlin');
      const row = task({
        dueDate: new Date('2026-07-14T20:00:00.000Z'),
      });

      expect(isTaskDueTodayOrg(row, ctx)).toBe(false);
      expect(classifyPrimaryTaskBucket(row, ctx)).toBe('OVERDUE');
    });
  });

  describe('midnight boundary', () => {
    it('marks org-day start due time as OVERDUE once the instant has passed', () => {
      const now = new Date('2026-07-15T00:30:00.000Z');
      const ctx = createTaskBucketContext(now, 'Europe/Berlin');
      const row = task({
        dueDate: new Date('2026-07-14T22:00:00.000Z'),
      });

      expect(classifyPrimaryTaskBucket(row, ctx)).toBe('OVERDUE');
    });

    it('keeps later same-org-day due time in TODAY', () => {
      const now = new Date('2026-07-15T10:00:00.000Z');
      const ctx = createTaskBucketContext(now, 'Europe/Berlin');
      const row = task({
        dueDate: new Date('2026-07-15T18:00:00.000Z'),
      });

      expect(classifyPrimaryTaskBucket(row, ctx)).toBe('TODAY');
    });
  });

  describe('primary bucket exclusivity', () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    const ctx = createTaskBucketContext(now, 'Europe/Berlin');

    it('prefers OVERDUE over UNASSIGNED', () => {
      expect(
        classifyPrimaryTaskBucket(
          task({
            dueDate: new Date('2026-07-10T00:00:00.000Z'),
            assignedUserId: null,
          }),
          ctx,
        ),
      ).toBe('OVERDUE');
    });

    it('prefers NOW for critical non-overdue tasks', () => {
      expect(
        classifyPrimaryTaskBucket(
          task({
            priority: 'CRITICAL',
            dueDate: new Date('2026-07-20T00:00:00.000Z'),
          }),
          ctx,
        ),
      ).toBe('NOW');
    });

    it('classifies completed tasks as COMPLETED', () => {
      expect(classifyPrimaryTaskBucket(task({ status: 'DONE' }), ctx)).toBe('COMPLETED');
      expect(classifyPrimaryTaskBucket(task({ status: 'CANCELLED' }), ctx)).toBe('COMPLETED');
    });

    it('classifies future activatesAt as PLANNED', () => {
      expect(
        classifyPrimaryTaskBucket(
          task({ activatesAt: new Date('2026-07-18T08:00:00.000Z') }),
          ctx,
        ),
      ).toBe('PLANNED');
    });

    it('classifies upcoming due within 72h', () => {
      const due = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      expect(classifyPrimaryTaskBucket(task({ dueDate: due }), ctx)).toBe('UPCOMING');
    });
  });

  describe('DST transitions (Europe/Berlin)', () => {
    it('resolves spring-forward day boundaries', () => {
      const now = new Date('2026-03-29T12:00:00.000Z');
      const ctx = createTaskBucketContext(now, 'Europe/Berlin');
      const row = task({
        dueDate: new Date('2026-03-29T15:00:00.000Z'),
      });
      expect(isTaskDueTodayOrg(row, ctx)).toBe(true);
    });

    it('resolves fall-back day boundaries', () => {
      const now = new Date('2026-10-25T12:00:00.000Z');
      const ctx = createTaskBucketContext(now, 'Europe/Berlin');
      const row = task({
        dueDate: new Date('2026-10-25T16:00:00.000Z'),
      });
      expect(isTaskDueTodayOrg(row, ctx)).toBe(true);
    });
  });

  describe('taskMatchesBucket', () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    const ctx = createTaskBucketContext(now, 'Europe/Berlin');

    it('matches NOW for blocking vehicle availability', () => {
      expect(
        taskMatchesBucket(
          task({ blocksVehicleAvailability: true, dueDate: new Date('2026-08-01T00:00:00.000Z') }),
          'NOW',
          ctx,
        ),
      ).toBe(true);
      expect(isTaskNowRequired(task({ blocksVehicleAvailability: true }), now)).toBe(true);
    });

    it('matches UPCOMING within horizon', () => {
      const due = new Date(now.getTime() + TASK_UPCOMING_HORIZON_MS - 60_000);
      expect(taskMatchesBucket(task({ dueDate: due }), 'UPCOMING', ctx)).toBe(true);
    });
  });
});
