import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WorkflowActionRun, WorkflowRun } from '@prisma/client';
import type { WorkflowActionDef } from '../../workflow-definition.validator';
import { WorkflowDurableTimerService } from './workflow-durable-timer.service';
import type { CanonicalActionExecutionResult } from '../workflow-runtime-action-executor.adapter';

@Injectable()
export class WorkflowDelayActionService {
  constructor(
    private readonly config: ConfigService,
    private readonly durableTimers: WorkflowDurableTimerService,
  ) {}

  async execute(
    action: WorkflowActionDef,
    run: WorkflowRun,
    actionRun: WorkflowActionRun,
  ): Promise<CanonicalActionExecutionResult> {
    const waitingUntil = this.resolveWaitingUntil(action.config ?? {});
    this.durableTimers.validateDueAt(waitingUntil);

    const idempotencyKey = `delay:${run.id}:${actionRun.id}`;
    const occurrenceId = idempotencyKey;

    await this.durableTimers.scheduleOrReplace({
      organizationId: run.organizationId,
      workflowRunId: run.id,
      actionRunId: actionRun.id,
      timerType: 'RESUME_DELAY',
      dueAt: waitingUntil,
      idempotencyKey,
      occurrenceId,
      payload: {
        actionType: action.type,
        waitingUntil: waitingUntil.toISOString(),
      },
    });

    return {
      status: 'WAITING',
      waitingUntil,
      output: {
        delayedUntil: waitingUntil.toISOString(),
        delayMs: waitingUntil.getTime() - Date.now(),
      },
    };
  }

  resolveWaitingUntil(config: Record<string, unknown>): Date {
    const now = Date.now();
    if (typeof config.until === 'string') {
      const until = new Date(config.until);
      if (Number.isNaN(until.getTime())) {
        throw new BadRequestException('workflow.delay until must be ISO-8601 UTC');
      }
      return until;
    }

    const minutes =
      typeof config.minutes === 'number'
        ? config.minutes
        : typeof config.delayMinutes === 'number'
          ? config.delayMinutes
          : null;
    if (minutes === null || !Number.isFinite(minutes) || minutes < 0) {
      throw new BadRequestException('workflow.delay requires minutes or until');
    }
    return new Date(now + minutes * 60_000);
  }
}
