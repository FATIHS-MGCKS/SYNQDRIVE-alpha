import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { loadShadowObservationRetentionDaysFromEnv } from '@config/connectivity-physical-state-shadow-pilot-scope.config';
import { CONNECTIVITY_PHYSICAL_STATE_SHADOW_MIN_OPERATIONAL_OBSERVATION_MS } from './physical-state-shadow-operational-evidence.constants';
import type { PhysicalStateShadowComparisonResult } from './physical-state-shadow-comparator.types';

export type ShadowObservationScopeWindowSummary = {
  comparisonCount: number;
  correctnessBlockerCount: number;
  classificationCounts: Record<string, number>;
};

export type ShadowOperationalCoverage = {
  firstComparisonObservedAt: Date | null;
  lastComparisonObservedAt: Date | null;
  comparisonCount: number;
  actualObservedSpanMs: number;
  minimumOperationalObservationMs: number;
  sevenDayOperationalWindowProven: boolean;
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
        evidenceObservedAt: result.evidenceObservedAt
          ? new Date(result.evidenceObservedAt)
          : null,
      },
    });
  }

  /**
   * Window queries use comparison/runtime observation time (`observedAt`), not source evidence time.
   */
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

  /**
   * Operational pilot coverage proof uses persisted comparison/runtime timestamps only
   * (`observedAt`), scoped to an explicit epoch window. Source evidence time
   * (`evidenceObservedAt`) never contributes to span proof.
   */
  async getOperationalCoverage(input: {
    organizationId: string;
    vehicleId: string;
    provider: string;
    windowStart: Date;
    windowEnd?: Date;
    minimumOperationalObservationMs?: number;
  }): Promise<ShadowOperationalCoverage> {
    const minimumOperationalObservationMs =
      input.minimumOperationalObservationMs ??
      CONNECTIVITY_PHYSICAL_STATE_SHADOW_MIN_OPERATIONAL_OBSERVATION_MS;

    const emptyCoverage = (): ShadowOperationalCoverage => ({
      firstComparisonObservedAt: null,
      lastComparisonObservedAt: null,
      comparisonCount: 0,
      actualObservedSpanMs: 0,
      minimumOperationalObservationMs,
      sevenDayOperationalWindowProven: false,
    });

    const windowStartMs = input.windowStart?.getTime();
    if (!Number.isFinite(windowStartMs)) {
      return emptyCoverage();
    }

    const observedAtFilter: { gte: Date; lte?: Date } = {
      gte: input.windowStart,
    };

    if (input.windowEnd != null) {
      const windowEndMs = input.windowEnd.getTime();
      if (!Number.isFinite(windowEndMs) || windowEndMs < windowStartMs) {
        return emptyCoverage();
      }
      observedAtFilter.lte = input.windowEnd;
    }

    const aggregate = await this.prisma.deviceConnectionPhysicalStateShadowObservation.aggregate({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider: input.provider,
        observedAt: observedAtFilter,
      },
      _count: { _all: true },
      _min: { observedAt: true },
      _max: { observedAt: true },
    });

    const comparisonCount = aggregate._count._all;
    const firstComparisonObservedAt = aggregate._min.observedAt;
    const lastComparisonObservedAt = aggregate._max.observedAt;

    const actualObservedSpanMs =
      firstComparisonObservedAt && lastComparisonObservedAt
        ? lastComparisonObservedAt.getTime() - firstComparisonObservedAt.getTime()
        : 0;

    const sevenDayOperationalWindowProven =
      comparisonCount > 0 && actualObservedSpanMs >= minimumOperationalObservationMs;

    return {
      firstComparisonObservedAt,
      lastComparisonObservedAt,
      comparisonCount,
      actualObservedSpanMs,
      minimumOperationalObservationMs,
      sevenDayOperationalWindowProven,
    };
  }

  /** Retention pruning uses comparison/runtime observation time (`observedAt`). */
  async pruneExpiredObservations(now = new Date()): Promise<number> {
    const retentionDays = loadShadowObservationRetentionDaysFromEnv();
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.deviceConnectionPhysicalStateShadowObservation.deleteMany({
      where: { observedAt: { lt: cutoff } },
    });
    return result.count;
  }
}
