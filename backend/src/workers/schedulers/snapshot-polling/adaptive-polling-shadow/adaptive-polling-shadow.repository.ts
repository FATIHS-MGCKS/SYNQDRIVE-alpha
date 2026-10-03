import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

export interface UpsertApdShadowDecisionRow {
  organizationId: string;
  vehicleId: string;
  opportunityId: string;
  decisionAt: Date;
  realPollId?: string | null;
  policyVersion: string;
  profileVersion: string;
  profileClass: string;
  decision: string;
  reason: string;
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
        realPollId: row.realPollId ?? null,
        policyVersion: row.policyVersion,
        profileVersion: row.profileVersion,
        profileClass: row.profileClass,
        decision: row.decision,
        reason: row.reason,
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
        realPollId: row.realPollId ?? null,
        profileVersion: row.profileVersion,
        profileClass: row.profileClass,
        decision: row.decision,
        reason: row.reason,
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

  async updateOutcome(input: {
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
    policyVersion: string;
    patch: {
      realPollCompletedAt?: Date;
      newLvSourceObserved?: boolean;
      newLvSourceAt?: Date | null;
      newTopLevelSourceObserved?: boolean;
      newObdSourceObserved?: boolean;
      newIgnitionSourceObserved?: boolean;
      simulatedDiscoveryAt?: Date | null;
      additionalDiscoveryDelayMs?: number | null;
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
      },
      data: input.patch,
    });
  }
}
