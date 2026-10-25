import { Injectable, Logger, Optional } from '@nestjs/common';
import { DimoPollJobType, DimoPollStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AdaptivePollingShadowMetricsService } from './adaptive-polling-shadow-metrics.service';
import {
  baselineLvEvidenceIsSkipInformative,
  evaluateBaselineLvSourceEvidence,
  evaluateBaselineSkipDiscoveryDelay,
  evaluateBaselineTopLevelSourceAdvance,
  parseSnapshotCorrelationId,
} from './p25-apd-shadow-baseline-poll-evidence';
import type { AdaptivePollingShadowPostPollContext } from './adaptive-polling-shadow.types';

export type BaselinePollObservationalPatch = {
  newLvSourceObserved: boolean;
  newLvSourceAt: Date | null;
  newTopLevelSourceObserved: boolean;
  simulatedNextPollAt: Date | null;
  simulatedDiscoveryAt: Date | null;
  additionalDiscoveryDelayMs: number | null;
};

export type ExistingObservationalOutcome = {
  newLvSourceObserved: boolean;
  newTopLevelSourceObserved: boolean;
  additionalDiscoveryDelayMs: number | null;
  simulatedNextPollAt: Date | null;
  simulatedDiscoveryAt: Date | null;
};

@Injectable()
export class ApdShadowBaselinePollEvidenceService {
  private readonly logger = new Logger(ApdShadowBaselinePollEvidenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly metrics?: AdaptivePollingShadowMetricsService,
  ) {}

  buildObservationalPatch(input: {
    ctx: AdaptivePollingShadowPostPollContext;
    existing?: ExistingObservationalOutcome | null;
  }): BaselinePollObservationalPatch {
    const lvEvidence = evaluateBaselineLvSourceEvidence({
      previousLvProviderSourceMs: input.ctx.previousLvSourceMs,
      strictLvProviderSourceMs: input.ctx.baselineLvProviderSourceMs,
    });
    const top = evaluateBaselineTopLevelSourceAdvance({
      previousSourceTimestampMs: input.ctx.previousTopLevelSourceMs,
      newSourceTimestampMs: input.ctx.newTopLevelSourceMs,
    });

    const lvInformative = baselineLvEvidenceIsSkipInformative(lvEvidence);
    const lvAt =
      lvEvidence.kind === 'STRICT_LV_ADVANCE' ||
      lvEvidence.kind === 'FIRST_VALID_LV_OBSERVATION'
        ? new Date(lvEvidence.providerSourceMs)
        : null;

    const existing = input.existing;
    const preserveDiscovery =
      existing?.additionalDiscoveryDelayMs != null &&
      existing.simulatedNextPollAt != null;

    return {
      newLvSourceObserved: lvInformative,
      newLvSourceAt: lvInformative ? lvAt : null,
      newTopLevelSourceObserved: top.informative,
      simulatedNextPollAt: preserveDiscovery ? existing!.simulatedNextPollAt : null,
      simulatedDiscoveryAt: preserveDiscovery ? existing!.simulatedDiscoveryAt : null,
      additionalDiscoveryDelayMs: preserveDiscovery
        ? existing!.additionalDiscoveryDelayMs
        : null,
    };
  }

  recordSkippedInformativeIfNeeded(input: {
    policyVersion: string;
    prePollDecision: string;
    patch: BaselinePollObservationalPatch;
    existing: ExistingObservationalOutcome | null;
  }): void {
    if (input.prePollDecision !== 'WOULD_SKIP') {
      return;
    }
    const lvNew =
      input.patch.newLvSourceObserved && !input.existing?.newLvSourceObserved;
    const topNew =
      input.patch.newTopLevelSourceObserved &&
      !input.existing?.newTopLevelSourceObserved;
    if (lvNew) {
      this.metrics?.recordSkippedInformative(input.policyVersion, 'lv');
    }
    if (topNew) {
      this.metrics?.recordSkippedInformative(input.policyVersion, 'top_level');
    }
  }

