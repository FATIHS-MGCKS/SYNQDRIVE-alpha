import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { WorkflowEventOutboxProcessorService } from '@modules/workflows/outbox/workflow-event-outbox-processor.service';

export interface WorkflowEventOutboxJobData {
  outboxId: string;
}

@Injectable()
@Processor(QUEUE_NAMES.WORKFLOW_EVENT_OUTBOX, {
  concurrency: 4,
  lockDuration: 120_000,
})
export class WorkflowEventOutboxProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowEventOutboxProcessor.name);

  constructor(private readonly processor: WorkflowEventOutboxProcessorService) {
    super();
  }

  async process(job: Job<WorkflowEventOutboxJobData>): Promise<void> {
    const result = await this.processor.processOutboxId(job.data.outboxId);
    this.logger.debug(`Processed workflow event outbox ${job.data.outboxId}: ${result}`);
  }
}
