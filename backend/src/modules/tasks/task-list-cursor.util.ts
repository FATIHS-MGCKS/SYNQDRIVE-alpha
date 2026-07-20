import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type TaskOperatorBucket } from './task-bucket.util';

export const TASK_LIST_DEFAULT_LIMIT = 50;
export const TASK_LIST_MAX_LIMIT = 100;
/** Safety cap for legacy callers that omit limit/cursor (replaces unbounded reads). */
export const TASK_LIST_LEGACY_MAX_LIMIT = 500;

export type TaskListSortVariant = TaskOperatorBucket | 'DEFAULT';

export interface TaskListPageMeta {
  limit: number;
  nextCursor: string | null;
}

export interface TaskListPageResult<T> {
  data: T[];
  meta: TaskListPageMeta;
}

export type SortDirection = 'asc' | 'desc';

export type TaskListSortField =
  | 'priority'
  | 'dueDate'
  | 'createdAt'
  | 'activatesAt'
  | 'completedAt'
  | 'cancelledAt'
  | 'updatedAt'
  | 'id';

export interface TaskListSortFieldSpec {
  field: TaskListSortField;
  direction: SortDirection;
}

export interface TaskListCursorPayload {
  v: TaskListSortVariant;
  id: string;
  priority?: string;
  dueDate?: string | null;
  createdAt?: string;
  activatesAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  updatedAt?: string;
}

type CursorComparable = Date | string | null;

export function resolveTaskListSortVariant(bucket?: TaskOperatorBucket): TaskListSortVariant {
  return bucket ?? 'DEFAULT';
}

export function resolveTaskListLimit(limit?: number): number {
  const requested = limit ?? TASK_LIST_DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(requested)), TASK_LIST_MAX_LIMIT);
}

export function isTaskListPaginatedRequest(filters: {
  limit?: number;
  cursor?: string;
}): boolean {
  return filters.limit != null || (filters.cursor != null && filters.cursor.trim() !== '');
}

export function buildTaskListOrderBy(bucket?: TaskOperatorBucket): Prisma.OrgTaskOrderByWithRelationInput[] {
  const specs = taskListSortSpecs(resolveTaskListSortVariant(bucket));
  return specs.map((spec) => ({ [spec.field]: spec.direction })) as Prisma.OrgTaskOrderByWithRelationInput[];
}

export function taskListSortSpecs(variant: TaskListSortVariant): TaskListSortFieldSpec[] {
  switch (variant) {
    case 'COMPLETED':
      return [
        { field: 'completedAt', direction: 'desc' },
        { field: 'cancelledAt', direction: 'desc' },
        { field: 'updatedAt', direction: 'desc' },
        { field: 'id', direction: 'asc' },
      ];
    case 'PLANNED':
      return [
        { field: 'activatesAt', direction: 'asc' },
        { field: 'dueDate', direction: 'asc' },
        { field: 'priority', direction: 'desc' },
        { field: 'id', direction: 'asc' },
      ];
    case 'UPCOMING':
      return [
        { field: 'dueDate', direction: 'asc' },
        { field: 'activatesAt', direction: 'asc' },
        { field: 'priority', direction: 'desc' },
        { field: 'id', direction: 'asc' },
      ];
    case 'TODAY':
      return [
        { field: 'dueDate', direction: 'asc' },
        { field: 'priority', direction: 'desc' },
        { field: 'createdAt', direction: 'asc' },
        { field: 'id', direction: 'asc' },
      ];
    case 'UNASSIGNED':
    case 'OVERDUE':
    case 'NOW':
    case 'ALL_OPEN':
      return [
        { field: 'priority', direction: 'desc' },
        { field: 'dueDate', direction: 'asc' },
        { field: 'createdAt', direction: 'asc' },
        { field: 'id', direction: 'asc' },
      ];
    case 'DEFAULT':
    default:
      return [
        { field: 'priority', direction: 'desc' },
        { field: 'dueDate', direction: 'asc' },
        { field: 'createdAt', direction: 'desc' },
        { field: 'id', direction: 'asc' },
      ];
  }
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
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
      message: 'Ungültiger Aufgaben-Cursor.',
      code: 'TASK_LIST_INVALID_CURSOR',
    });
  }
}

export function assertTaskListCursorMatchesSort(
  cursor: TaskListCursorPayload,
  expectedVariant: TaskListSortVariant,
): void {
  if (cursor.v !== expectedVariant) {
    throw new BadRequestException({
      message: 'Der Cursor passt nicht zur aktuellen Sortierung oder zum Bucket-Filter.',
      code: 'TASK_LIST_CURSOR_SORT_MISMATCH',
    });
  }
}

