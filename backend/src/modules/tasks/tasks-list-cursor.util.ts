import { BadRequestException } from '@nestjs/common';
import { Prisma, TaskPriority } from '@prisma/client';
import type { TaskOperatorBucket } from './task-bucket.util';
import { buildTaskBucketOrderBy } from './task-bucket.util';

export const TASK_LIST_DEFAULT_LIMIT = 50;
export const TASK_LIST_MAX_LIMIT = 100;

export interface TaskListPageMeta {
  limit: number;
  nextCursor: string | null;
}

export interface TaskListPageResult<T> {
  data: T[];
  meta: TaskListPageMeta;
}

export type TaskListSortVariant = 'DEFAULT' | 'TODAY' | 'UPCOMING' | 'PLANNED' | 'COMPLETED';

const PRIORITY_DESC_ORDER: TaskPriority[] = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];

export interface TaskListCursorPayload {
  v: TaskListSortVariant;
  id: string;
  priority?: TaskPriority;
  dueDate?: string | null;
  createdAt?: string;
  activatesAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  updatedAt?: string;
}

export function resolveTaskListLimit(limit?: number): number {
  const requested = limit ?? TASK_LIST_DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(requested)), TASK_LIST_MAX_LIMIT);
}

export function resolveTaskListSortVariant(bucket?: TaskOperatorBucket): TaskListSortVariant {
  switch (bucket) {
    case 'TODAY':
      return 'TODAY';
    case 'UPCOMING':
      return 'UPCOMING';
    case 'PLANNED':
      return 'PLANNED';
    case 'COMPLETED':
      return 'COMPLETED';
    default:
      return 'DEFAULT';
  }
}

export function buildTaskListOrderBy(
  bucket?: TaskOperatorBucket,
): Prisma.OrgTaskOrderByWithRelationInput[] {
  const base = bucket ? buildTaskBucketOrderBy(bucket) : [{ priority: 'desc' as const }, { dueDate: 'asc' as const }, { createdAt: 'desc' as const }];
  return [...base, { id: 'asc' as const }];
}

export function encodeTaskListCursor(payload: TaskListCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeTaskListCursor(cursor: string): TaskListCursorPayload {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as TaskListCursorPayload;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.v !== 'string' || typeof parsed.id !== 'string') {
      throw new Error('invalid cursor payload');
    }
    return parsed;
  } catch {
    throw new BadRequestException({
      message: 'Ungültiger Task-Listen-Cursor.',
      code: 'TASK_LIST_INVALID_CURSOR',
    });
  }
}

function lowerPriorities(priority: TaskPriority): TaskPriority[] {
  const idx = PRIORITY_DESC_ORDER.indexOf(priority);
  if (idx < 0) return [];
  return PRIORITY_DESC_ORDER.slice(idx + 1);
}

function higherPriorities(priority: TaskPriority): TaskPriority[] {
  const idx = PRIORITY_DESC_ORDER.indexOf(priority);
  if (idx <= 0) return [];
  return PRIORITY_DESC_ORDER.slice(0, idx);
}

function dueDateAfterBranch(
  dueDate: Date | null,
  createdAt: Date,
  id: string,
): Prisma.OrgTaskWhereInput[] {
  if (dueDate == null) {
    return [
      { dueDate: { not: null } },
      {
        AND: [
          { dueDate: null },
          { OR: [{ createdAt: { gt: createdAt } }, { AND: [{ createdAt }, { id: { gt: id } }] }] },
        ],
      },
    ];
  }
  return [
    { dueDate: { gt: dueDate } },
    {
      AND: [
        { dueDate },
        { OR: [{ createdAt: { gt: createdAt } }, { AND: [{ createdAt }, { id: { gt: id } }] }] },
      ],
    },
  ];
}

function buildDefaultCursorWhere(payload: TaskListCursorPayload): Prisma.OrgTaskWhereInput {
  const priority = payload.priority ?? 'LOW';
  const dueDate = payload.dueDate ? new Date(payload.dueDate) : null;
  const createdAt = payload.createdAt ? new Date(payload.createdAt) : new Date(0);
  const id = payload.id;

  return {
    OR: [
      { priority: { in: lowerPriorities(priority) } },
      {
        AND: [{ priority }, { OR: dueDateAfterBranch(dueDate, createdAt, id) }],
      },
    ],
  };
}

