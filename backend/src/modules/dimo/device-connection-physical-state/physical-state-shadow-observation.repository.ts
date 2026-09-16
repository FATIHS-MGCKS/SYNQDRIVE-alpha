import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { loadShadowObservationRetentionDaysFromEnv } from '@config/connectivity-physical-state-shadow-pilot-scope.config';
import type { PhysicalStateShadowComparisonResult } from './physical-state-shadow-comparator.types';

export type ShadowObservationScopeWindowSummary = {
  comparisonCount: number;
  correctnessBlockerCount: number;
  classificationCounts: Record<string, number>;
};

@Injectable()
export class PhysicalStateShadowObservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordComparison(result: PhysicalStateShadowComparisonResult): Promise<void> {
    await this.prisma.deviceConnectionPhysicalStateShadowObservation.create({
      data: {
        organizationId: result.scope.organizationId,
        vehicleId: result.scope.vehicleId,
        provider: result.scope.provider,
        classification: result.classification,
        correctnessBlocking: result.correctnessBlocking,
        authorityMode: String(result.authorityMode),
        legacyDecision: result.legacyDecision.accepted ? 'accept' : 'reject',
        physicalDecision: result.physicalDecision.accepted ? 'accept' : 'reject',
        evidenceReferenceId: result.evidenceReferenceId,
        bindingKey: result.bindingKey,
        observedAt: new Date(result.observedAt),
      },
    });
  }

  async summarizeScopeWindow(input: {
    organizationId: string;
    vehicleId: string;
    provider: string;
    windowStart: Date;
    windowEnd: Date;
  }): Promise<ShadowObservationScopeWindowSummary> {
    const rows = await this.prisma.deviceConnectionPhysicalStateShadowObservation.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider: input.provider,
        observedAt: {
          gte: input.windowStart,
          lte: input.windowEnd,
        },
      },
      select: {
        classification: true,
        correctnessBlocking: true,
      },
    });

    const classificationCounts: Record<string, number> = {};
    let correctnessBlockerCount = 0;
    for (const row of rows) {
      classificationCounts[row.classification] = (classificationCounts[row.classification] ?? 0) + 1;
      if (row.correctnessBlocking) correctnessBlockerCount += 1;
    }

    return {
      comparisonCount: rows.length,
      correctnessBlockerCount,
      classificationCounts,
    };
  }

  async pruneExpiredObservations(now = new Date()): Promise<number> {
    const retentionDays = loadShadowObservationRetentionDaysFromEnv();
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.deviceConnectionPhysicalStateShadowObservation.deleteMany({
      where: { observedAt: { lt: cutoff } },
    });
    return result.count;
  }
}
