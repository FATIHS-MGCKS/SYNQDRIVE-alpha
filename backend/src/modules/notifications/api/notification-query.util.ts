import {
  NotificationDomain,
  NotificationEntityType,
  NotificationSeverity,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { ACTIVE_NOTIFICATION_STATUSES } from '../notification.repository';
import { buildOrgWideScopeOrClause } from '../access/notification-org-wide.policy';

export type NotificationSortField = 'lastSeenAt' | 'createdAt' | 'severity';
export type NotificationSortOrder = 'asc' | 'desc';
export type NotificationTimeField = 'lastSeenAt' | 'createdAt' | 'resolvedAt';
export type NotificationReadState = 'unread' | 'read' | 'snoozed' | 'hidden';

export interface NotificationListFilters {
  organizationId: string;
  userId: string;
  status?: NotificationStatus[];
  severity?: NotificationSeverity[];
  domain?: NotificationDomain;
  entityType?: NotificationEntityType;
  entityId?: string;
  vehicleId?: string;
  stationId?: string;
  bookingId?: string;
  unreadOnly?: boolean;
  readState?: NotificationReadState;
  activeOnly?: boolean;
  resolvedOnly?: boolean;
  from?: Date;
  to?: Date;
  timeField?: NotificationTimeField;
  search?: string;
  sortBy?: NotificationSortField;
  sortOrder?: NotificationSortOrder;
  scopedStationId?: string;
  scopedStationIds?: string[];
  scopedVehicleIds?: string[];
  scopedBookingIds?: string[];
}

export function parseNotificationPagination(query: {
  page?: number;
  limit?: number;
}): { page: number; limit: number; skip: number; take: number } {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function buildNotificationPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
) {
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    },
  };
}

function entityOrActionTargetFilter(
  field: 'vehicleId' | 'stationId' | 'bookingId',
  value: string,
  entityType?: NotificationEntityType,
): Prisma.NotificationWhereInput {
  const entityMap: Record<string, NotificationEntityType> = {
    vehicleId: NotificationEntityType.VEHICLE,
    stationId: NotificationEntityType.STATION,
    bookingId: NotificationEntityType.BOOKING,
  };
  const mappedEntity = entityMap[field];
  const clauses: Prisma.NotificationWhereInput[] = [
    { actionTarget: { path: [field], equals: value } },
  ];
  if (!entityType || entityType === mappedEntity) {
    clauses.unshift({ entityType: mappedEntity, entityId: value });
  }
  return { OR: clauses };
}

function stationScopeFilter(
  stationIds: string[],
  scopedVehicleIds: string[],
  scopedBookingIds: string[],
): Prisma.NotificationWhereInput {
  const orClauses: Prisma.NotificationWhereInput[] = [];
  for (const stationId of stationIds) {
    orClauses.push(
      { entityType: NotificationEntityType.STATION, entityId: stationId },
      { actionTarget: { path: ['stationId'], equals: stationId } },
    );
  }
  if (scopedVehicleIds.length > 0) {
    orClauses.push({
      entityType: NotificationEntityType.VEHICLE,
      entityId: { in: scopedVehicleIds },
    });
    for (const vehicleId of scopedVehicleIds) {
      orClauses.push({
        actionTarget: { path: ['vehicleId'], equals: vehicleId },
      });
    }
  }
  if (scopedBookingIds.length > 0) {
    orClauses.push({
      entityType: NotificationEntityType.BOOKING,
      entityId: { in: scopedBookingIds },
    });
    for (const bookingId of scopedBookingIds) {
      orClauses.push({
        actionTarget: { path: ['bookingId'], equals: bookingId },
      });
    }
  }
  return { OR: orClauses };
}

function buildReadStateFilter(
  readState: NotificationReadState,
  userId: string,
  referenceNow: Date,
): Prisma.NotificationWhereInput {
  switch (readState) {
    case 'read':
      return {
        receipts: {
          some: {
            userId,
            readAt: { not: null },
          },
        },
      };
    case 'snoozed':
      return {
        receipts: {
          some: {
            userId,
            snoozedUntil: { gt: referenceNow },
          },
        },
      };
    case 'hidden':
      return {
        receipts: {
          some: {
            userId,
            hiddenAt: { not: null },
          },
        },
      };
    case 'unread':
    default:
      return {
        NOT: {
          receipts: {
            some: {
              userId,
              readAt: { not: null },
            },
          },
        },
      };
  }
}

