import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { WORKFLOW_RUNTIME_STATUS_ERROR_CODES } from './workflow-runtime-status.errors';

type Tx = Prisma.TransactionClient;

@Injectable()
export class WorkflowActionRunRuntimeRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(orgId: string, actionRunId: string, tx: Tx = this.prisma) {
    return tx.workflowActionRun.findFirst({
      where: { id: actionRunId, organizationId: orgId },
    });
  }

  findByIdOrThrow(orgId: string, actionRunId: string, tx: Tx = this.prisma) {
    return this.findById(orgId, actionRunId, tx).then((row) => {
      if (!row) {
        throw new NotFoundException({
          message: 'Workflow action run not found',
          code: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.ACTION_RUN_NOT_FOUND,
        });
      }
      return row;
    });
  }

  listByRun(orgId: string, workflowRunId: string, tx: Tx = this.prisma) {
    return tx.workflowActionRun.findMany({
      where: { organizationId: orgId, workflowRunId },
      orderBy: { actionIndex: 'asc' },
    });
  }

  async transitionStatus(
    tx: Tx,
    input: {
      orgId: string;
      actionRunId: string;
      fromStatus: string;
      expectedLockVersion: number;
      toStatus: string;
      waitingUntil?: Date | null;
      approvalId?: string | null;
      finishedAt?: Date | null;
      attemptCount?: number;
      nextAttemptAt?: Date | null;
      errorMessage?: string | null;
    },
  ) {
    const updated = await tx.workflowActionRun.updateMany({
      where: {
        id: input.actionRunId,
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
        attemptCount: input.attemptCount,
        nextAttemptAt: input.nextAttemptAt ?? null,
        ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
      },
    });
    return updated.count;
  }

  listResumable(orgId: string, now = new Date()) {
    return this.prisma.workflowActionRun.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { status: 'RUNNING' },
          { status: 'WAITING', waitingUntil: { lte: now } },
          { status: 'WAITING_FOR_APPROVAL' },
          { status: 'FAILED_RETRYABLE', nextAttemptAt: { lte: now } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