  /**
   * When a later baseline poll completes, backfill discovery delay for prior
   * WOULD_SKIP rows that already recorded informative LV/top evidence.
   */
  async reconcilePriorSkipDiscoveryDelayFromObservingPoll(input: {
    organizationId: string;
    vehicleId: string;
    activationEpochId: string;
    observingPollStartedAtMs: number;
    observingPollCompletedAtMs: number;
  }): Promise<void> {
    const priorRows = await this.prisma.apdShadowReconciliationDecision.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        activationEpochId: input.activationEpochId,
        decision: 'WOULD_SKIP',
        realPollStatus: 'SUCCESS',
        additionalDiscoveryDelayMs: null,
        OR: [{ newLvSourceObserved: true }, { newTopLevelSourceObserved: true }],
        realPollCompletedAt: {
          lt: new Date(input.observingPollStartedAtMs),
        },
      },
      select: {
        opportunityId: true,
        policyVersion: true,
        realPollCompletedAt: true,
      },
    });

    for (const row of priorRows) {
      if (!row.realPollCompletedAt) continue;
      const delayEvidence = evaluateBaselineSkipDiscoveryDelay({
        priorPollCompletedAtMs: row.realPollCompletedAt.getTime(),
        nextBaselinePollStartedAtMs: input.observingPollStartedAtMs,
        nextBaselinePollCompletedAtMs: input.observingPollCompletedAtMs,
      });
      if (delayEvidence.kind !== 'OBSERVABLE_NEXT_BASELINE_POLL') {
        continue;
      }

      const updated = await this.prisma.apdShadowReconciliationDecision.updateMany({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          opportunityId: row.opportunityId,
          policyVersion: row.policyVersion,
          activationEpochId: input.activationEpochId,
          additionalDiscoveryDelayMs: null,
        },
        data: {
          simulatedNextPollAt: new Date(delayEvidence.simulatedNextPollAtMs),
          additionalDiscoveryDelayMs: delayEvidence.additionalDiscoveryDelayMs,
          simulatedDiscoveryAt: new Date(delayEvidence.simulatedDiscoveryAtMs),
        },
      });
      if (updated.count !== 1) {
        this.logger.debug(
          `APD discovery delay reconcile skipped row count=${updated.count} opp=${row.opportunityId}`,
        );
      }
    }
  }

  /**
   * After async LIVE_VOLTAGE persistence, backfill baseline LV evidence when the
   * immediate post-poll path could not see the measurement row yet.
   */
  async reconcileDeferredLvAfterSnapshotPersistence(input: {
    organizationId: string;
    vehicleId: string;
    providerTimestampMs: number;
    snapshotCorrelationId: string | null | undefined;
    previousLvProviderSourceMsBeforePersist: number | null;
  }): Promise<void> {
    const parsed = parseSnapshotCorrelationId(input.snapshotCorrelationId);
    if (!parsed || parsed.vehicleId !== input.vehicleId) {
      return;
    }

    const poll = await this.prisma.dimoPollLog.findFirst({
      where: {
        vehicleId: input.vehicleId,
        jobType: DimoPollJobType.SNAPSHOT,
        status: DimoPollStatus.SUCCESS,
        startedAt: {
          gte: new Date(parsed.fetchedAtMs - 2_000),
          lte: new Date(parsed.fetchedAtMs + 2_000),
        },
      },
      orderBy: { startedAt: 'asc' },
      select: { id: true, startedAt: true, finishedAt: true },
    });
    if (!poll?.finishedAt) return;

    const rows = await this.prisma.apdShadowReconciliationDecision.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        realPollId: poll.id,
        realPollStatus: 'SUCCESS',
      },
      select: {
        opportunityId: true,
        policyVersion: true,
        decision: true,
        newLvSourceObserved: true,
        newTopLevelSourceObserved: true,
        additionalDiscoveryDelayMs: true,
        simulatedNextPollAt: true,
        simulatedDiscoveryAt: true,
        activationEpochId: true,
      },
    });

    for (const row of rows) {
      const rowEvidence = evaluateBaselineLvSourceEvidence({
        previousLvProviderSourceMs: input.previousLvProviderSourceMsBeforePersist,
        strictLvProviderSourceMs: input.providerTimestampMs,
      });
      if (
        !baselineLvEvidenceIsSkipInformative(rowEvidence) ||
        row.newLvSourceObserved
      ) {
        continue;
      }
      const lvAt =
        rowEvidence.kind === 'STRICT_LV_ADVANCE'
          ? new Date(rowEvidence.providerSourceMs)
          : null;

      const updated = await this.prisma.apdShadowReconciliationDecision.updateMany({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          opportunityId: row.opportunityId,
          policyVersion: row.policyVersion,
          realPollId: poll.id,
          newLvSourceObserved: false,
        },
        data: {
          newLvSourceObserved: true,
          newLvSourceAt: lvAt,
        },
      });

      if (updated.count === 1 && row.decision === 'WOULD_SKIP') {
        this.metrics?.recordSkippedInformative(row.policyVersion, 'lv');
      }
    }
  }
}
