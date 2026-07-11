import {
  NotificationDomain,
  NotificationEntityType,
  NotificationSeverity,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { ACTIVE_NOTIFICATION_STATUSES } from '../notification.repository';

export type NotificationSortField = 'lastSeenAt' | 'createdAt' | 'severity';
export type NotificationSortOrder = 'asc' | 'desc';

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
  activeOnly?: boolean;
  resolvedOnly?: boolean;
  from?: Date;
  to?: Date;
  search?: string;
  sortBy?: NotificationSortField;
  sortOrder?: NotificationSortOrder;
  /** When set, restrict to notifications tied to these vehicles (station scope). */
  scopedVehicleIds?: string[];
  /** When set, restrict to this station (station scope). */
  scopedStationId?: string;
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
  scopedStationId: string,
  scopedVehicleIds: string[],
): Prisma.NotificationWhereInput {
  const orClauses: Prisma.NotificationWhereInput[] = [
    { entityType: NotificationEntityType.STATION, entityId: scopedStationId },
    { actionTarget: { path: ['stationId'], equals: scopedStationId } },
  ];
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
  return { OR: orClauses };
}

export function buildNotificationWhereInput(
  filters: NotificationListFilters,
): Prisma.NotificationWhereInput {
  const where: Prisma.NotificationWhereInput = {
    organizationId: filters.organizationId,
  };

  if (filters.status?.length) {
    where.status = { in: filters.status };
  }
  if (filters.activeOnly) {
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
    where.lastSeenAt = {};
    if (filters.from) where.lastSeenAt.gte = filters.from;
    if (filters.to) where.lastSeenAt.lte = filters.to;
  }
  if (filters.unreadOnly && filters.userId) {
    where.NOT = {
      receipts: {
        some: {
          userId: filters.userId,
          readAt: { not: null },
        },
      },
    };
  }
  if (filters.scopedStationId) {
    const scopeClause = stationScopeFilter(
      filters.scopedStationId,
      filters.scopedVehicleIds ?? [],
    );
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
    return [{ severity: dir }, { lastSeenAt: 'desc' }];
  }
  if (sortBy === 'createdAt') {
    return [{ createdAt: dir }, { lastSeenAt: 'desc' }];
  }
  return [{ lastSeenAt: dir }, { createdAt: 'desc' }];
}

export const RESOLVED_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
