import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const SERVICE_CASE_LIST_DEFAULT_LIMIT = 50;
export const SERVICE_CASE_LIST_MAX_LIMIT = 100;
/** Safety cap for legacy callers that omit limit/cursor (replaces unbounded reads). */
export const SERVICE_CASE_LIST_LEGACY_MAX_LIMIT = 500;

export const SERVICE_CASE_LIST_SORT_VARIANT = 'DEFAULT' as const;
export type ServiceCaseListSortVariant = typeof SERVICE_CASE_LIST_SORT_VARIANT;

export interface ServiceCaseListPageMeta {
  limit: number;
  nextCursor: string | null;
}

export interface ServiceCaseListPageResult<T> {
  data: T[];
  meta: ServiceCaseListPageMeta;
}

export type SortDirection = 'asc' | 'desc';

export type ServiceCaseListSortField = 'status' | 'openedAt' | 'id';

export interface ServiceCaseListSortFieldSpec {
  field: ServiceCaseListSortField;
  direction: SortDirection;
}

export interface ServiceCaseListCursorPayload {
  v: ServiceCaseListSortVariant;
  id: string;
  status?: string;
  openedAt?: string;
}

type CursorComparable = Date | string | null;

export function resolveServiceCaseListLimit(limit?: number): number {
  const requested = limit ?? SERVICE_CASE_LIST_DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(requested)), SERVICE_CASE_LIST_MAX_LIMIT);
}

export function isServiceCaseListPaginatedRequest(filters: {
  limit?: number;
  cursor?: string;
}): boolean {
  return filters.limit != null || (filters.cursor != null && filters.cursor.trim() !== '');
}

export function serviceCaseListSortSpecs(): ServiceCaseListSortFieldSpec[] {
  return [
    { field: 'status', direction: 'asc' },
    { field: 'openedAt', direction: 'desc' },
    { field: 'id', direction: 'asc' },
  ];
}

export function buildServiceCaseListOrderBy(): Prisma.ServiceCaseOrderByWithRelationInput[] {
  return serviceCaseListSortSpecs().map((spec) => ({
    [spec.field]: spec.direction,
  })) as Prisma.ServiceCaseOrderByWithRelationInput[];
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function encodeServiceCaseListCursor(payload: ServiceCaseListCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeServiceCaseListCursor(cursor: string): ServiceCaseListCursorPayload {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as ServiceCaseListCursorPayload;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.v !== 'string' || typeof parsed.id !== 'string') {
      throw new Error('invalid cursor payload');
    }
    return parsed;
  } catch {
    throw new BadRequestException({
      message: 'Ungültiger Service-Case-Cursor.',
      code: 'SERVICE_CASE_LIST_INVALID_CURSOR',
    });
  }
}

export function assertServiceCaseListCursorMatchesSort(cursor: ServiceCaseListCursorPayload): void {
  if (cursor.v !== SERVICE_CASE_LIST_SORT_VARIANT) {
    throw new BadRequestException({
      message: 'Der Cursor passt nicht zur aktuellen Sortierung.',
      code: 'SERVICE_CASE_LIST_CURSOR_SORT_MISMATCH',
    });
  }
}

function cursorValueForField(
  row: Record<string, unknown>,
  field: ServiceCaseListSortField,
): CursorComparable {
  switch (field) {
    case 'status':
      return typeof row.status === 'string' ? row.status : null;
    case 'id':
      return typeof row.id === 'string' ? row.id : null;
    case 'openedAt': {
      const value = row.openedAt;
      if (value == null) return null;
      if (value instanceof Date) return value;
      if (typeof value === 'string') return new Date(value);
      return null;
    }
    default:
      return null;
  }
}

export function encodeServiceCaseListCursorFromRow(row: Record<string, unknown>): string {
  return encodeServiceCaseListCursor({
    v: SERVICE_CASE_LIST_SORT_VARIANT,
    id: String(row.id),
    status: typeof row.status === 'string' ? row.status : undefined,
    openedAt: toIso(row.openedAt as Date | string | null | undefined) ?? undefined,
  });
}

function parseCursorFieldValue(
  field: ServiceCaseListSortField,
  payload: ServiceCaseListCursorPayload,
): CursorComparable {
  switch (field) {
    case 'status':
      return payload.status ?? null;
    case 'id':
      return payload.id;
    case 'openedAt':
      return payload.openedAt ? new Date(payload.openedAt) : new Date(0);
    default:
      return null;
  }
}

function fieldCondition(
  field: ServiceCaseListSortField,
  op: 'gt' | 'lt' | 'equals',
  value: CursorComparable,
): Prisma.ServiceCaseWhereInput {
  if (value == null) {
    if (op === 'equals') return { [field]: null } as Prisma.ServiceCaseWhereInput;
    return { [field]: { not: null } } as Prisma.ServiceCaseWhereInput;
  }

  if (field === 'status' || field === 'id') {
    return { [field]: { [op]: value } } as Prisma.ServiceCaseWhereInput;
  }

  return { [field]: { [op]: value } } as Prisma.ServiceCaseWhereInput;
}

function buildAfterCursorBranch(
  specs: ServiceCaseListSortFieldSpec[],
  payload: ServiceCaseListCursorPayload,
  depth = 0,
): Prisma.ServiceCaseWhereInput {
  if (depth >= specs.length) {
    return { id: { gt: payload.id } };
  }

  const spec = specs[depth]!;
  const cursorValue = parseCursorFieldValue(spec.field, payload);
  const compareOp: 'gt' | 'lt' = spec.direction === 'asc' ? 'gt' : 'lt';
  const branches: Prisma.ServiceCaseWhereInput[] = [];

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

export function buildServiceCaseListCursorWhere(
  payload: ServiceCaseListCursorPayload,
): Prisma.ServiceCaseWhereInput {
  assertServiceCaseListCursorMatchesSort(payload);
  return buildAfterCursorBranch(serviceCaseListSortSpecs(), payload);
}

export function serviceCaseRowMatchesCursor(
  row: Record<string, unknown>,
  payload: ServiceCaseListCursorPayload,
): boolean {
  const specs = serviceCaseListSortSpecs();
  for (const spec of specs) {
    const left = cursorValueForField(row, spec.field);
    const right = parseCursorFieldValue(spec.field, payload);
    if (left instanceof Date && right instanceof Date) {
      if (left.getTime() !== right.getTime()) return false;
      continue;
    }
    if (left !== right) return false;
  }
  return true;
}
