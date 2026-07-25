import type { Prisma } from '@prisma/client';

/**
 * Sort fields accepted by `GET /organizations/:orgId/data-authorizations`.
 *
 * The data-processing hub shares one filter state across the register and the
 * legacy authorization sections, so this set must stay a superset of the sort
 * keys the hub can emit (`updatedAt` is its default).
 */
export const DATA_AUTHORIZATION_LIST_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'title',
  'expiresAt',
  'status',
] as const;

export type DataAuthorizationListSortField =
  (typeof DATA_AUTHORIZATION_LIST_SORT_FIELDS)[number];

export type DataAuthorizationListSortDirection = 'asc' | 'desc';

interface DecodedCursor {
  id: string;
  sort: DataAuthorizationListSortField;
  dir: DataAuthorizationListSortDirection;
  /** Serialized value of the sort column for the last row of the previous page. */
  value: string | null;
  /** Only used by the `createdAt` ordering, which pins system rows on top. */
  isSystemGenerated?: boolean;
}

export interface CursorRow {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  title: string | null;
  expiresAt: Date | null;
  status: string;
  isSystemGenerated: boolean;
}

export function normalizeSortField(
  value: string | undefined,
): DataAuthorizationListSortField {
  return DATA_AUTHORIZATION_LIST_SORT_FIELDS.includes(
    value as DataAuthorizationListSortField,
  )
    ? (value as DataAuthorizationListSortField)
    : 'createdAt';
}

export function buildListOrderBy(
  sort: DataAuthorizationListSortField,
  dir: DataAuthorizationListSortDirection,
): Prisma.OrgDataAuthorizationOrderByWithRelationInput[] {
  switch (sort) {
    case 'title':
      return [{ title: dir }, { id: 'asc' }];
    case 'expiresAt':
      return [{ expiresAt: dir }, { id: 'asc' }];
    case 'updatedAt':
      return [{ updatedAt: dir }, { id: 'asc' }];
    case 'status':
      return [{ status: dir }, { id: 'asc' }];
    case 'createdAt':
    default:
      // System-generated authorizations (e.g. DIMO telemetry) stay pinned on top.
      return [{ isSystemGenerated: 'desc' }, { createdAt: dir }, { id: 'asc' }];
  }
}

function serializeSortValue(
  row: CursorRow,
  sort: DataAuthorizationListSortField,
): string | null {
  switch (sort) {
    case 'title':
      return row.title;
    case 'expiresAt':
      return row.expiresAt?.toISOString() ?? null;
    case 'updatedAt':
      return row.updatedAt.toISOString();
    case 'status':
      return row.status;
    case 'createdAt':
    default:
      return row.createdAt.toISOString();
  }
}

export function encodeListCursor(
  row: CursorRow,
  sort: DataAuthorizationListSortField,
  dir: DataAuthorizationListSortDirection,
): string {
  const payload: DecodedCursor & { v: 2 } = {
    v: 2,
    id: row.id,
    sort,
    dir,
    value: serializeSortValue(row, sort),
    ...(sort === 'createdAt' ? { isSystemGenerated: row.isSystemGenerated } : {}),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeListCursor(cursor: string): DecodedCursor | null {
  try {
    const raw = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<DecodedCursor> & { createdAt?: string };

    if (typeof raw.id !== 'string' || raw.id.length === 0) return null;

    // v1 cursors only carried `{ id, createdAt }`.
    const sort = normalizeSortField(raw.sort);
    const value = raw.value !== undefined ? raw.value : (raw.createdAt ?? null);

    return {
      id: raw.id,
      sort,
      dir: raw.dir === 'asc' ? 'asc' : 'desc',
      value,
      isSystemGenerated:
        typeof raw.isSystemGenerated === 'boolean' ? raw.isSystemGenerated : undefined,
    };
  } catch {
    return null;
  }
}

function toComparable(
  sort: DataAuthorizationListSortField,
  value: string | null,
): Date | string | null {
  if (value === null) return null;
  return sort === 'createdAt' || sort === 'updatedAt' || sort === 'expiresAt'
    ? new Date(value)
    : value;
}

/**
 * Keyset predicate for the next page. Returns `null` when the cursor is unusable
 * (malformed, or issued for a different sort/direction) so the caller can fall
 * back to serving the first page instead of silently mixing orderings.
 */
export function buildCursorFilter(
  cursor: string,
  sort: DataAuthorizationListSortField,
  dir: DataAuthorizationListSortDirection,
): Prisma.OrgDataAuthorizationWhereInput | null {
  const decoded = decodeListCursor(cursor);
  if (!decoded) return null;
  if (decoded.sort !== sort || decoded.dir !== dir) return null;

  const valueOp = dir === 'desc' ? ('lt' as const) : ('gt' as const);
  const comparable = toComparable(sort, decoded.value);

  // Nullable sort columns cannot express a stable keyset boundary once the
  // boundary value itself is null — fall back to the id tie-breaker only.
  if (comparable === null) {
    return sort === 'expiresAt' || sort === 'title'
      ? { id: { gt: decoded.id } }
      : null;
  }

  const pastValue = { [sort]: { [valueOp]: comparable } } as Prisma.OrgDataAuthorizationWhereInput;
  const sameValueNextId = {
    [sort]: comparable,
    id: { gt: decoded.id },
  } as Prisma.OrgDataAuthorizationWhereInput;

  if (sort !== 'createdAt' || decoded.isSystemGenerated === undefined) {
    return { OR: [pastValue, sameValueNextId] };
  }

  // `createdAt` orders by (isSystemGenerated desc, createdAt, id), so the keyset
  // must also step over the leading boolean key: once the cursor sits on a
  // system-generated row, every non-system row still follows it.
  const boundary = decoded.isSystemGenerated;
  return {
    OR: [
      ...(boundary ? [{ isSystemGenerated: false }] : []),
      { isSystemGenerated: boundary, ...pastValue },
      { isSystemGenerated: boundary, ...sameValueNextId },
    ],
  };
}
