import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { mapRecommendationImpactRow } from '@shared/recommendations/recommendation-impact.mapper';

@Injectable()
export class RecommendationImpactRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findLatest(organizationId: string, recommendationId: string) {
    const row = await this.prisma.orgRecommendationImpact.findFirst({
      where: { organizationId, recommendationId, isLatest: true },
      orderBy: { version: 'desc' },
    });
    return row ? mapRecommendationImpactRow(row) : null;
  }

  async listVersions(organizationId: string, recommendationId: string) {
    const rows = await this.prisma.orgRecommendationImpact.findMany({
      where: { organizationId, recommendationId },
      orderBy: { version: 'desc' },
    });
    return rows.map(mapRecommendationImpactRow);
  }

  async getNextVersion(recommendationId: string): Promise<number> {
    const latest = await this.prisma.orgRecommendationImpact.findFirst({
      where: { recommendationId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return (latest?.version ?? 0) + 1;
  }

  async createVersion(
    organizationId: string,
    recommendationId: string,
    data: Prisma.OrgRecommendationImpactCreateInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.orgRecommendationImpact.updateMany({
        where: { organizationId, recommendationId, isLatest: true },
        data: { isLatest: false },
      });
      const row = await tx.orgRecommendationImpact.create({ data });
      return mapRecommendationImpactRow(row);
    });
  }
}
