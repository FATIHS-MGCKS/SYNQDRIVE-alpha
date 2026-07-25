import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { WORKFLOW_RUNTIME_STATUS_ERROR_CODES } from './workflow-runtime-status.errors';

type Tx = Prisma.TransactionClient;

@Injectable()
export class WorkflowRunRuntimeRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(orgId: string, runId: string, tx: Tx = this.prisma) {
    return tx.workflowRun.findFirst({
      where: { id: runId, organizationId: orgId },
    });
  }

  findByIdOrThrow(orgId: string, runId: string, tx: Tx = this.prisma) {
    return this.findById(orgId, runId, tx).then((row) => {
      if (!row) {
        throw new NotFoundException({
          message: 'Workflow run not found',
          code: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.NOT_FOUND,
        });
      }
      return row;
    });
  }

  async transitionStatus(
    tx: Tx,
    input: {
      orgId: string;
      runId: string;
      fromStatus: string;
      expectedLockVersion: number;
      toStatus: string;
      waitingUntil?: Date | null;
      approvalId?: string | null;
      finishedAt?: Date | null;
      errorMessage?: string | null;
      cancelledAt?: Date | null;
      cancelledByUserId?: string | null;
      cancelledByActorType?: string | null;
      cancelReason?: string | null;
    },
  ) {
    const updated = await tx.workflowRun.updateMany({
      where: {
        id: input.runId,
        organizationId: input.orgId,
        status: input.fromStatus as never,
        lockVersion: input.expectedLockVersion,
      },
      data: {
        status: input.toStatus as never,
        lockVersion: { increment: 1 },
        waitingUntil: input.waitingUntil ?? null,
        approvalId: input.approvalId ?? null,
        finishedAt: input.finishedAt ?? null,
        ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
        ...(input.cancelledAt !== undefined ? { cancelledAt: input.cancelledAt } : {}),
        ...(input.cancelledByUserId !== undefined
          ? { cancelledByUserId: input.cancelledByUserId }
          : {}),
        ...(input.cancelledByActorType !== undefined
          ? { cancelledByActorType: input.cancelledByActorType as never }
          : {}),
        ...(input.cancelReason !== undefined ? { cancelReason: input.cancelReason } : {}),
      },
    });
    return updated.count;
  }

  listActive(orgId: string, limit = 25) {
    return this.prisma.workflowRun.findMany({
      where: {
        organizationId: orgId,
        status: {
          in: ['PENDING', 'RUNNING', 'WAITING', 'WAITING_FOR_APPROVAL'],
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  listExpiredByMaxDuration(maxDurationMs: number, limit = 25, now = new Date()) {
    const startedBefore = new Date(now.getTime() - maxDurationMs);
    return this.prisma.workflowRun.findMany({
      where: {
        status: { in: ['PENDING', 'RUNNING', 'WAITING', 'WAITING_FOR_APPROVAL'] },
        startedAt: { lt: startedBefore },
      },
      orderBy: { startedAt: 'asc' },
      take: limit,
      select: { id: true, organizationId: true, lockVersion: true },
    });
  }

  listResumable(orgId: string, now = new Date()) {
    return this.prisma.workflowRun.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { status: 'RUNNING' },
          { status: 'WAITING', waitingUntil: { lte: now } },
          { status: 'WAITING_FOR_APPROVAL' },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
