import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { DeviceConnectionWebhookProcessingService } from '@modules/dimo/device-connection-webhook-processing.service';
import type { DeviceConnectionWebhookJobData } from '@modules/dimo/device-connection-webhook-queue.producer';

@Injectable()
@Processor(QUEUE_NAMES.CONNECTIVITY_WEBHOOK_PROCESS, {
  concurrency: 4,
  lockDuration: 120_000,
})
export class DeviceConnectionWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(DeviceConnectionWebhookProcessor.name);

  constructor(private readonly processing: DeviceConnectionWebhookProcessingService) {
    super();
  }

  async process(job: Job<DeviceConnectionWebhookJobData>): Promise<void> {
    const outcome = await this.processing.processInboxId(
      job.data.inboxId,
      Boolean(job.data.replay),
    );
    if (outcome === 'dead_letter' || outcome === 'permanently_failed') {
      return;
    }
    if (outcome === 'retry_scheduled' || outcome === 'skipped') {
      return;
    }
    this.logger.debug(
      `Processed connectivity webhook inbox ${job.data.inboxId} → ${outcome}`,
    );
  }
}
