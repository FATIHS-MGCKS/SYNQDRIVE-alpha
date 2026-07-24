import { Injectable } from '@nestjs/common';
import { Prisma, RecommendationStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  mapRecommendationEventRow,
  mapRecommendationRow,
} from '@shared/recommendations/recommendation-domain.mapper';
import {
  RecommendationSourceType,
} from '@shared/recommendations/recommendation-domain.types';

export interface ListRecommendationsFilter {
  status?: RecommendationStatus;
  sourceType?: RecommendationSourceType;
  sourceId?: string;
  ownerId?: string;
  limit?: number;
}

@Injectable()
export class OrgRecommendationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(organizationId: string, id: string) {
    const row = await this.prisma.orgRecommendation.findFirst({
      where: { id, organizationId },
    });
    return row ? mapRecommendationRow(row) : null;
  }

  async findByDedupKey(organizationId: string, dedupKey: string) {
    const row = await this.prisma.orgRecommendation.findUnique({
      where: {
        org_recommendations_org_dedup_key: {
          organizationId,
          dedupKey,
        },
      },
    });
    return row ? mapRecommendationRow(row) : null;
  }

  async list(organizationId: string, filter: ListRecommendationsFilter = {}) {
    const rows = await this.prisma.orgRecommendation.findMany({
      where: {
        organizationId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.sourceType ? { sourceType: filter.sourceType } : {}),
        ...(filter.sourceId ? { sourceId: filter.sourceId } : {}),
        ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: filter.limit ?? 100,
    });
    return rows.map(mapRecommendationRow);
  }

  async createWithEvent(
    data: Prisma.OrgRecommendationCreateInput,
    event: {
      eventType: string;
      actorUserId?: string | null;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.orgRecommendation.create({ data });
      await tx.orgRecommendationEvent.create({
        data: {
          recommendationId: row.id,
          organizationId: row.organizationId,
          eventType: event.eventType,
          actorUserId: event.actorUserId ?? null,
          newStatus: row.status,
          metadata: event.metadata ?? undefined,
        },
      });
      return mapRecommendationRow(row);
    });
  }

  async updateWithEvent(
    organizationId: string,
    id: string,
    data: Prisma.OrgRecommendationUpdateInput,
    event: {
      eventType: string;
      actorUserId?: string | null;
      previousStatus?: RecommendationStatus | null;
      newStatus?: RecommendationStatus | null;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.orgRecommendation.findFirst({
        where: { id, organizationId },
      });
      if (!existing) return null;

      const row = await tx.orgRecommendation.update({
        where: { id },
        data,
      });
      await tx.orgRecommendationEvent.create({
        data: {
          recommendationId: row.id,
          organizationId: row.organizationId,
          eventType: event.eventType,
          actorUserId: event.actorUserId ?? null,
          previousStatus: event.previousStatus ?? null,
          newStatus: event.newStatus ?? row.status,
          metadata: event.metadata ?? undefined,
        },
      });
      return mapRecommendationRow(row);
    });
  }

  async listEvents(organizationId: string, recommendationId: string) {
    const rows = await this.prisma.orgRecommendationEvent.findMany({
      where: { organizationId, recommendationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(mapRecommendationEventRow);
  }

  async assertSourceExists(
    organizationId: string,
    sourceType: RecommendationSourceType,
    sourceId: string,
  ): Promise<boolean> {
    switch (sourceType) {
      case 'DASHBOARD_INSIGHT': {
        const insight = await this.prisma.dashboardInsight.findFirst({
          where: { id: sourceId, organizationId },
          select: { id: true },
        });
        return insight != null;
      }
      case 'EVALUATIONS_INSIGHT':
      case 'EVALUATIONS_RISK':
      case 'MISUSE_CASE':
      case 'MANUAL':
        return true;
      default:
        return false;
    }
  }
}
