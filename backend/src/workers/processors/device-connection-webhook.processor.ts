import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { DeviceConnectionWebhookProcessingService } from '@modules/dimo/device-connection-webhook-ingestion/device-connection-webhook-processing.service';
import type { DeviceConnectionWebhookIngestJobData } from '@modules/dimo/device-connection-webhook-ingestion/device-connection-webhook-ingest.service';

@Injectable()
@Processor(QUEUE_NAMES.DEVICE_CONNECTION_WEBHOOK_PROCESS, {
  concurrency: 4,
  lockDuration: 120_000,
})
export class DeviceConnectionWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(DeviceConnectionWebhookProcessor.name);

  constructor(private readonly processing: DeviceConnectionWebhookProcessingService) {
    super();
  }

  async process(job: Job<DeviceConnectionWebhookIngestJobData>): Promise<void> {
    await this.processing.processInboxId(job.data.inboxId, Boolean(job.data.replay));
    this.logger.debug(`Processed device connection webhook inbox ${job.data.inboxId}`);
  }
}
