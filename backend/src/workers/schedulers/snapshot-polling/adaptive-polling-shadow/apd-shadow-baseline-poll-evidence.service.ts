import { Injectable, Logger, Optional } from '@nestjs/common';
import { DimoPollJobType, DimoPollStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AdaptivePollingShadowMetricsService } from './adaptive-polling-shadow-metrics.service';
import {
  baselineLvAdvanceIsInformative,
  evaluateBaselineLvSourceAdvanceFromPayload,
  evaluateBaselineSkipDiscoveryDelay,
  evaluateBaselineTopLevelSourceAdvance,
  parseSnapshotCorrelationId,
  type BaselineLvSourceAdvanceEvidence,
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

@Injectable()
export class ApdShadowBaselinePollEvidenceService {
  private readonly logger = new Logger(ApdShadowBaselinePollEvidenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly metrics?: AdaptivePollingShadowMetricsService,
  ) {}

  buildObservationalPatch(input: {
    ctx: AdaptivePollingShadowPostPollContext;
    prePollDecision: string;
    nextBaselineSnapshotPollStartedAtMs: number | null;
  }): BaselinePollObservationalPatch {
    const lvEvidence = evaluateBaselineLvSourceAdvanceFromPayload({
      previousLvProviderSourceMs: input.ctx.previousLvSourceMs,
      payloadLvProviderSourceMs: input.ctx.baselineLvProviderSourceMs,
    });
    const top = evaluateBaselineTopLevelSourceAdvance({
      previousSourceTimestampMs: input.ctx.previousTopLevelSourceMs,
      newSourceTimestampMs: input.ctx.newTopLevelSourceMs,
    });

    const lvInformative = baselineLvAdvanceIsInformative(lvEvidence);
    const lvAt =
      lvEvidence.kind === 'TRUE_ADVANCE'
        ? new Date(lvEvidence.providerSourceMs)
        : null;

    let simulatedNextPollAt: Date | null = null;
    let simulatedDiscoveryAt: Date | null = null;
    let additionalDiscoveryDelayMs: number | null = null;

    if (input.prePollDecision === 'WOULD_SKIP' && (lvInformative || top.informative)) {
      const delayEvidence = evaluateBaselineSkipDiscoveryDelay({
        pollCompletedAtMs: input.ctx.pollCompletedAtMs,
        informativeLvProviderSourceMs:
          lvEvidence.kind === 'TRUE_ADVANCE' ? lvEvidence.providerSourceMs : null,
        informativeTopLevelSourceMs: top.informative
          ? input.ctx.newTopLevelSourceMs
          : null,
        nextBaselineSnapshotPollStartedAtMs: input.nextBaselineSnapshotPollStartedAtMs,
      });
      if (delayEvidence.kind === 'OBSERVABLE_NEXT_BASELINE_POLL') {
        simulatedNextPollAt = new Date(delayEvidence.simulatedNextPollAtMs);
        additionalDiscoveryDelayMs = delayEvidence.additionalDiscoveryDelayMs;
        simulatedDiscoveryAt =
          delayEvidence.simulatedDiscoveryAtMs != null
            ? new Date(delayEvidence.simulatedDiscoveryAtMs)
            : null;
      }
    }

    return {
      newLvSourceObserved: lvInformative,
      newLvSourceAt: lvAt,
      newTopLevelSourceObserved: top.informative,
      simulatedNextPollAt,
      simulatedDiscoveryAt,
      additionalDiscoveryDelayMs,
    };
  }

  recordSkippedInformativeIfNeeded(input: {
    policyVersion: string;
    prePollDecision: string;
    patch: BaselinePollObservationalPatch;
    alreadyRecordedLv: boolean;
    alreadyRecordedTop: boolean;
  }): { recordedLv: boolean; recordedTop: boolean } {
    if (input.prePollDecision !== 'WOULD_SKIP') {
      return { recordedLv: false, recordedTop: false };
    }
    let recordedLv = false;
    let recordedTop = false;
    if (input.patch.newLvSourceObserved && !input.alreadyRecordedLv) {
      this.metrics?.recordSkippedInformative(input.policyVersion, 'lv');
      recordedLv = true;
    }
    if (input.patch.newTopLevelSourceObserved && !input.alreadyRecordedTop) {
      this.metrics?.recordSkippedInformative(input.policyVersion, 'top_level');
      recordedTop = true;
    }
    return { recordedLv, recordedTop };
  }

  async resolveNextBaselineSnapshotPollStartedAtMs(
    vehicleId: string,
    afterStartedAtMs: number,
  ): Promise<number | null> {
    const row = await this.prisma.dimoPollLog.findFirst({
      where: {
        vehicleId,
        jobType: DimoPollJobType.SNAPSHOT,
        status: DimoPollStatus.SUCCESS,
        startedAt: { gt: new Date(afterStartedAtMs) },
      },
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true },
    });
    return row?.startedAt?.getTime() ?? null;
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
    previousLvProviderSourceMsAtPersist: number | null;
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
        lastLvSourceAt: true,
      },
    });

    const nextPollMs = await this.resolveNextBaselineSnapshotPollStartedAtMs(
      input.vehicleId,
      poll.startedAt.getTime(),
    );

    for (const row of rows) {
      const rowEvidence = evaluateBaselineLvSourceAdvanceFromPayload({
        previousLvProviderSourceMs:
          row.lastLvSourceAt?.getTime() ??
          input.previousLvProviderSourceMsAtPersist,
        payloadLvProviderSourceMs: input.providerTimestampMs,
      });
      if (!baselineLvAdvanceIsInformative(rowEvidence) || row.newLvSourceObserved) {
        continue;
      }
      const lvAt =
        rowEvidence.kind === 'TRUE_ADVANCE'
          ? new Date(rowEvidence.providerSourceMs)
          : null;
      const delayPatch =
        row.decision === 'WOULD_SKIP'
          ? this.buildObservationalPatch({
              ctx: {
                organizationId: input.organizationId,
                vehicleId: input.vehicleId,
                opportunityId: row.opportunityId,
                realPollId: poll.id,
                pollStartedAtMs: poll.startedAt.getTime(),
                pollCompletedAtMs: poll.finishedAt!.getTime(),
                realPollVisibleLvSourceAtMs: null,
                previousLvSourceMs: input.previousLvProviderSourceMsAtPersist,
                baselineLvProviderSourceMs: input.providerTimestampMs,
                previousTopLevelSourceMs: null,
                newTopLevelSourceMs: null,
                providerFetchedAtMs: null,
              },
              prePollDecision: row.decision,
              nextBaselineSnapshotPollStartedAtMs: nextPollMs,
            })
          : null;

      await this.prisma.apdShadowReconciliationDecision.updateMany({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          opportunityId: row.opportunityId,
          policyVersion: row.policyVersion,
        },
        data: {
          newLvSourceObserved: true,
          newLvSourceAt: lvAt,
          ...(delayPatch && row.decision === 'WOULD_SKIP'
            ? {
                simulatedNextPollAt: delayPatch.simulatedNextPollAt,
                simulatedDiscoveryAt: delayPatch.simulatedDiscoveryAt,
                additionalDiscoveryDelayMs: delayPatch.additionalDiscoveryDelayMs,
              }
            : {}),
        },
      });

      if (row.decision === 'WOULD_SKIP') {
        this.metrics?.recordSkippedInformative(row.policyVersion, 'lv');
      }
    }
  }
}