function buildTodayCursorWhere(payload: TaskListCursorPayload): Prisma.OrgTaskWhereInput {
  const dueDate = payload.dueDate ? new Date(payload.dueDate) : null;
  const priority = payload.priority ?? 'LOW';
  const createdAt = payload.createdAt ? new Date(payload.createdAt) : new Date(0);
  const id = payload.id;

  if (dueDate == null) {
    return { id: { gt: id } };
  }

  return {
    OR: [
      { dueDate: { gt: dueDate } },
      {
        AND: [
          { dueDate },
          {
            OR: [
              { priority: { in: lowerPriorities(priority) } },
              {
                AND: [
                  { priority },
                  { OR: [{ createdAt: { gt: createdAt } }, { AND: [{ createdAt }, { id: { gt: id } }] }] },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function buildUpcomingCursorWhere(payload: TaskListCursorPayload): Prisma.OrgTaskWhereInput {
  const dueDate = payload.dueDate ? new Date(payload.dueDate) : null;
  const activatesAt = payload.activatesAt ? new Date(payload.activatesAt) : null;
  const priority = payload.priority ?? 'LOW';
  const id = payload.id;

  const tail: Prisma.OrgTaskWhereInput[] = [
    { priority: { in: lowerPriorities(priority) } },
    { AND: [{ priority }, { id: { gt: id } }] },
  ];

  if (dueDate == null && activatesAt == null) {
    return { OR: tail };
  }

  return {
    OR: [
      ...(dueDate ? [{ dueDate: { gt: dueDate } }] : []),
      {
        AND: [
          dueDate ? { dueDate } : {},
          activatesAt ? { activatesAt: { gt: activatesAt } } : { id: { gt: id } },
        ].filter((clause) => Object.keys(clause).length > 0),
      },
      ...tail.map((branch) => ({
        AND: [
          dueDate ? { dueDate } : {},
          activatesAt ? { activatesAt } : {},
          branch,
        ].filter((clause) => Object.keys(clause).length > 0),
      })),
    ],
  };
}

function buildPlannedCursorWhere(payload: TaskListCursorPayload): Prisma.OrgTaskWhereInput {
  const activatesAt = payload.activatesAt ? new Date(payload.activatesAt) : null;
  const dueDate = payload.dueDate ? new Date(payload.dueDate) : null;
  const priority = payload.priority ?? 'LOW';
  const id = payload.id;

  if (activatesAt == null) {
    return { id: { gt: id } };
  }

  return {
    OR: [
      { activatesAt: { gt: activatesAt } },
      {
        AND: [
          { activatesAt },
          {
            OR: [
              ...(dueDate ? [{ dueDate: { gt: dueDate } }] : []),
              {
                AND: [
                  dueDate ? { dueDate } : {},
                  {
                    OR: [
                      { priority: { in: lowerPriorities(priority) } },
                      { AND: [{ priority }, { id: { gt: id } }] },
                    ],
                  },
                ].filter((clause) => Object.keys(clause).length > 0),
              },
            ],
          },
        ],
      },
    ],
  };
}

function buildCompletedCursorWhere(payload: TaskListCursorPayload): Prisma.OrgTaskWhereInput {
  const completedAt = payload.completedAt ? new Date(payload.completedAt) : null;
  const cancelledAt = payload.cancelledAt ? new Date(payload.cancelledAt) : null;
  const updatedAt = payload.updatedAt ? new Date(payload.updatedAt) : new Date(0);
  const id = payload.id;

  if (completedAt) {
    return {
      OR: [
        { completedAt: { lt: completedAt } },
        { AND: [{ completedAt }, { id: { gt: id } }] },
      ],
    };
  }

  if (cancelledAt) {
    return {
      OR: [
        { completedAt: null, cancelledAt: { lt: cancelledAt } },
        { AND: [{ completedAt: null }, { cancelledAt }, { id: { gt: id } }] },
      ],
    };
  }

  return {
    OR: [
      { updatedAt: { lt: updatedAt } },
      { AND: [{ updatedAt }, { id: { gt: id } }] },
    ],
  };
}

export function buildTaskListCursorWhere(payload: TaskListCursorPayload): Prisma.OrgTaskWhereInput {
  switch (payload.v) {
    case 'TODAY':
      return buildTodayCursorWhere(payload);
    case 'UPCOMING':
      return buildUpcomingCursorWhere(payload);
    case 'PLANNED':
      return buildPlannedCursorWhere(payload);
    case 'COMPLETED':
      return buildCompletedCursorWhere(payload);
    case 'DEFAULT':
    default:
      return buildDefaultCursorWhere(payload);
  }
}

export function encodeTaskListCursorFromRow(
  row: {
    id: string;
    priority: TaskPriority;
    dueDate: Date | null;
    createdAt: Date;
    activatesAt?: Date | null;
    completedAt?: Date | null;
    cancelledAt?: Date | null;
    updatedAt: Date;
  },
  variant: TaskListSortVariant,
): string {
  return encodeTaskListCursor({
    v: variant,
    id: row.id,
    priority: row.priority,
    dueDate: row.dueDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    activatesAt: row.activatesAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  });
}
