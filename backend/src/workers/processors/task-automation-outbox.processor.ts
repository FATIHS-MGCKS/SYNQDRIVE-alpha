import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { TaskAutomationOutboxProcessorService } from '@modules/tasks/outbox/task-automation-outbox-processor.service';

export interface TaskAutomationOutboxJobData {
  outboxId: string;
}

@Injectable()
@Processor(QUEUE_NAMES.TASK_AUTOMATION, {
  concurrency: 4,
  lockDuration: 120_000,
})
export class TaskAutomationOutboxProcessor extends WorkerHost {
  private readonly logger = new Logger(TaskAutomationOutboxProcessor.name);

  constructor(private readonly processor: TaskAutomationOutboxProcessorService) {
    super();
  }

  async process(job: Job<TaskAutomationOutboxJobData>): Promise<void> {
    const result = await this.processor.processOutboxId(job.data.outboxId);
    this.logger.debug(`Processed task automation outbox ${job.data.outboxId}: ${result}`);
  }
}
