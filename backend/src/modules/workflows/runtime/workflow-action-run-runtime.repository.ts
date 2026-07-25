import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkflowRuntimeActionRunStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { WORKFLOW_RUNTIME_STATUS_ERROR_CODES } from './workflow-runtime-status.errors';

type Tx = Prisma.TransactionClient;

const CLAIMABLE_ACTION_STATUSES: WorkflowRuntimeActionRunStatus[] = [
  'PENDING',
  'FAILED_RETRYABLE',
];

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
      errorCode?: string | null;
      errorCategory?: string | null;
      errorSummary?: string | null;
      resultSummary?: Prisma.InputJsonValue;
      providerReference?: string | null;
      inputSnapshot?: Prisma.InputJsonValue;
      timeoutAt?: Date | null;
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
        ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
        ...(input.errorCategory !== undefined ? { errorCategory: input.errorCategory } : {}),
        ...(input.errorSummary !== undefined ? { errorSummary: input.errorSummary } : {}),
        ...(input.resultSummary !== undefined ? { resultSummary: input.resultSummary } : {}),
        ...(input.providerReference !== undefined ? { providerReference: input.providerReference } : {}),
        ...(input.inputSnapshot !== undefined ? { inputSnapshot: input.inputSnapshot } : {}),
        ...(input.timeoutAt !== undefined ? { timeoutAt: input.timeoutAt } : {}),
      },
    });
    return updated.count;
  }

  patchExecutionFields(
    orgId: string,
    actionRunId: string,
    fields: {
      inputSnapshot?: Prisma.InputJsonValue;
      timeoutAt?: Date | null;
      maxAttempts?: number;
    },
  ) {
    return this.prisma.workflowActionRun.updateMany({
      where: { id: actionRunId, organizationId: orgId },
      data: fields,
    });
  }

  findOpenActionRuns(orgId: string, now = new Date()) {
    return this.prisma.workflowActionRun.findMany({
      where: {
        organizationId: orgId,
        status: {
          in: ['PENDING', 'RUNNING', 'FAILED_RETRYABLE', 'WAITING', 'WAITING_FOR_APPROVAL'],
        },
        OR: [
          { status: { not: 'FAILED_RETRYABLE' } },
          { nextAttemptAt: null },
          { nextAttemptAt: { lte: now } },
        ],
      },
      orderBy: [{ workflowRunId: 'asc' }, { actionIndex: 'asc' }],
    });
  }

  listResumable(orgId: string, now = new Date()) {
    return this.prisma.workflowActionRun.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { status: 'RUNNING' },
          { status: 'WAITING', waitingUntil: { lte: now } },
          { status: 'WAITING_FOR_APPROVAL' },
          {
            status: 'FAILED_RETRYABLE',
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  findStaleRunningBatch(staleBefore: Date, limit: number) {
    return this.prisma.workflowActionRun.findMany({
      where: {
        status: 'RUNNING',
        OR: [
          { leaseExpiresAt: { lt: staleBefore } },
          {
            leaseExpiresAt: null,
            startedAt: { lt: staleBefore },
          },
        ],
      },
      orderBy: { startedAt: 'asc' },
      take: limit,
      select: { id: true, organizationId: true },
    });
  }

  async claimForExecution(
    orgId: string,
    actionRunId: string,
    workerId: string,
    leaseMs: number,
    timeoutMs: number,
    now: Date = new Date(),
  ) {
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    const timeoutAt = new Date(now.getTime() + timeoutMs);
    const result = await this.prisma.workflowActionRun.updateMany({
      where: {
        id: actionRunId,
        organizationId: orgId,
        status: { in: CLAIMABLE_ACTION_STATUSES },
        AND: [
          { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
          { OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] },
        ],
      },
      data: {
        status: 'RUNNING',
        claimedByWorkerId: workerId,
        leaseExpiresAt,
        lastHeartbeatAt: now,
        startedAt: now,
        timeoutAt,
        lockVersion: { increment: 1 },
        attemptCount: { increment: 1 },
      },
    });
    if (result.count === 0) return null;
    return this.findById(orgId, actionRunId);
  }

  async renewHeartbeat(
    orgId: string,
    actionRunId: string,
    workerId: string,
    leaseMs: number,
    now: Date = new Date(),
  ) {
    const result = await this.prisma.workflowActionRun.updateMany({
      where: {
        id: actionRunId,
        organizationId: orgId,
        status: 'RUNNING',
        claimedByWorkerId: workerId,
        leaseExpiresAt: { gt: now },
      },
      data: {
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
        lastHeartbeatAt: now,
      },
    });
    return result.count > 0;
  }

  async releaseStaleClaim(actionRunId: string, now: Date = new Date()) {
    const result = await this.prisma.workflowActionRun.updateMany({
      where: {
        id: actionRunId,
        status: 'RUNNING',
        OR: [
          { leaseExpiresAt: { lt: now } },
          {
            leaseExpiresAt: null,
            startedAt: { lt: now },
          },
        ],
      },
      data: {
        status: 'FAILED_RETRYABLE',
        claimedByWorkerId: null,
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
        errorMessage: 'Processing lease expired before completion',
      },
    });
    return result.count > 0;
  }

  async completeExecution(
    tx: Tx,
    input: {
      orgId: string;
      actionRunId: string;
      expectedLockVersion: number;
      toStatus: string;
      output?: Prisma.InputJsonValue;
      resultSummary?: Prisma.InputJsonValue;
      errorMessage?: string | null;
      errorCode?: string | null;
      errorCategory?: string | null;
      errorSummary?: string | null;
      providerReference?: string | null;
      waitingUntil?: Date | null;
      approvalId?: string | null;
      finishedAt?: Date | null;
      attemptCount?: number;
      nextAttemptAt?: Date | null;
    },
  ) {
    const updated = await tx.workflowActionRun.updateMany({
      where: {
        id: input.actionRunId,
        organizationId: input.orgId,
        status: 'RUNNING',
        lockVersion: input.expectedLockVersion,
      },
      data: {
        status: input.toStatus as never,
        lockVersion: { increment: 1 },
        claimedByWorkerId: null,
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
        output: input.output,
        resultSummary: input.resultSummary,
        errorMessage: input.errorMessage ?? null,
        errorCode: input.errorCode ?? null,
        errorCategory: input.errorCategory ?? null,
        errorSummary: input.errorSummary ?? null,
        providerReference: input.providerReference ?? null,
        waitingUntil: input.waitingUntil ?? null,
        approvalId: input.approvalId ?? null,
        finishedAt: input.finishedAt ?? null,
        attemptCount: input.attemptCount,
        nextAttemptAt: input.nextAttemptAt ?? null,
      },
    });
    return updated.count;
  }
}
