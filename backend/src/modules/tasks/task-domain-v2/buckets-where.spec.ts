/**
 * Task Domain V2 — Activation buckets + buildTaskBucketWhere (E)
 * Complements task-bucket.util.spec.ts with operator-bucket matrix + Prisma where.
 */
import { TaskPriority, TaskStatus } from '@prisma/client';
import {
  buildTaskBucketWhere,
  createTaskBucketContext,
  taskMatchesBucket,
  TASK_UPCOMING_HORIZON_MS,
  type TaskBucketInput,
  type TaskOperatorBucket,
} from '../task-bucket.util';

const OPERATOR_BUCKETS: TaskOperatorBucket[] = [
  'NOW',
  'TODAY',
  'UPCOMING',
  'PLANNED',
  'OVERDUE',
  'UNASSIGNED',
];

function row(over: Partial<TaskBucketInput> = {}): TaskBucketInput {
  return {
    status: TaskStatus.OPEN,
    priority: TaskPriority.NORMAL,
    dueDate: null,
    activatesAt: null,
    createdAt: new Date('2026-07-15T08:00:00.000Z'),
    assignedUserId: 'u1',
    blocksVehicleAvailability: false,
    ...over,
  };
}

describe('Task Domain V2 — Buckets (E)', () => {
  const tz = 'Europe/Berlin';
  const now = new Date('2026-07-15T12:00:00.000Z');
  const ctx = createTaskBucketContext(now, tz);

  describe('taskMatchesBucket matrix', () => {
    it('NOW matches critical priority', () => {
      expect(taskMatchesBucket(row({ priority: 'CRITICAL' }), 'NOW', ctx)).toBe(true);
    });

    it('TODAY matches due today in org timezone', () => {
      expect(
        taskMatchesBucket(row({ dueDate: new Date('2026-07-15T18:00:00.000Z') }), 'TODAY', ctx),
      ).toBe(true);
    });

    it('UPCOMING matches due within 72h horizon', () => {
      const due = new Date(now.getTime() + TASK_UPCOMING_HORIZON_MS - 60_000);
      expect(taskMatchesBucket(row({ dueDate: due }), 'UPCOMING', ctx)).toBe(true);
    });

    it('PLANNED matches future activatesAt', () => {
      expect(
        taskMatchesBucket(row({ activatesAt: new Date('2026-07-18T08:00:00.000Z') }), 'PLANNED', ctx),
      ).toBe(true);
    });

    it('OVERDUE matches past due open task', () => {
      expect(
        taskMatchesBucket(row({ dueDate: new Date('2026-07-14T12:00:00.000Z') }), 'OVERDUE', ctx),
      ).toBe(true);
    });

    it('UNASSIGNED matches task without assignee', () => {
      expect(
        taskMatchesBucket(row({ assignedUserId: null }), 'UNASSIGNED', ctx),
      ).toBe(true);
    });

    it('terminal tasks do not match operational buckets', () => {
      const done = row({ status: TaskStatus.DONE });
      for (const bucket of ['NOW', 'TODAY', 'OVERDUE'] as TaskOperatorBucket[]) {
        expect(taskMatchesBucket(done, bucket, ctx)).toBe(false);
      }
    });
  });

  describe('DST boundary (Europe/Berlin)', () => {
    it('TODAY respects DST spring-forward day', () => {
      const springCtx = createTaskBucketContext(new Date('2026-03-29T12:00:00.000Z'), tz);
      expect(
        taskMatchesBucket(row({ dueDate: new Date('2026-03-29T15:00:00.000Z') }), 'TODAY', springCtx),
      ).toBe(true);
    });

    it('TODAY respects DST fall-back day', () => {
      const fallCtx = createTaskBucketContext(new Date('2026-10-25T12:00:00.000Z'), tz);
      expect(
        taskMatchesBucket(row({ dueDate: new Date('2026-10-25T16:00:00.000Z') }), 'TODAY', fallCtx),
      ).toBe(true);
    });
  });

  describe('buildTaskBucketWhere', () => {
    it.each(OPERATOR_BUCKETS)('buildTaskBucketWhere(%s) returns org-scoped Prisma where', (bucket) => {
      const where = buildTaskBucketWhere(bucket, 'org1', ctx);
      expect(where.organizationId).toBe('org1');
      expect(where).toBeDefined();
    });

    it('UNASSIGNED where includes assignedUserId null', () => {
      const where = buildTaskBucketWhere('UNASSIGNED', 'org1', ctx);
      expect(JSON.stringify(where)).toContain('assignedUserId');
    });
  });
});
