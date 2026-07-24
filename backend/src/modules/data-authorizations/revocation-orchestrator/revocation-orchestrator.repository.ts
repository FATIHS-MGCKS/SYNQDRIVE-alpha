import { Injectable } from '@nestjs/common';
import {
  DataAuthorizationRevocationWorkflowStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { REVOCATION_ORCHESTRATOR } from './revocation-orchestrator.constants';
import type { RevocationWorkflowRequest } from './revocation-orchestrator.types';

@Injectable()
export class RevocationOrchestratorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createInTransaction(
    tx: Prisma.TransactionClient,
    input: RevocationWorkflowRequest & { idempotencyKey: string },
  ) {
    const data = {
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
      triggerType: input.triggerType,
      status: DataAuthorizationRevocationWorkflowStatus.REVOCATION_REQUESTED,
      correlationId: input.correlationId,
      actorUserId: input.actorUserId ?? null,
      reason: input.reason?.trim() || null,
      processingActivityId: input.processingActivityId ?? null,
      enforcementPolicyId: input.enforcementPolicyId ?? null,
      consentId: input.consentId ?? null,
      providerGrantId: input.providerGrantId ?? null,
      dataSharingAuthId: input.dataSharingAuthId ?? null,
      legacyOrgAuthId: input.legacyOrgAuthId ?? null,
      dataCategories: input.dataCategories as Prisma.InputJsonValue,
      purposes: input.purposes as Prisma.InputJsonValue,
      vehicleIds: input.vehicleIds?.length
        ? (input.vehicleIds as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      completedSteps: [] as Prisma.InputJsonValue,
      maxAttempts: REVOCATION_ORCHESTRATOR.maxAttempts,
      nextRetryAt: new Date(),
    };

    try {
      return await tx.dataAuthorizationRevocationWorkflow.create({ data });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'P2002') {
        const existing = await tx.dataAuthorizationRevocationWorkflow.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  findById(id: string, organizationId?: string) {
    return this.prisma.dataAuthorizationRevocationWorkflow.findFirst({
      where: { id, ...(organizationId ? { organizationId } : {}) },
    });
  }

  findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.dataAuthorizationRevocationWorkflow.findUnique({
      where: { idempotencyKey },
    });
  }

  findDueBatch(limit: number, now: Date = new Date()) {
    return this.prisma.dataAuthorizationRevocationWorkflow.findMany({
      where: {
        status: {
          notIn: [
            DataAuthorizationRevocationWorkflowStatus.REVOCATION_COMPLETE,
            DataAuthorizationRevocationWorkflowStatus.REVOCATION_FAILED,
          ],
        },
        nextRetryAt: { lte: now },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: limit,
    });
  }

  async claimForProcessing(id: string) {
    const result = await this.prisma.dataAuthorizationRevocationWorkflow.updateMany({
      where: {
        id,
        status: {
          notIn: [
            DataAuthorizationRevocationWorkflowStatus.REVOCATION_COMPLETE,
            DataAuthorizationRevocationWorkflowStatus.REVOCATION_FAILED,
          ],
        },
        nextRetryAt: { lte: new Date() },
      },
      data: {
        attempts: { increment: 1 },
        processedAt: new Date(),
      },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  async appendStepEvent(
    tx: Prisma.TransactionClient,
    input: {
      workflowId: string;
      organizationId: string;
      stepKey: string;
      fromStatus: DataAuthorizationRevocationWorkflowStatus | null;
      toStatus: DataAuthorizationRevocationWorkflowStatus;
      outcome: string;
      errorMessage?: string | null;
      correlationId: string;
    },
  ) {
    return tx.dataAuthorizationRevocationStepEvent.create({
      data: {
        workflowId: input.workflowId,
        organizationId: input.organizationId,
        stepKey: input.stepKey,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        outcome: input.outcome,
        errorMessage: input.errorMessage?.slice(0, 2000) ?? null,
        correlationId: input.correlationId,
      },
    });
  }

  async advanceWorkflow(
    tx: Prisma.TransactionClient,
    workflowId: string,
    patch: {
      status: DataAuthorizationRevocationWorkflowStatus;
      completedStep?: string;
      stepErrors?: Record<string, string> | null;
      denySwitchActivatedAt?: Date;
      retentionDecision?: string | null;
      completedAt?: Date;
      failureReason?: string | null;
      failedAt?: Date;
      deadLetteredAt?: Date;
      nextRetryAt?: Date;
      attempts?: number;
    },
  ) {
    const current = await tx.dataAuthorizationRevocationWorkflow.findUnique({
      where: { id: workflowId },
    });
    if (!current) throw new Error(`Revocation workflow not found: ${workflowId}`);

    const completedSteps = Array.isArray(current.completedSteps)
      ? [...(current.completedSteps as string[])]
      : [];
    if (patch.completedStep && !completedSteps.includes(patch.completedStep)) {
      completedSteps.push(patch.completedStep);
    }

    return tx.dataAuthorizationRevocationWorkflow.update({
      where: { id: workflowId },
      data: {
        status: patch.status,
        completedSteps: completedSteps as Prisma.InputJsonValue,
        ...(patch.stepErrors !== undefined
          ? { stepErrors: patch.stepErrors as Prisma.InputJsonValue }
          : {}),
        ...(patch.denySwitchActivatedAt
          ? { denySwitchActivatedAt: patch.denySwitchActivatedAt }
          : {}),
        ...(patch.retentionDecision !== undefined
          ? { retentionDecision: patch.retentionDecision }
          : {}),
        ...(patch.completedAt ? { completedAt: patch.completedAt } : {}),
        ...(patch.failureReason !== undefined ? { failureReason: patch.failureReason } : {}),
        ...(patch.failedAt ? { failedAt: patch.failedAt } : {}),
        ...(patch.deadLetteredAt ? { deadLetteredAt: patch.deadLetteredAt } : {}),
        ...(patch.nextRetryAt ? { nextRetryAt: patch.nextRetryAt } : {}),
        ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
      },
    });
  }

  markRetry(id: string, errorMessage: string, nextRetryAt: Date, stepErrors?: Record<string, string>) {
    return this.prisma.dataAuthorizationRevocationWorkflow.update({
      where: { id },
      data: {
        nextRetryAt,
        failureReason: errorMessage.slice(0, 2000),
        ...(stepErrors ? { stepErrors: stepErrors as Prisma.InputJsonValue } : {}),
      },
    });
  }

  markFailed(id: string, errorMessage: string, stepErrors?: Record<string, string>) {
    const now = new Date();
    return this.prisma.dataAuthorizationRevocationWorkflow.update({
      where: { id },
      data: {
        status: DataAuthorizationRevocationWorkflowStatus.REVOCATION_FAILED,
        failureReason: errorMessage.slice(0, 2000),
        failedAt: now,
        deadLetteredAt: now,
        ...(stepErrors ? { stepErrors: stepErrors as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async recoverStaleProcessing(staleBefore: Date): Promise<string[]> {
    const stale = await this.prisma.dataAuthorizationRevocationWorkflow.findMany({
      where: {
        status: {
          notIn: [
            DataAuthorizationRevocationWorkflowStatus.REVOCATION_COMPLETE,
            DataAuthorizationRevocationWorkflowStatus.REVOCATION_FAILED,
          ],
        },
        updatedAt: { lt: staleBefore },
        processedAt: { not: null },
      },
      select: { id: true },
    });
    if (stale.length === 0) return [];
    const ids = stale.map((r) => r.id);
    await this.prisma.dataAuthorizationRevocationWorkflow.updateMany({
      where: { id: { in: ids } },
      data: { nextRetryAt: new Date() },
    });
    return ids;
  }

  listStepEvents(workflowId: string, organizationId: string) {
    return this.prisma.dataAuthorizationRevocationStepEvent.findMany({
      where: { workflowId, organizationId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
