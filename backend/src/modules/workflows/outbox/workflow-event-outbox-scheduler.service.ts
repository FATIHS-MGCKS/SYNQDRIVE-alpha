import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron } from '@nestjs/schedule';
import { ConfigType } from '@nestjs/config';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import workflowEventOutboxConfig from '@config/workflow-event-outbox.config';
import { WorkflowEventOutboxRepository } from './workflow-event-outbox.repository';
import { WorkflowEventOutboxObservabilityService } from './workflow-event-outbox-observability.service';
import { WorkflowEventOutboxProcessorService } from './workflow-event-outbox-processor.service';
import {
  WORKFLOW_EVENT_OUTBOX_JOB_NAME,
  buildWorkflowEventOutboxJobId,
  buildWorkflowEventOutboxJobOptions,
} from './workflow-event-outbox-queue.util';

@Injectable()
export class WorkflowEventOutboxSchedulerService {
  private readonly logger = new Logger(WorkflowEventOutboxSchedulerService.name);
  private lastPollAt: Date | null = null;
  private lastPollError: string | null = null;

  constructor(
    @InjectQueue(QUEUE_NAMES.WORKFLOW_EVENT_OUTBOX)
    private readonly queue: Queue,
    @Inject(workflowEventOutboxConfig.KEY)
    private readonly config: ConfigType<typeof workflowEventOutboxConfig>,
    private readonly outboxRepo: WorkflowEventOutboxRepository,
    private readonly processor: WorkflowEventOutboxProcessorService,
    private readonly observability: WorkflowEventOutboxObservabilityService,
  ) {}

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getLastPollAt(): Date | null {
    return this.lastPollAt;
  }

  getLastPollError(): string | null {
    return this.lastPollError;
  }

  async scheduleOutboxIds(outboxIds: string[]): Promise<void> {
    if (!this.isEnabled() || outboxIds.length === 0) return;

    await Promise.all(
      outboxIds.map(async (outboxId) => {
        const jobId = buildWorkflowEventOutboxJobId(outboxId);
        const existing = await this.queue.getJob(jobId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'active' || state === 'waiting' || state === 'delayed') return;
          if (state === 'completed' || state === 'failed') {
            await existing.remove();
          }
        }
        await this.queue.add(
          WORKFLOW_EVENT_OUTBOX_JOB_NAME,
          { outboxId },
          buildWorkflowEventOutboxJobOptions(this.config, outboxId),
        );
      }),
    );
  }

  @Cron('*/30 * * * * *')
  async pollPendingOutbox(): Promise<void> {
    if (!this.isEnabled()) return;
    if (this.processor.isShuttingDown()) return;

    try {
      const recovered = await this.processor.recoverExpiredClaims();
      if (recovered.length > 0) {
        await this.scheduleOutboxIds(recovered);
      }

      const lag = await this.outboxRepo.countQueueLag();
      this.observability.setQueueLag(lag);

      const pending = await this.outboxRepo.findPendingBatch(this.config.pollBatchSize);
      if (pending.length > 0) {
        await this.scheduleOutboxIds(pending.map((row) => row.id));
      }

      this.lastPollAt = new Date();
      this.lastPollError = null;
    } catch (err: unknown) {
      this.lastPollError = err instanceof Error ? err.message : String(err);
      this.logger.error(`Workflow event outbox poll failed: ${this.lastPollError}`);
    }
  }
}
