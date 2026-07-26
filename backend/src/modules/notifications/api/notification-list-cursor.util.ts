import { BadRequestException } from '@nestjs/common';
import { NotificationSeverity, Prisma } from '@prisma/client';
import type { NotificationSortField, NotificationSortOrder } from './notification-query.util';

export const NOTIFICATION_LIST_DEFAULT_LIMIT = 20;
export const NOTIFICATION_LIST_MAX_LIMIT = 100;

export interface NotificationListCursorPayload {
  sortBy: NotificationSortField;
  sortOrder: NotificationSortOrder;
  id: string;
  lastSeenAt?: string;
  createdAt?: string;
  severity?: NotificationSeverity;
}

export interface NotificationListPageMeta {
  limit: number;
  nextCursor: string | null;
  total?: number;
  page?: number;
  totalPages?: number;
}

export interface NotificationListPageResult<T> {
  data: T[];
  meta: NotificationListPageMeta;
}

const SEVERITY_DESC: NotificationSeverity[] = [
  NotificationSeverity.CRITICAL,
  NotificationSeverity.WARNING,
  NotificationSeverity.INFO,
  NotificationSeverity.SUCCESS,
];

export function resolveNotificationListLimit(limit?: number): number {
  const requested = limit ?? NOTIFICATION_LIST_DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(requested)), NOTIFICATION_LIST_MAX_LIMIT);
}

export function encodeNotificationListCursor(payload: NotificationListCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeNotificationListCursor(cursor: string): NotificationListCursorPayload {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as NotificationListCursorPayload;
    if (
      !parsed
      || typeof parsed !== 'object'
      || typeof parsed.sortBy !== 'string'
      || typeof parsed.sortOrder !== 'string'
      || typeof parsed.id !== 'string'
    ) {
      throw new Error('invalid cursor payload');
    }
    return parsed;
  } catch {
    throw new BadRequestException({
      message: 'Invalid notification list cursor.',
      code: 'NOTIFICATION_LIST_INVALID_CURSOR',
    });
  }
}

function lowerSeverities(severity: NotificationSeverity): NotificationSeverity[] {
  const idx = SEVERITY_DESC.indexOf(severity);
  if (idx < 0) return [];
  return SEVERITY_DESC.slice(idx + 1);
}

function compareBranch(
  field: 'lastSeenAt' | 'createdAt',
  value: Date,
  id: string,
  sortOrder: NotificationSortOrder,
): Prisma.NotificationWhereInput {
  const op = sortOrder === 'desc' ? 'lt' : 'gt';
  const idOp = sortOrder === 'desc' ? 'lt' : 'gt';
  return {
    OR: [
      { [field]: { [op]: value } },
      {
        AND: [
          { [field]: value },
          { id: { [idOp]: id } },
        ],
      },
    ],
  };
}

export function buildNotificationListCursorWhere(
  payload: NotificationListCursorPayload,
): Prisma.NotificationWhereInput {
  const sortOrder = payload.sortOrder ?? 'desc';
  const id = payload.id;

  if (payload.sortBy === 'severity' && payload.severity) {
    const lower = lowerSeverities(payload.severity);
    const lastSeenAt = payload.lastSeenAt ? new Date(payload.lastSeenAt) : new Date(0);
    const op = sortOrder === 'desc' ? 'lt' : 'gt';
    const idOp = sortOrder === 'desc' ? 'lt' : 'gt';
    return {
      OR: [
        { severity: { in: lower } },
        {
          AND: [
            { severity: payload.severity },
            {
              OR: [
                { lastSeenAt: { [op]: lastSeenAt } },
                {
                  AND: [
                    { lastSeenAt },
                    { id: { [idOp]: id } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
  }

  if (payload.sortBy === 'createdAt' && payload.createdAt) {
    return compareBranch('createdAt', new Date(payload.createdAt), id, sortOrder);
  }

  const lastSeenAt = payload.lastSeenAt ? new Date(payload.lastSeenAt) : new Date(0);
  const createdAt = payload.createdAt ? new Date(payload.createdAt) : new Date(0);
  const op = sortOrder === 'desc' ? 'lt' : 'gt';
  const idOp = sortOrder === 'desc' ? 'lt' : 'gt';

  return {
    OR: [
      { lastSeenAt: { [op]: lastSeenAt } },
      {
        AND: [
          { lastSeenAt },
          { createdAt: { [op]: createdAt } },
        ],
      },
      {
        AND: [
          { lastSeenAt },
          { createdAt },
          { id: { [idOp]: id } },
        ],
      },
    ],
  };
}

export function encodeNotificationListCursorFromRow(
  row: {
    id: string;
    lastSeenAt: Date;
    createdAt: Date;
    severity: NotificationSeverity;
  },
  sortBy: NotificationSortField,
  sortOrder: NotificationSortOrder,
): string {
  return encodeNotificationListCursor({
    sortBy,
    sortOrder,
    id: row.id,
    lastSeenAt: row.lastSeenAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    severity: row.severity,
  });
}