function cursorValueForField(
  task: Record<string, unknown>,
  field: TaskListSortField,
): CursorComparable {
  switch (field) {
    case 'priority':
      return typeof task.priority === 'string' ? task.priority : null;
    case 'id':
      return typeof task.id === 'string' ? task.id : null;
    case 'dueDate':
    case 'createdAt':
    case 'activatesAt':
    case 'completedAt':
    case 'cancelledAt':
    case 'updatedAt': {
      const value = task[field];
      if (value == null) return null;
      if (value instanceof Date) return value;
      if (typeof value === 'string') return new Date(value);
      return null;
    }
    default:
      return null;
  }
}

export function encodeTaskListCursorFromTask(
  task: Record<string, unknown>,
  variant: TaskListSortVariant,
): string {
  return encodeTaskListCursor({
    v: variant,
    id: String(task.id),
    priority: typeof task.priority === 'string' ? task.priority : undefined,
    dueDate: toIso(task.dueDate as Date | string | null | undefined),
    createdAt: toIso(task.createdAt as Date | string | null | undefined) ?? undefined,
    activatesAt: toIso(task.activatesAt as Date | string | null | undefined),
    completedAt: toIso(task.completedAt as Date | string | null | undefined),
    cancelledAt: toIso(task.cancelledAt as Date | string | null | undefined),
    updatedAt: toIso(task.updatedAt as Date | string | null | undefined) ?? undefined,
  });
}

function parseCursorFieldValue(
  field: TaskListSortField,
  payload: TaskListCursorPayload,
): CursorComparable {
  switch (field) {
    case 'priority':
      return payload.priority ?? null;
    case 'id':
      return payload.id;
    case 'dueDate':
      return payload.dueDate ? new Date(payload.dueDate) : null;
    case 'activatesAt':
      return payload.activatesAt ? new Date(payload.activatesAt) : null;
    case 'completedAt':
      return payload.completedAt ? new Date(payload.completedAt) : null;
    case 'cancelledAt':
      return payload.cancelledAt ? new Date(payload.cancelledAt) : null;
    case 'createdAt':
      return payload.createdAt ? new Date(payload.createdAt) : new Date(0);
    case 'updatedAt':
      return payload.updatedAt ? new Date(payload.updatedAt) : new Date(0);
    default:
      return null;
  }
}

function compareScalar(a: CursorComparable, b: CursorComparable): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function fieldCondition(
  field: TaskListSortField,
  op: 'gt' | 'lt' | 'equals',
  value: CursorComparable,
): Prisma.OrgTaskWhereInput {
  if (value == null) {
    if (op === 'equals') return { [field]: null } as Prisma.OrgTaskWhereInput;
    return { [field]: { not: null } } as Prisma.OrgTaskWhereInput;
  }

  if (field === 'priority' || field === 'id') {
    return { [field]: { [op]: value } } as Prisma.OrgTaskWhereInput;
  }

  return { [field]: { [op]: value } } as Prisma.OrgTaskWhereInput;
}

function buildAfterCursorBranch(
  specs: TaskListSortFieldSpec[],
  payload: TaskListCursorPayload,
  depth = 0,
): Prisma.OrgTaskWhereInput {
  if (depth >= specs.length) {
    return { id: { gt: payload.id } };
  }

  const spec = specs[depth]!;
  const cursorValue = parseCursorFieldValue(spec.field, payload);
  const compareOp: 'gt' | 'lt' = spec.direction === 'asc' ? 'gt' : 'lt';
  const branches: Prisma.OrgTaskWhereInput[] = [];

  if (cursorValue == null) {
    if (spec.direction === 'asc') {
      branches.push(fieldCondition(spec.field, 'gt', null));
      branches.push({
        AND: [fieldCondition(spec.field, 'equals', null), buildAfterCursorBranch(specs, payload, depth + 1)],
      });
    } else {
      branches.push(buildAfterCursorBranch(specs, payload, depth + 1));
    }
    return { OR: branches };
  }

  branches.push(fieldCondition(spec.field, compareOp, cursorValue));
  branches.push({
    AND: [
      fieldCondition(spec.field, 'equals', cursorValue),
      buildAfterCursorBranch(specs, payload, depth + 1),
    ],
  });

  return { OR: branches };
}

export function buildTaskListCursorWhere(
  payload: TaskListCursorPayload,
  variant: TaskListSortVariant,
): Prisma.OrgTaskWhereInput {
  assertTaskListCursorMatchesSort(payload, variant);
  return buildAfterCursorBranch(taskListSortSpecs(variant), payload);
}

export function taskRowMatchesCursor(
  task: Record<string, unknown>,
  payload: TaskListCursorPayload,
  variant: TaskListSortVariant,
): boolean {
  const specs = taskListSortSpecs(variant);
  for (const spec of specs) {
    const left = cursorValueForField(task, spec.field);
    const right = parseCursorFieldValue(spec.field, payload);
    if (!compareScalar(left, right)) return false;
  }
  return true;
}
