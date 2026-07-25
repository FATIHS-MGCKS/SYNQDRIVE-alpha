import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WorkflowTimerType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { WorkflowTimerRepository } from '../cancellation/workflow-timer.repository';

type Tx = Prisma.TransactionClient;

export interface ScheduleDurableTimerInput {
  organizationId: string;
  occurrenceId: string;
  idempotencyKey: string;
  timerType: WorkflowTimerType;
  dueAt: Date;
  workflowRunId?: string | null;
  actionRunId?: string | null;
  approvalId?: string | null;
  payload?: Prisma.InputJsonValue;
}

@Injectable()
export class WorkflowDurableTimerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timers: WorkflowTimerRepository,
    private readonly config: ConfigService,
  ) {}

  private get maxDelayMs() {
    return this.config.get<number>('workflowRuntime.maxTimerDelayMs', 30 * 24 * 60 * 60 * 1000);
  }

  validateDueAt(dueAt: Date, now = new Date()): void {
    const delayMs = dueAt.getTime() - now.getTime();
    if (delayMs < 0) {
      throw new BadRequestException('Timer dueAt must not be in the past');
    }
    if (delayMs > this.maxDelayMs) {
      throw new BadRequestException(
        `Timer delay exceeds maximum of ${this.maxDelayMs}ms`,
      );
    }
  }

  async scheduleOrReplace(
    input: ScheduleDurableTimerInput,
    tx?: Tx,
  ) {
    this.validateDueAt(input.dueAt);
    const client = tx ?? this.prisma;
    const run = async (trx: Tx) => {
      await this.timers.cancelScheduledByOccurrence(trx, input.organizationId, input.occurrenceId);
      await trx.workflowTimer.updateMany({
        where: {
          organizationId: input.organizationId,
          idempotencyKey: input.idempotencyKey,
          status: 'SCHEDULED',
        },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      return this.timers.schedule(trx, {
        organizationId: input.organizationId,
        workflowRunId: input.workflowRunId,
        actionRunId: input.actionRunId,
        approvalId: input.approvalId,
        timerType: input.timerType,
        fireAt: input.dueAt,
        idempotencyKey: input.idempotencyKey,
        occurrenceId: input.occurrenceId,
        payload: input.payload,
      });
    };

    if (tx) return run(tx);
    return this.prisma.$transaction(run);
  }

  cancelByOccurrence(orgId: string, occurrenceId: string, tx?: Tx) {
    if (tx) {
      return this.timers.cancelScheduledByOccurrence(tx, orgId, occurrenceId);
    }
    return this.prisma.$transaction((trx) =>
      this.timers.cancelScheduledByOccurrence(trx, orgId, occurrenceId),
    );
  }

  findScheduledByOccurrence(orgId: string, occurrenceId: string) {
    return this.prisma.workflowTimer.findFirst({
      where: { organizationId: orgId, occurrenceId, status: 'SCHEDULED' },
      orderBy: { createdAt: 'desc' },
    });
  }
}
