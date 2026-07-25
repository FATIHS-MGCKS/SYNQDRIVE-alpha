import { Injectable } from '@nestjs/common';
import { Prisma, WorkflowTimerStatus, WorkflowTimerType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

type Tx = Prisma.TransactionClient;

@Injectable()
export class WorkflowTimerRepository {
  constructor(private readonly prisma: PrismaService) {}

  schedule(
    tx: Tx,
    input: {
      organizationId: string;
      workflowRunId?: string | null;
      actionRunId?: string | null;
      approvalId?: string | null;
      timerType: WorkflowTimerType;
      fireAt: Date;
      idempotencyKey: string;
      occurrenceId?: string | null;
      payload?: Prisma.InputJsonValue;
    },
  ) {
    return tx.workflowTimer.create({
      data: {
        organizationId: input.organizationId,
        workflowRunId: input.workflowRunId ?? null,
        actionRunId: input.actionRunId ?? null,
        approvalId: input.approvalId ?? null,
        timerType: input.timerType,
        status: 'SCHEDULED',
        fireAt: input.fireAt,
        idempotencyKey: input.idempotencyKey,
        occurrenceId: input.occurrenceId ?? null,
        payload: input.payload ?? {},
      },
    });
  }

  cancelScheduledByOccurrence(tx: Tx, orgId: string, occurrenceId: string, now = new Date()) {
    return tx.workflowTimer.updateMany({
      where: {
        organizationId: orgId,
        occurrenceId,
        status: 'SCHEDULED',
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
      },
    });
  }

  cancelScheduledForRun(tx: Tx, orgId: string, runId: string, now = new Date()) {
    return tx.workflowTimer.updateMany({
      where: {
        organizationId: orgId,
        workflowRunId: runId,
        status: 'SCHEDULED',
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
      },
    });
  }

  cancelScheduledForAction(tx: Tx, orgId: string, actionRunId: string, now = new Date()) {
    return tx.workflowTimer.updateMany({
      where: {
        organizationId: orgId,
        actionRunId,
        status: 'SCHEDULED',
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
      },
    });
  }

  cancelScheduledForApproval(tx: Tx, orgId: string, approvalId: string, now = new Date()) {
    return tx.workflowTimer.updateMany({
      where: {
        organizationId: orgId,
        approvalId,
        status: 'SCHEDULED',
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
      },
    });
  }

  findDueBatch(now: Date, limit: number) {
    return this.prisma.workflowTimer.findMany({
      where: {
        status: 'SCHEDULED',
        fireAt: { lte: now },
      },
      orderBy: { fireAt: 'asc' },
      take: limit,
    });
  }

  markFired(timerId: string, now = new Date()) {
    return this.prisma.workflowTimer.updateMany({
      where: { id: timerId, status: 'SCHEDULED' },
      data: { status: 'FIRED', firedAt: now },
    });
  }

  countScheduledForRun(orgId: string, runId: string) {
    return this.prisma.workflowTimer.count({
      where: { organizationId: orgId, workflowRunId: runId, status: 'SCHEDULED' },
    });
  }

  listScheduledStatuses(): WorkflowTimerStatus[] {
    return ['SCHEDULED'];
  }
}
