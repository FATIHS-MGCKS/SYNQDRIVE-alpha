import { BadRequestException } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';

export const BOOKING_LIST_DEFAULT_LIMIT = 50;
export const BOOKING_LIST_MAX_LIMIT = 200;

export type BookingListSortField = 'startDate' | 'endDate' | 'createdAt';
export type BookingListSortOrder = 'asc' | 'desc';

export interface BookingListPageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

export interface BookingListPageResult<T> {
  data: T[];
  meta: BookingListPageMeta;
}

export interface BookingListCursorPayload {
  sort: BookingListSortField;
  order: BookingListSortOrder;
  id: string;
  startDate?: string;
  endDate?: string;
  createdAt?: string;
}

export function resolveBookingListLimit(limit?: number): number {
  const requested = limit ?? BOOKING_LIST_DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(requested)), BOOKING_LIST_MAX_LIMIT);
}

export function resolveBookingListPage(page?: number): number {
  return Math.max(1, Math.floor(page ?? 1));
}

export function parseBookingStatusFilter(
  value?: string | string[],
): BookingStatus[] | undefined {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const allowed = new Set<BookingStatus>([
    'PENDING',
    'CONFIRMED',
    'ACTIVE',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW',
  ]);
  const statuses = raw
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is BookingStatus => allowed.has(s as BookingStatus));
  return statuses.length > 0 ? statuses : undefined;
}

export function parseVehicleIdsFilter(value?: string | string[]): string[] | undefined {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const ids = raw.map((s) => s.trim()).filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

export function buildBookingRangeOverlapWhere(
  from?: Date | null,
  to?: Date | null,
): Prisma.BookingWhereInput[] {
  const clauses: Prisma.BookingWhereInput[] = [];
  if (from && !Number.isNaN(+from) && to && !Number.isNaN(+to)) {
    // Half-open view window [from, to): booking intersects when it starts before `to`
    // and ends at or after `from`.
    clauses.push({ startDate: { lt: to } }, { endDate: { gte: from } });
    return clauses;
  }
  if (from && !Number.isNaN(+from)) {
    clauses.push({ endDate: { gte: from } });
  } else if (to && !Number.isNaN(+to)) {
    clauses.push({ startDate: { lt: to } });
  }
  return clauses;
}

export function buildBookingListOrderBy(
  sort: BookingListSortField,
  order: BookingListSortOrder,
): Prisma.BookingOrderByWithRelationInput[] {
  return [{ [sort]: order }, { id: 'asc' }];
}

export function encodeBookingListCursor(payload: BookingListCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeBookingListCursor(cursor: string): BookingListCursorPayload {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as BookingListCursorPayload;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.id !== 'string' ||
      typeof parsed.sort !== 'string' ||
      typeof parsed.order !== 'string'
    ) {
      throw new Error('invalid cursor payload');
    }
    return parsed;
  } catch {
    throw new BadRequestException({
      message: 'Ungültiger Buchungslisten-Cursor.',
      code: 'BOOKING_LIST_INVALID_CURSOR',
    });
  }
}

function cursorFieldValue(payload: BookingListCursorPayload): Date {
  const iso =
    payload.sort === 'endDate'
      ? payload.endDate
      : payload.sort === 'createdAt'
        ? payload.createdAt
        : payload.startDate;
  const parsed = iso ? new Date(iso) : new Date(0);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

export function buildBookingListCursorWhere(
  payload: BookingListCursorPayload,
): Prisma.BookingWhereInput {
  const field = payload.sort;
  const value = cursorFieldValue(payload);
  const id = payload.id;
  const isDesc = payload.order === 'desc';

  const afterSameField: Prisma.BookingWhereInput[] = isDesc
    ? [{ [field]: value }, { id: { gt: id } }]
    : [{ [field]: value }, { id: { gt: id } }];

  const beforeField: Prisma.BookingWhereInput = isDesc
    ? { [field]: { lt: value } }
    : { [field]: { gt: value } };

  return {
    OR: [beforeField, { AND: afterSameField }],
  };
}

export function encodeBookingListCursorFromRow(
  row: { id: string; startDate: Date; endDate: Date; createdAt: Date },
  sort: BookingListSortField,
  order: BookingListSortOrder,
): string {
  return encodeBookingListCursor({
    sort,
    order,
    id: row.id,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    createdAt: row.createdAt.toISOString(),
  });
}

export function buildBookingListPageResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
  nextCursor: string | null,
  options?: { hasNextPage?: boolean },
): BookingListPageResult<T> {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasNextPage = options?.hasNextPage ?? page < totalPages;
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      nextCursor: hasNextPage ? nextCursor : null,
    },
  };
}
