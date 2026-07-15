import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron } from '@nestjs/schedule';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import taskAutomationOutboxConfig from '@config/task-automation-outbox.config';
import { TaskAutomationOutboxRepository } from './task-automation-outbox.repository';
import { TaskAutomationOutboxObservabilityService } from './task-automation-outbox-observability.service';
import { TaskAutomationOutboxEnqueueService } from './task-automation-outbox-enqueue.service';
import {
  TASK_AUTOMATION_OUTBOX_JOB_NAME,
  buildTaskAutomationOutboxJobId,
  buildTaskAutomationOutboxJobOptions,
} from './task-automation-outbox-queue.util';

@Injectable()
export class TaskAutomationOutboxSchedulerService {
  constructor(
    @InjectQueue(QUEUE_NAMES.TASK_AUTOMATION)
    private readonly queue: Queue,
    @Inject(taskAutomationOutboxConfig.KEY)
    private readonly config: ConfigType<typeof taskAutomationOutboxConfig>,
    private readonly enqueueService: TaskAutomationOutboxEnqueueService,
    private readonly outboxRepo: TaskAutomationOutboxRepository,
    private readonly observability: TaskAutomationOutboxObservabilityService,
  ) {}

  async scheduleOutboxIds(outboxIds: string[]): Promise<void> {
    if (!this.enqueueService.isEnabled() || outboxIds.length === 0) return;

    await Promise.all(
      outboxIds.map(async (outboxId) => {
        const jobId = buildTaskAutomationOutboxJobId(outboxId);
        const existing = await this.queue.getJob(jobId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'active' || state === 'waiting' || state === 'delayed') return;
          if (state === 'completed' || state === 'failed') {
            await existing.remove();
          }
        }
        await this.queue.add(
          TASK_AUTOMATION_OUTBOX_JOB_NAME,
          { outboxId },
          buildTaskAutomationOutboxJobOptions(this.config, outboxId),
        );
      }),
    );
  }

  @Cron('*/30 * * * * *')
  async pollPendingOutbox(): Promise<void> {
    if (!this.enqueueService.isEnabled()) return;

    const staleBefore = new Date(Date.now() - this.config.processingStaleMs);
    const recovered = await this.outboxRepo.recoverStaleProcessing(staleBefore);
    if (recovered.length > 0) {
      await this.scheduleOutboxIds(recovered);
    }

    const pending = await this.outboxRepo.findPendingBatch(this.config.pollBatchSize);
    const backlog = await this.outboxRepo.countBacklog();
    this.observability.setQueueBacklog(backlog);

    if (pending.length === 0) return;
    await this.scheduleOutboxIds(pending.map((row) => row.id));
  }
}
