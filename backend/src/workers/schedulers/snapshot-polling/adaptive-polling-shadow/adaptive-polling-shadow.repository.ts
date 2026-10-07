import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  P25_APD_SHADOW_ADVANCING_DECISIONS,
  P25_APD_SHADOW_EXECUTION_V2,
  type ApdShadowCanonicalEnqueueOutcome,
  type ApdShadowRealPollStatus,
} from './p25-apd-shadow-execution-versions';

export interface UpsertApdShadowDecisionRow {
  organizationId: string;
  vehicleId: string;
  opportunityId: string;
  decisionAt: Date;
  policyVersion: string;
  profileVersion: string;
  profileClass: string;
  decision: string;
  reason: string;
  shadowExecutionVersion: string;
  reconciliation: boolean;
  lastLvSourceAt?: Date | null;
  lastProviderFetchedAt?: Date | null;
  expectedWindowStart?: Date | null;
  expectedWindowEnd?: Date | null;
  providerGapState?: string | null;
  connectivityState?: string | null;
  wakeCorrelationId?: string | null;
}

@Injectable()
export class AdaptivePollingShadowRepository {
  constructor(private readonly prisma: PrismaService) {}

  async resolveLastAllowedReconciliationPollMs(input: {
    organizationId: string;
    vehicleId: string;
    policyVersion: string;
    reconciliation: boolean;
  }): Promise<number> {
    const row = await this.prisma.apdShadowReconciliationDecision.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        policyVersion: input.policyVersion,
        shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_V2,
        reconciliation: input.reconciliation,
        realPollStatus: 'SUCCESS',
        realPollCompletedAt: { not: null },
        realPollId: { not: null },
        decision: { in: [...P25_APD_SHADOW_ADVANCING_DECISIONS] },
      },
      orderBy: { realPollCompletedAt: 'desc' },
      select: { realPollCompletedAt: true },
    });
    return row?.realPollCompletedAt?.getTime() ?? 0;
  }

  async upsertPrePollDecision(row: UpsertApdShadowDecisionRow): Promise<void> {
    await this.prisma.apdShadowReconciliationDecision.upsert({
      where: {
        organizationId_vehicleId_opportunityId_policyVersion: {
          organizationId: row.organizationId,
          vehicleId: row.vehicleId,
          opportunityId: row.opportunityId,
          policyVersion: row.policyVersion,
        },
      },
      create: {
        organizationId: row.organizationId,
        vehicleId: row.vehicleId,
        opportunityId: row.opportunityId,
        decisionAt: row.decisionAt,
        policyVersion: row.policyVersion,
        profileVersion: row.profileVersion,
        profileClass: row.profileClass,
        decision: row.decision,
        reason: row.reason,
        shadowExecutionVersion: row.shadowExecutionVersion,
        reconciliation: row.reconciliation,
        lastLvSourceAt: row.lastLvSourceAt ?? null,
        lastProviderFetchedAt: row.lastProviderFetchedAt ?? null,
        expectedWindowStart: row.expectedWindowStart ?? null,
        expectedWindowEnd: row.expectedWindowEnd ?? null,
        providerGapState: row.providerGapState ?? null,
        connectivityState: row.connectivityState ?? null,
        wakeCorrelationId: row.wakeCorrelationId ?? null,
      },
      update: {
        decisionAt: row.decisionAt,
        profileVersion: row.profileVersion,
        profileClass: row.profileClass,
        decision: row.decision,
        reason: row.reason,
        shadowExecutionVersion: row.shadowExecutionVersion,
        reconciliation: row.reconciliation,
        lastLvSourceAt: row.lastLvSourceAt ?? null,
        lastProviderFetchedAt: row.lastProviderFetchedAt ?? null,
        expectedWindowStart: row.expectedWindowStart ?? null,
        expectedWindowEnd: row.expectedWindowEnd ?? null,
        providerGapState: row.providerGapState ?? null,
        connectivityState: row.connectivityState ?? null,
        wakeCorrelationId: row.wakeCorrelationId ?? null,
      },
    });
  }

  async patchEnqueueOutcome(input: {
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
    enqueueOutcome: ApdShadowCanonicalEnqueueOutcome;
    enqueueOutcomeAt: Date;
  }): Promise<void> {
    await this.prisma.apdShadowReconciliationDecision.updateMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        opportunityId: input.opportunityId,
        shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_V2,
      },
      data: {
        enqueueOutcome: input.enqueueOutcome,
        enqueueOutcomeAt: input.enqueueOutcomeAt,
      },
    });
  }

  async updateSuccessfulPollOutcome(input: {
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
    policyVersion: string;
    realPollId: string;
    realPollCompletedAt: Date;
    patch: {
      newLvSourceObserved?: boolean;
      newLvSourceAt?: Date | null;
      newTopLevelSourceObserved?: boolean;
      newObdSourceObserved?: boolean;
      newIgnitionSourceObserved?: boolean;
      legacyAssessmentImpact?: string;
      legacyPublicationImpact?: string;
      legacyCustomerImpact?: string;
    };
  }): Promise<void> {
    await this.prisma.apdShadowReconciliationDecision.updateMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        opportunityId: input.opportunityId,
        policyVersion: input.policyVersion,
        shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_V2,
      },
      data: {
        realPollId: input.realPollId,
        realPollStatus: 'SUCCESS',
        realPollCompletedAt: input.realPollCompletedAt,
        ...input.patch,
      },
    });
  }

  async updateFailedPollOutcome(input: {
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
    realPollId: string;
  }): Promise<void> {
    await this.prisma.apdShadowReconciliationDecision.updateMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        opportunityId: input.opportunityId,
        shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_V2,
      },
      data: {
        realPollId: input.realPollId,
        realPollStatus: 'FAILURE',
        realPollCompletedAt: null,
        newLvSourceObserved: false,
        newTopLevelSourceObserved: false,
        newObdSourceObserved: false,
        newIgnitionSourceObserved: false,
      },
    });
  }
}
