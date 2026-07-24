import { BadRequestException } from '@nestjs/common';
import { Prisma, PrivacyPolicyLifecycleStatus } from '@prisma/client';
import {
  PROCESSING_ACTIVITY_REGISTER,
  type RegisterCompletenessStatus,
} from './processing-activity-register.constants';

export const REGISTER_LIST_DEFAULT_LIMIT = PROCESSING_ACTIVITY_REGISTER.defaultLimit;
export const REGISTER_LIST_MAX_LIMIT = PROCESSING_ACTIVITY_REGISTER.maxLimit;

export type RegisterListSortField = 'title' | 'updatedAt' | 'nextReviewDate' | 'status';
export type RegisterListSortDirection = 'asc' | 'desc';

export interface RegisterListCursorPayload {
  v: 1;
  id: string;
  sort: RegisterListSortField;
  dir: RegisterListSortDirection;
  title?: string;
  updatedAt?: string;
  nextReviewDate?: string | null;
  status?: PrivacyPolicyLifecycleStatus;
}

export interface RegisterListPageMeta {
  limit: number;
  nextCursor: string | null;
}

export interface RegisterListPageResult<T> {
  data: T[];
  meta: RegisterListPageMeta;
}

export function resolveRegisterListLimit(limit?: number): number {
  const requested = limit ?? REGISTER_LIST_DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(requested)), REGISTER_LIST_MAX_LIMIT);
}

export function encodeRegisterListCursor(payload: RegisterListCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeRegisterListCursor(cursor: string): RegisterListCursorPayload {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as RegisterListCursorPayload;
    if (!parsed?.id || parsed.v !== 1) throw new Error('invalid');
    return parsed;
  } catch {
    throw new BadRequestException({
      message: 'Invalid register list cursor.',
      code: 'REGISTER_INVALID_CURSOR',
    });
  }
}

export function buildRegisterListOrderBy(
  sort: RegisterListSortField,
  dir: RegisterListSortDirection,
): Prisma.ProcessingActivityOrderByWithRelationInput[] {
  const direction = dir === 'asc' ? 'asc' : 'desc';
  switch (sort) {
    case 'title':
      return [{ title: direction }, { id: 'asc' }];
    case 'nextReviewDate':
      return [{ nextReviewDate: direction }, { id: 'asc' }];
    case 'status':
      return [{ status: direction }, { id: 'asc' }];
    case 'updatedAt':
    default:
      return [{ updatedAt: direction }, { id: 'asc' }];
  }
}

export function buildRegisterCursorWhere(
  cursor: RegisterListCursorPayload,
): Prisma.ProcessingActivityWhereInput {
  const dir = cursor.dir === 'asc' ? 'gt' : 'lt';
  switch (cursor.sort) {
    case 'title':
      return {
        OR: [
          { title: { [dir]: cursor.title ?? '' } },
          { title: cursor.title ?? '', id: { gt: cursor.id } },
        ],
      };
    case 'nextReviewDate':
      return {
        OR: [
          { nextReviewDate: { [dir]: cursor.nextReviewDate ? new Date(cursor.nextReviewDate) : null } },
          {
            nextReviewDate: cursor.nextReviewDate ? new Date(cursor.nextReviewDate) : null,
            id: { gt: cursor.id },
          },
        ],
      };
    case 'status':
      return {
        OR: [
          { status: { [dir]: cursor.status! } },
          { status: cursor.status!, id: { gt: cursor.id } },
        ],
      };
    case 'updatedAt':
    default:
      return {
        OR: [
          { updatedAt: { [dir]: new Date(cursor.updatedAt ?? 0) } },
          { updatedAt: new Date(cursor.updatedAt ?? 0), id: { gt: cursor.id } },
        ],
      };
  }
}

export function completenessRank(status: RegisterCompletenessStatus): number {
  switch (status) {
    case 'COMPLETE_FOR_TECHNICAL_SCOPE':
      return 3;
    case 'PARTIALLY_COMPLETE':
      return 2;
    default:
      return 1;
  }
}
