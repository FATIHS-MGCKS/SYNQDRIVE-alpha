import { Injectable } from '@nestjs/common';
import { ApdShadowActivationEpochLifecycle, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  ApdShadowDecisionEpochConflictError,
  ApdShadowDecisionEpochInactiveError,
  ApdShadowDecisionProvenanceImmutableError,
} from './apd-shadow-decision-epoch.errors';
import {
  P25_APD_SHADOW_ADVANCING_DECISIONS,
  P25_APD_SHADOW_EXECUTION_V2,
  P25_APD_SHADOW_EXECUTION_VERSIONS,
  P25_APD_SHADOW_SIMULATED_LV_SOURCE_DECISIONS,
  type ApdShadowCanonicalEnqueueOutcome,
  type ApdShadowRealPollStatus,
  type P25ApdShadowExecutionVersion,
} from './p25-apd-shadow-execution-versions';
import { acquireApdShadowEpochLifecycleXactLock } from './apd-shadow-epoch-lifecycle.lock';

export interface UpsertApdShadowDecisionRow {
  organizationId: string;
  vehicleId: string;
  opportunityId: string;
  decisionAt: Date;
  activationEpochId?: string | null;
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

  /** Durable lastAllowed: latest SUCCESS advancing poll start (shared across reconciliation flag). */
  async resolveLastAllowedPollStartMs(input: {
    organizationId: string;
    vehicleId: string;
    policyVersion: string;
  }): Promise<number> {
    const row = await this.prisma.apdShadowReconciliationDecision.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        policyVersion: input.policyVersion,
        shadowExecutionVersion: { in: [...P25_APD_SHADOW_EXECUTION_VERSIONS] },
        realPollStatus: 'SUCCESS',
        realPollStartedAt: { not: null },
        realPollId: { not: null },
        decision: { in: [...P25_APD_SHADOW_ADVANCING_DECISIONS] },
      },
      orderBy: { realPollStartedAt: 'desc' },
      select: { realPollStartedAt: true },
    });
    return row?.realPollStartedAt?.getTime() ?? 0;
  }

  /** @deprecated Use resolveLastAllowedPollStartMs — reconciliation is not partitioned for lastAllowed. */
  async resolveLastAllowedReconciliationPollMs(input: {
    organizationId: string;
    vehicleId: string;
    policyVersion: string;
    reconciliation: boolean;
  }): Promise<number> {
    return this.resolveLastAllowedPollStartMs({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      policyVersion: input.policyVersion,
    });
  }

  /** Simulated policy LV state: monotonic max visible LV from kept reconciliation polls only. */
  async resolveSimulatedLastLvSourceMs(input: {
    organizationId: string;
    vehicleId: string;
    policyVersion: string;
  }): Promise<number | null> {
    const row = await this.prisma.apdShadowReconciliationDecision.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        policyVersion: input.policyVersion,
        shadowExecutionVersion: { in: [...P25_APD_SHADOW_EXECUTION_VERSIONS] },
        reconciliation: true,
        realPollStatus: 'SUCCESS',
        realPollVisibleLvSourceAt: { not: null },
        realPollId: { not: null },
        decision: { in: [...P25_APD_SHADOW_SIMULATED_LV_SOURCE_DECISIONS] },
      },
      orderBy: { realPollVisibleLvSourceAt: 'desc' },
      select: { realPollVisibleLvSourceAt: true },
    });
    return row?.realPollVisibleLvSourceAt?.getTime() ?? null;
  }

  async upsertPrePollDecision(row: UpsertApdShadowDecisionRow): Promise<void> {
    try {
      await this.upsertPrePollDecisionInner(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        await this.upsertPrePollDecisionInner(row);
        return;
      }
      throw err;
    }
  }

  private async upsertPrePollDecisionInner(row: UpsertApdShadowDecisionRow): Promise<void> {
    const compositeKey = {
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      opportunityId: row.opportunityId,
      policyVersion: row.policyVersion,
    };

    const existing = await this.prisma.apdShadowReconciliationDecision.findUnique({
      where: { organizationId_vehicleId_opportunityId_policyVersion: compositeKey },
      select: {
        id: true,
        decisionAt: true,
        activationEpochId: true,
      },
    });

    const attemptedEpochId = row.activationEpochId ?? null;

    if (!existing) {
      if (!attemptedEpochId) {
        throw new ApdShadowDecisionEpochConflictError(
          'post-T0 shadow decisions require activationEpochId on create',
          {
            ...compositeKey,
            existingEpochId: null,
            attemptedEpochId,
          },
        );
      }
      await this.prisma.$transaction(async (tx) => {
        await this.assertActivationEpochActiveAtCommit(attemptedEpochId, tx);
        await tx.apdShadowReconciliationDecision.create({
          data: {
            organizationId: row.organizationId,
            vehicleId: row.vehicleId,
            opportunityId: row.opportunityId,
            decisionAt: row.decisionAt,
            activationEpochId: attemptedEpochId,
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
        });
      });
      return;
    }

    this.assertEpochBindingImmutable({
      compositeKey,
      existingEpochId: existing.activationEpochId,
      attemptedEpochId,
      existingDecisionAt: existing.decisionAt,
      attemptedDecisionAt: row.decisionAt,
    });

    await this.prisma.apdShadowReconciliationDecision.update({
      where: { id: existing.id },
      data: {
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

  /**
   * Linearization point for new shadow decision creates: epoch must still be ACTIVE in DB.
   */
  private async assertActivationEpochActiveAtCommit(
    activationEpochId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await acquireApdShadowEpochLifecycleXactLock(tx, activationEpochId);
    const epoch = await tx.apdShadowActivationEpoch.findUnique({
      where: { id: activationEpochId },
      select: { lifecycleState: true, activatedAt: true },
    });
    if (
      !epoch ||
      epoch.lifecycleState !== ApdShadowActivationEpochLifecycle.ACTIVE ||
      !epoch.activatedAt
    ) {
      throw new ApdShadowDecisionEpochInactiveError();
    }
  }

  private assertEpochBindingImmutable(input: {
    compositeKey: {
      organizationId: string;
      vehicleId: string;
      opportunityId: string;
      policyVersion: string;
    };
    existingEpochId: string | null;
    attemptedEpochId: string | null;
    existingDecisionAt: Date;
    attemptedDecisionAt: Date;
  }): void {
    if (input.existingDecisionAt.getTime() !== input.attemptedDecisionAt.getTime()) {
      throw new ApdShadowDecisionProvenanceImmutableError(
        'decisionAt is immutable for existing APD shadow decision rows',
      );
    }

    if (input.existingEpochId == null) {
      if (input.attemptedEpochId != null) {
        throw new ApdShadowDecisionEpochConflictError(
          'legacy pre-epoch decision cannot adopt activationEpochId',
          {
            ...input.compositeKey,
            existingEpochId: null,
            attemptedEpochId: input.attemptedEpochId,
          },
        );
      }
      return;
    }

    if (input.attemptedEpochId == null) {
      throw new ApdShadowDecisionEpochConflictError(
        'epoch-bound decision requires activationEpochId on replay',
        {
          ...input.compositeKey,
          existingEpochId: input.existingEpochId,
          attemptedEpochId: null,
        },
      );
    }

    if (input.existingEpochId !== input.attemptedEpochId) {
      throw new ApdShadowDecisionEpochConflictError(
        'cross-epoch replay conflict for opportunity',
        {
          ...input.compositeKey,
          existingEpochId: input.existingEpochId,
          attemptedEpochId: input.attemptedEpochId,
        },
      );
    }
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
        shadowExecutionVersion: { in: [...P25_APD_SHADOW_EXECUTION_VERSIONS] },
      },
      data: {
        enqueueOutcome: input.enqueueOutcome,
        enqueueOutcomeAt: input.enqueueOutcomeAt,
      },
    });
  }

  async findPrePollDecisionForOpportunity(input: {
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
    policyVersion: string;
  }): Promise<{ decision: string; reconciliation: boolean } | null> {
    const row = await this.prisma.apdShadowReconciliationDecision.findUnique({
      where: {
        organizationId_vehicleId_opportunityId_policyVersion: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          opportunityId: input.opportunityId,
          policyVersion: input.policyVersion,
        },
      },
      select: { decision: true, reconciliation: true },
    });
    if (!row || row.reconciliation == null) return null;
    return { decision: row.decision, reconciliation: row.reconciliation };
  }

  async updateSuccessfulPollOutcome(input: {
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
    policyVersion: string;
    activationEpochId?: string | null;
    realPollId: string;
    realPollStartedAt: Date;
    realPollCompletedAt: Date;
    realPollVisibleLvSourceAt?: Date | null;
    shadowExecutionVersionAfterSuccess?: P25ApdShadowExecutionVersion;
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
    const updated = await this.prisma.apdShadowReconciliationDecision.updateMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        opportunityId: input.opportunityId,
        policyVersion: input.policyVersion,
        shadowExecutionVersion: { in: [...P25_APD_SHADOW_EXECUTION_VERSIONS] },
        ...(input.activationEpochId
          ? { activationEpochId: input.activationEpochId }
          : {}),
      },
      data: {
        realPollId: input.realPollId,
        realPollStatus: 'SUCCESS',
        realPollStartedAt: input.realPollStartedAt,
        realPollCompletedAt: input.realPollCompletedAt,
        realPollVisibleLvSourceAt: input.realPollVisibleLvSourceAt ?? null,
        ...(input.shadowExecutionVersionAfterSuccess
          ? { shadowExecutionVersion: input.shadowExecutionVersionAfterSuccess }
          : {}),
        ...input.patch,
      },
    });
    if (input.activationEpochId && updated.count === 0) {
      throw new ApdShadowDecisionEpochConflictError(
        'post-poll update found no epoch-bound decision row',
        {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          opportunityId: input.opportunityId,
          policyVersion: input.policyVersion,
          existingEpochId: input.activationEpochId,
          attemptedEpochId: input.activationEpochId,
        },
      );
    }
  }

  async updateFailedPollOutcome(input: {
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
    activationEpochId?: string | null;
    realPollId: string;
    realPollStartedAt: Date;
  }): Promise<void> {
    const updated = await this.prisma.apdShadowReconciliationDecision.updateMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        opportunityId: input.opportunityId,
        shadowExecutionVersion: { in: [...P25_APD_SHADOW_EXECUTION_VERSIONS] },
        ...(input.activationEpochId
          ? { activationEpochId: input.activationEpochId }
          : {}),
      },
      data: {
        realPollId: input.realPollId,
        realPollStatus: 'FAILURE',
        realPollStartedAt: input.realPollStartedAt,
        realPollCompletedAt: null,
        realPollVisibleLvSourceAt: null,
        newLvSourceObserved: false,
        newTopLevelSourceObserved: false,
        newObdSourceObserved: false,
        newIgnitionSourceObserved: false,
      },
    });
    if (input.activationEpochId && updated.count === 0) {
      throw new ApdShadowDecisionEpochConflictError(
        'failure correlation found no epoch-bound decision row',
        {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          opportunityId: input.opportunityId,
          policyVersion: 'ANY',
          existingEpochId: input.activationEpochId,
          attemptedEpochId: input.activationEpochId,
        },
      );
    }
  }
}
