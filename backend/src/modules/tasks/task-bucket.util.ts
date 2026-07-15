import { Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { resolveZonedCalendarDayWindow } from '@modules/bookings/booking-day-window.util';
import { DEFAULT_TARIFF_TIMEZONE } from '@modules/pricing/tariff-instant.util';
import { ACTIVE_TASK_STATUSES, isActiveTaskStatus, isTerminalTaskStatus } from './task-transition.policy';

/** Canonical operator bucket ids (Task Domain V2 §I, server-side source of truth). */
export const TASK_OPERATOR_BUCKETS = [
  'NOW',
  'TODAY',
  'UPCOMING',
  'PLANNED',
  'OVERDUE',
  'UNASSIGNED',
  'ALL_OPEN',
  'COMPLETED',
] as const;

export type TaskOperatorBucket = (typeof TASK_OPERATOR_BUCKETS)[number];

/** Default “Demnächst” horizon — activatesAt / dueDate within the next 72 hours. */
export const TASK_UPCOMING_HORIZON_MS = 72 * 60 * 60 * 1000;

const CRITICAL_NOW_PRIORITIES: TaskPriority[] = ['CRITICAL', 'HIGH'];

export interface TaskBucketInput {
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  activatesAt: Date | null;
  createdAt: Date;
  assignedUserId: string | null;
  blocksVehicleAvailability?: boolean;
}

export interface TaskBucketContext {
  now: Date;
  timeZone: string;
  todayStart: Date;
  todayEnd: Date;
  upcomingEnd: Date;
}

export function createTaskBucketContext(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TARIFF_TIMEZONE,
  upcomingHorizonMs: number = TASK_UPCOMING_HORIZON_MS,
): TaskBucketContext {
  const tz = timeZone.trim() || DEFAULT_TARIFF_TIMEZONE;
  const { todayStart, todayEnd } = resolveZonedCalendarDayWindow(now, tz);
  return {
    now,
    timeZone: tz,
    todayStart,
    todayEnd,
    upcomingEnd: new Date(now.getTime() + upcomingHorizonMs),
  };
}

/** Active + visible: `activatesAt` is null or already reached. */
export function isTaskActivated(
  task: Pick<TaskBucketInput, 'activatesAt'>,
  now: Date,
): boolean {
  if (task.activatesAt == null) return true;
  return task.activatesAt.getTime() <= now.getTime();
}

/** Scheduled for later: active status with future `activatesAt`. */
export function isTaskPlanned(
  task: Pick<TaskBucketInput, 'status' | 'activatesAt'>,
  now: Date,
): boolean {
  return (
    isActiveTaskStatus(task.status) &&
    task.activatesAt != null &&
    task.activatesAt.getTime() > now.getTime()
  );
}

export function isTaskOverdue(task: TaskBucketInput, now: Date): boolean {
  if (!isActiveTaskStatus(task.status)) return false;
  if (!isTaskActivated(task, now)) return false;
  if (!task.dueDate) return false;
  return task.dueDate.getTime() < now.getTime();
}

export function isTaskDueTodayOrg(task: Pick<TaskBucketInput, 'dueDate'>, ctx: TaskBucketContext): boolean {
  if (!task.dueDate) return false;
  const due = task.dueDate.getTime();
  return due >= ctx.todayStart.getTime() && due <= ctx.todayEnd.getTime();
}

export function isTaskUpcoming(task: TaskBucketInput, ctx: TaskBucketContext): boolean {
  if (!isActiveTaskStatus(task.status) || !isTaskActivated(task, ctx.now)) return false;
  if (isTaskOverdue(task, ctx.now)) return false;
  if (isTaskDueTodayOrg(task, ctx)) return false;

  if (task.dueDate) {
    const due = task.dueDate.getTime();
    if (due > ctx.now.getTime() && due <= ctx.upcomingEnd.getTime()) return true;
  }

  if (task.activatesAt && task.activatesAt.getTime() > ctx.now.getTime()) {
    return task.activatesAt.getTime() <= ctx.upcomingEnd.getTime();
  }

  return false;
}

/** “Jetzt erforderlich” — activated, active, and immediately actionable by policy. */
export function isTaskNowRequired(task: TaskBucketInput, now: Date): boolean {
  if (!isActiveTaskStatus(task.status) || !isTaskActivated(task, now)) return false;
  if (isTaskOverdue(task, now)) return true;
  if (task.blocksVehicleAvailability === true) return true;
  return CRITICAL_NOW_PRIORITIES.includes(task.priority);
}

/**
 * Assigns exactly one primary operator bucket (mutually exclusive grouping).
 * Priority: COMPLETED → PLANNED → OVERDUE → NOW → TODAY → UPCOMING → UNASSIGNED → ALL_OPEN.
 */
export function classifyPrimaryTaskBucket(
  task: TaskBucketInput,
  ctx: TaskBucketContext,
): TaskOperatorBucket {
  if (isTerminalTaskStatus(task.status)) return 'COMPLETED';
  if (isTaskPlanned(task, ctx.now)) return 'PLANNED';
  if (isTaskOverdue(task, ctx.now)) return 'OVERDUE';
  if (isTaskNowRequired(task, ctx.now)) return 'NOW';
  if (isTaskDueTodayOrg(task, ctx) && isTaskActivated(task, ctx.now)) return 'TODAY';
  if (isTaskUpcoming(task, ctx)) return 'UPCOMING';
  if (isTaskActivated(task, ctx.now) && !task.assignedUserId) return 'UNASSIGNED';
  if (isActiveTaskStatus(task.status) && isTaskActivated(task, ctx.now)) return 'ALL_OPEN';
  return 'PLANNED';
}

export function taskMatchesBucket(
  task: TaskBucketInput,
  bucket: TaskOperatorBucket,
  ctx: TaskBucketContext,
  opts?: { includeCancelled?: boolean },
): boolean {
  switch (bucket) {
    case 'COMPLETED':
      if (task.status === 'DONE') return true;
      return opts?.includeCancelled !== false && task.status === 'CANCELLED';
    case 'PLANNED':
      return isTaskPlanned(task, ctx.now);
    case 'OVERDUE':
      return isTaskOverdue(task, ctx.now);
    case 'NOW':
      return isTaskNowRequired(task, ctx.now);
    case 'TODAY':
      return (
        isActiveTaskStatus(task.status) &&
        isTaskActivated(task, ctx.now) &&
        isTaskDueTodayOrg(task, ctx) &&
        !isTaskOverdue(task, ctx.now)
      );
    case 'UPCOMING':
      return isTaskUpcoming(task, ctx);
    case 'UNASSIGNED':
      return (
        isActiveTaskStatus(task.status) &&
        isTaskActivated(task, ctx.now) &&
        !task.assignedUserId
      );
    case 'ALL_OPEN':
      return isActiveTaskStatus(task.status) && isTaskActivated(task, ctx.now);
    default:
      return false;
  }
}

function activatedWhere(now: Date): Prisma.OrgTaskWhereInput {
  return {
    OR: [{ activatesAt: null }, { activatesAt: { lte: now } }],
  };
}

function activeStatusWhere(): Prisma.OrgTaskWhereInput {
  return { status: { in: ACTIVE_TASK_STATUSES } };
}

export function buildTaskBucketWhere(
  bucket: TaskOperatorBucket,
  orgId: string,
  ctx: TaskBucketContext,
  opts?: { includeCancelled?: boolean },
): Prisma.OrgTaskWhereInput {
  const base: Prisma.OrgTaskWhereInput = { organizationId: orgId };
  const { now, todayStart, todayEnd, upcomingEnd } = ctx;
  const includeCancelled = opts?.includeCancelled !== false;

  switch (bucket) {
    case 'COMPLETED':
      return {
        ...base,
        status: includeCancelled ? { in: ['DONE', 'CANCELLED'] } : 'DONE',
      };

    case 'PLANNED':
      return {
        ...base,
        ...activeStatusWhere(),
        activatesAt: { gt: now },
      };

    case 'OVERDUE':
      return {
        ...base,
        AND: [
          activeStatusWhere(),
          activatedWhere(now),
          { dueDate: { not: null, lt: now } },
        ],
      };

    case 'NOW':
      return {
        ...base,
        AND: [
          activeStatusWhere(),
          activatedWhere(now),
          {
            OR: [
              { dueDate: { not: null, lt: now } },
              { priority: { in: CRITICAL_NOW_PRIORITIES } },
              { blocksVehicleAvailability: true },
            ],
          },
        ],
      };

    case 'TODAY': {
      const notOverdueTodayStart = new Date(Math.max(now.getTime(), todayStart.getTime()));
      return {
        ...base,
        AND: [
          activeStatusWhere(),
          activatedWhere(now),
          { dueDate: { gte: notOverdueTodayStart, lte: todayEnd } },
        ],
      };
    }

    case 'UPCOMING':
      return {
        ...base,
        AND: [
          activeStatusWhere(),
          {
            OR: [
              {
                AND: [
                  activatedWhere(now),
                  {
                    dueDate: {
                      gt: todayEnd,
                      lte: upcomingEnd,
                    },
                  },
                ],
              },
              {
                activatesAt: {
                  gt: now,
                  lte: upcomingEnd,
                },
              },
            ],
          },
        ],
      };

    case 'UNASSIGNED':
      return {
        ...base,
        AND: [activeStatusWhere(), activatedWhere(now), { assignedUserId: null }],
      };

    case 'ALL_OPEN':
      return {
        ...base,
        AND: [activeStatusWhere(), activatedWhere(now)],
      };

    default:
      return base;
  }
}

export function buildTaskBucketOrderBy(bucket: TaskOperatorBucket): Prisma.OrgTaskOrderByWithRelationInput[] {
  switch (bucket) {
    case 'COMPLETED':
      return [{ completedAt: 'desc' }, { cancelledAt: 'desc' }, { updatedAt: 'desc' }];
    case 'PLANNED':
      return [{ activatesAt: 'asc' }, { dueDate: 'asc' }, { priority: 'desc' }];
    case 'UPCOMING':
      return [{ dueDate: 'asc' }, { activatesAt: 'asc' }, { priority: 'desc' }];
    case 'TODAY':
      return [{ dueDate: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }];
    case 'UNASSIGNED':
      return [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'asc' }];
    case 'OVERDUE':
    case 'NOW':
    case 'ALL_OPEN':
    default:
      return [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'asc' }];
  }
}

export const TASK_BUCKET_SUMMARY_KEYS = TASK_OPERATOR_BUCKETS;

export type TaskBucketSummaryCounts = Record<TaskOperatorBucket, number>;

export function emptyTaskBucketSummaryCounts(): TaskBucketSummaryCounts {
  return {
    NOW: 0,
    TODAY: 0,
    UPCOMING: 0,
    PLANNED: 0,
    OVERDUE: 0,
    UNASSIGNED: 0,
    ALL_OPEN: 0,
    COMPLETED: 0,
  };
}
