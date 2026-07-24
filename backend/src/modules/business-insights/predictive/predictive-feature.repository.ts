import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { mapFeatureSnapshotRow } from '@shared/predictive/predictive-feature.mapper';

@Injectable()
export class PredictiveFeatureRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getLatestBuildRun(organizationId: string) {
    return this.prisma.orgPredictiveFeatureBuildRun.findFirst({
      where: { organizationId },
      orderBy: { startedAt: 'desc' },
    });
  }

  async createBuildRun(organizationId: string, data: {
    featureSetVersion: string;
    fromDate: string;
    toDate: string;
  }) {
    return this.prisma.orgPredictiveFeatureBuildRun.create({
      data: {
        organizationId,
        featureSetVersion: data.featureSetVersion,
        fromDate: data.fromDate,
        toDate: data.toDate,
        status: 'PARTIAL',
      },
    });
  }

  async completeBuildRun(
    runId: string,
    data: { status: 'COMPLETED' | 'PARTIAL' | 'FAILED'; snapshotsWritten: number; errorMessage?: string },
  ) {
    return this.prisma.orgPredictiveFeatureBuildRun.update({
      where: { id: runId },
      data: {
        status: data.status,
        snapshotsWritten: data.snapshotsWritten,
        errorMessage: data.errorMessage ?? null,
        completedAt: new Date(),
      },
    });
  }

  async upsertSnapshot(data: Prisma.OrgPredictiveFeatureSnapshotCreateInput) {
    const row = await this.prisma.orgPredictiveFeatureSnapshot.upsert({
      where: {
        organizationId_featureSetVersion_grain_observationDate_scopeKey: {
          organizationId: data.organization.connect!.id!,
          featureSetVersion: data.featureSetVersion,
          grain: data.grain,
          observationDate: data.observationDate,
          scopeKey: data.scopeKey,
        },
      },
      create: data,
      update: {
        asOfUtc: data.asOfUtc,
        timezone: data.timezone,
        features: data.features ?? undefined,
        dataQuality: data.dataQuality,
        dataQualityMeta: data.dataQualityMeta ?? undefined,
        lineage: data.lineage ?? undefined,
        buildRun: data.buildRun,
      },
    });
    return mapFeatureSnapshotRow(row);
  }

  async listSnapshots(
    organizationId: string,
    params: { fromDate: string; toDate: string; featureSetVersion?: string; scopeKey?: string },
  ) {
    const rows = await this.prisma.orgPredictiveFeatureSnapshot.findMany({
      where: {
        organizationId,
        observationDate: { gte: params.fromDate, lte: params.toDate },
        ...(params.featureSetVersion ? { featureSetVersion: params.featureSetVersion } : {}),
        ...(params.scopeKey ? { scopeKey: params.scopeKey } : {}),
      },
      orderBy: [{ observationDate: 'asc' }, { scopeKey: 'asc' }],
    });
    return rows.map(mapFeatureSnapshotRow);
  }

  async purgeOlderThan(organizationId: string, observationDateBefore: string) {
    const result = await this.prisma.orgPredictiveFeatureSnapshot.deleteMany({
      where: { organizationId, observationDate: { lt: observationDateBefore } },
    });
    return result.count;
  }
}