export function buildNotificationWhereInput(
  filters: NotificationListFilters,
  referenceNow: Date = new Date(),
): Prisma.NotificationWhereInput {
  const where: Prisma.NotificationWhereInput = {
    organizationId: filters.organizationId,
  };

  if (filters.status?.length) {
    where.status = { in: filters.status };
  } else if (filters.activeOnly) {
    where.status = { in: ACTIVE_NOTIFICATION_STATUSES };
  }
  if (filters.resolvedOnly) {
    where.status = NotificationStatus.RESOLVED;
  }
  if (filters.severity?.length) {
    where.severity = { in: filters.severity };
  }
  if (filters.domain) {
    where.domain = filters.domain;
  }
  if (filters.entityType) {
    where.entityType = filters.entityType;
  }
  if (filters.entityId) {
    where.entityId = filters.entityId;
  }
  const entityFilters: Prisma.NotificationWhereInput[] = [];
  if (filters.vehicleId) {
    entityFilters.push(entityOrActionTargetFilter('vehicleId', filters.vehicleId, filters.entityType));
  }
  if (filters.stationId) {
    entityFilters.push(entityOrActionTargetFilter('stationId', filters.stationId, filters.entityType));
  }
  if (filters.bookingId) {
    entityFilters.push(entityOrActionTargetFilter('bookingId', filters.bookingId, filters.entityType));
  }
  if (entityFilters.length) {
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), ...entityFilters];
  }
  if (filters.from || filters.to) {
    const timeField = filters.timeField ?? 'lastSeenAt';
    const range: Prisma.DateTimeFilter = {};
    if (filters.from) range.gte = filters.from;
    if (filters.to) range.lte = filters.to;
    where[timeField] = range;
  }
  if (filters.readState && filters.userId) {
    const readClause = buildReadStateFilter(filters.readState, filters.userId, referenceNow);
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), readClause];
  } else if (filters.unreadOnly && filters.userId) {
    where.NOT = {
      receipts: {
        some: {
          userId: filters.userId,
          readAt: { not: null },
        },
      },
    };
  }
  const stationIds = filters.scopedStationIds?.length
    ? filters.scopedStationIds
    : filters.scopedStationId
      ? [filters.scopedStationId]
      : [];
  if (stationIds.length > 0) {
    const stationClause = stationScopeFilter(
      stationIds,
      filters.scopedVehicleIds ?? [],
      filters.scopedBookingIds ?? [],
    );
    const orgWide = buildOrgWideScopeOrClause();
    const scopeClause: Prisma.NotificationWhereInput = {
      OR: [
        ...(stationClause.OR as Prisma.NotificationWhereInput[]),
        ...(orgWide.OR as Prisma.NotificationWhereInput[]),
      ],
    };
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), scopeClause];
  }
  if (filters.search && filters.search.trim().length >= 2) {
    const term = filters.search.trim();
    const searchClause: Prisma.NotificationWhereInput = {
      OR: [
        { eventType: { contains: term, mode: 'insensitive' } },
        { titleKey: { contains: term, mode: 'insensitive' } },
        { primarySourceRef: { contains: term, mode: 'insensitive' } },
        { entityId: term },
      ],
    };
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), searchClause];
  }

  return where;
}

export function buildNotificationOrderBy(
  sortBy: NotificationSortField = 'lastSeenAt',
  sortOrder: NotificationSortOrder = 'desc',
): Prisma.NotificationOrderByWithRelationInput[] {
  const dir = sortOrder;
  if (sortBy === 'severity') {
    return [{ severity: dir }, { lastSeenAt: 'desc' }, { id: dir }];
  }
  if (sortBy === 'createdAt') {
    return [{ createdAt: dir }, { lastSeenAt: 'desc' }, { id: dir }];
  }
  return [{ lastSeenAt: dir }, { createdAt: dir }, { id: dir }];
}

export const RESOLVED_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
