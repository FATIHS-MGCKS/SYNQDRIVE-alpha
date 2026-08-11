import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  EvaluationsAnalyticsFilters,
  EvaluationsAnalyticsGroupDimension,
  EvaluationsAnalyticsNormalizedPage,
  EvaluationsAuthorizedAnalyticsScope,
  EvaluationsEntityReference,
} from '@synq/evaluations-analytics/evaluations-analytics.contract';

export interface EvaluationsEntityReferenceRow {
  readonly reference: EvaluationsEntityReference;
  readonly createdAt: Date;
}

export interface EvaluationsEntityReferenceGroupRow {
  readonly key: {
    entityType?: EvaluationsEntityReference['entityType'];
    relationType?: EvaluationsEntityReference['relationType'];
    stationId?: string | null;
  };
  readonly count: number;
}

/**
 * Tenant-scoped data access for analytics entity references. Every query is
 * anchored on `organizationId` and the actor's authorized station scope
 * (defense in depth beneath the guard + scope service). A station-scoped actor
 * never sees org-level (null-station) rows.
 */
@Injectable()
export class EvaluationsEntityReferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolveStationConstraint(
    scope: EvaluationsAuthorizedAnalyticsScope,
    filters: EvaluationsAnalyticsFilters,
  ): Prisma.EvaluationsEntityReferenceWhereInput['stationId'] | undefined {
    const authorized = scope.stationIds === null ? null : new Set(scope.stationIds);
    const requested = filters.stationIds;

    if (requested !== undefined) {
      const effective =
        authorized === null ? requested : requested.filter((id) => authorized.has(id));
      return { in: [...effective] };
    }
    if (authorized === null) return undefined;
    return { in: [...authorized] };
  }

  buildWhere(
    scope: EvaluationsAuthorizedAnalyticsScope,
    filters: EvaluationsAnalyticsFilters,
    period: { start: string; endExclusive: string },
  ): Prisma.EvaluationsEntityReferenceWhereInput {
    const where: Prisma.EvaluationsEntityReferenceWhereInput = {
      organizationId: scope.organizationId,
      createdAt: { gte: new Date(period.start), lt: new Date(period.endExclusive) },
    };

    const stationConstraint = this.resolveStationConstraint(scope, filters);
    if (stationConstraint !== undefined) where.stationId = stationConstraint;

    if (filters.entityTypes?.length) where.entityType = { in: [...filters.entityTypes] };
    if (filters.relationTypes?.length) {
      where.relationType = { in: [...filters.relationTypes] };
    }

    const entityIdClauses: Prisma.EvaluationsEntityReferenceWhereInput[] = [];
    if (filters.vehicleIds?.length) {
      entityIdClauses.push({
        entityType: 'VEHICLE',
        entityId: { in: [...filters.vehicleIds] },
      });
    }
    if (filters.customerIds?.length) {
      entityIdClauses.push({
        entityType: 'CUSTOMER',
        entityId: { in: [...filters.customerIds] },
      });
    }
    if (entityIdClauses.length) {
      where.AND = [...(Array.isArray(where.AND) ? where.AND : []), { OR: entityIdClauses }];
    }

    return where;
  }

  countInScope(
    scope: EvaluationsAuthorizedAnalyticsScope,
    filters: EvaluationsAnalyticsFilters,
    period: { start: string; endExclusive: string },
  ): Promise<number> {
    return this.prisma.evaluationsEntityReference.count({
      where: this.buildWhere(scope, filters, period),
    });
  }

  async groupInScope(
    scope: EvaluationsAuthorizedAnalyticsScope,
    filters: EvaluationsAnalyticsFilters,
    period: { start: string; endExclusive: string },
    groupBy: EvaluationsAnalyticsGroupDimension,
    limit: number,
  ): Promise<EvaluationsEntityReferenceGroupRow[]> {
    const where = this.buildWhere(scope, filters, period);
    const column =
      groupBy === 'ENTITY_TYPE'
        ? 'entityType'
        : groupBy === 'RELATION_TYPE'
          ? 'relationType'
          : 'stationId';

    const grouped = await this.prisma.evaluationsEntityReference.groupBy({
      by: [column],
      where,
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });

    return grouped.map((row) => {
      const value = (row as Record<string, unknown>)[column] as string | null;
      const key: EvaluationsEntityReferenceGroupRow['key'] = {};
      if (groupBy === 'ENTITY_TYPE') {
        key.entityType = value as EvaluationsEntityReference['entityType'];
      } else if (groupBy === 'RELATION_TYPE') {
        key.relationType = value as EvaluationsEntityReference['relationType'];
      } else {
        key.stationId = value;
      }
      return { key, count: row._count._all };
    });
  }

  async listInScope(
    scope: EvaluationsAuthorizedAnalyticsScope,
    filters: EvaluationsAnalyticsFilters,
    period: { start: string; endExclusive: string },
    page: EvaluationsAnalyticsNormalizedPage,
  ): Promise<EvaluationsEntityReferenceRow[]> {
    const rows = await this.prisma.evaluationsEntityReference.findMany({
      where: this.buildWhere(scope, filters, period),
      orderBy: [{ [page.sortBy]: page.sortDir }, { id: 'asc' }],
      skip: page.skip,
      take: page.take,
    });

    return rows.map((row) => ({
      reference: {
        organizationId: row.organizationId,
        stationId: row.stationId,
        ownerType: row.ownerType,
        ownerId: row.ownerId,
        entityType: row.entityType,
        entityId: row.entityId,
        relationType: row.relationType,
      },
      createdAt: row.createdAt,
    }));
  }
}
