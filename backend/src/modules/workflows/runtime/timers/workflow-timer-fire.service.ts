import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WorkflowTimer } from '@prisma/client';
import { WorkflowTimerRepository } from '../cancellation/workflow-timer.repository';
import { WorkflowRunWorkerService } from '../workflow-run-worker.service';
import { WorkflowDelayResumeService } from './workflow-delay-resume.service';
import { BookingPickupOverdueTimerService } from './booking-pickup-overdue-timer.service';

export interface TimerFireResult {
  timerId: string;
  fired: boolean;
  handler: string;
  lateMs: number;
  skipped?: boolean;
  skipReason?: string;
}

@Injectable()
export class WorkflowTimerFireService {
  private readonly logger = new Logger(WorkflowTimerFireService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly timers: WorkflowTimerRepository,
    private readonly worker: WorkflowRunWorkerService,
    private readonly delayResume: WorkflowDelayResumeService,
    private readonly bookingPickupOverdue: BookingPickupOverdueTimerService,
  ) {}

  private get lateWarningMs() {
    return this.config.get<number>('workflowRuntime.timerLateWarningMs', 60_000);
  }

  async fireDueTimers(now = new Date(), limit?: number): Promise<TimerFireResult[]> {
    const batch = await this.timers.findDueBatch(
      now,
      limit ?? this.config.get<number>('workflowRuntime.pollBatchSize', 25),
    );
    const results: TimerFireResult[] = [];
    for (const timer of batch) {
      results.push(await this.fireTimer(timer, now));
    }
    return results;
  }

  async fireTimer(timer: WorkflowTimer, now = new Date()): Promise<TimerFireResult> {
    const fired = await this.timers.markFired(timer.id, now);
    if (fired.count === 0) {
      return {
        timerId: timer.id,
        fired: false,
        handler: 'duplicate',
        lateMs: Math.max(0, now.getTime() - timer.fireAt.getTime()),
      };
    }

    const lateMs = Math.max(0, now.getTime() - timer.fireAt.getTime());
    if (lateMs >= this.lateWarningMs) {
      this.logger.warn(
        `Timer ${timer.id} fired ${lateMs}ms late (occurrenceId=${timer.occurrenceId ?? 'n/a'}, type=${timer.timerType})`,
      );
    }

    try {
      switch (timer.timerType) {
        case 'RETRY_BACKOFF':
          if (timer.workflowRunId) {
            await this.worker.processRun(timer.organizationId, timer.workflowRunId);
          }
          return { timerId: timer.id, fired: true, handler: 'RETRY_BACKOFF', lateMs };

        case 'RESUME_DELAY':
          if (timer.actionRunId && timer.workflowRunId) {
            const resumed = await this.delayResume.resumeFromTimer(
              timer.organizationId,
              timer.workflowRunId,
              timer.actionRunId,
            );
            if (resumed) {
              await this.worker.processRun(timer.organizationId, timer.workflowRunId);
            }
          }
          return { timerId: timer.id, fired: true, handler: 'RESUME_DELAY', lateMs };

        case 'SCHEDULED_TRIGGER': {
          const outcome = await this.bookingPickupOverdue.handleScheduledTrigger(timer, now, lateMs);
          return {
            timerId: timer.id,
            fired: true,
            handler: 'SCHEDULED_TRIGGER',
            lateMs,
            skipped: outcome.skipped,
            skipReason: outcome.skipReason,
          };
        }

        case 'APPROVAL_EXPIRY':
          return { timerId: timer.id, fired: true, handler: 'APPROVAL_EXPIRY_NOOP', lateMs };

        default:
          this.logger.warn(`Unhandled timer type ${timer.timerType} for timer ${timer.id}`);
          return { timerId: timer.id, fired: true, handler: 'unhandled', lateMs };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Timer fire failed for ${timer.id}: ${message}`);
      return { timerId: timer.id, fired: true, handler: 'error', lateMs, skipReason: message };
    }
  }
}
