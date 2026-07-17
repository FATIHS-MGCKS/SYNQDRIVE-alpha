import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { VoiceWebhookProcessingService } from '@modules/voice-webhook-ingestion/voice-webhook-processing.service';
import type { VoiceWebhookIngestJobData } from '@modules/voice-webhook-ingestion/voice-webhook-ingest.service';

@Injectable()
@Processor(QUEUE_NAMES.VOICE_WEBHOOK_PROCESS, {
  concurrency: 4,
  lockDuration: 120_000,
})
export class VoiceWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(VoiceWebhookProcessor.name);

  constructor(private readonly processing: VoiceWebhookProcessingService) {
    super();
  }

  async process(job: Job<VoiceWebhookIngestJobData>): Promise<void> {
    await this.processing.processEventId(job.data.eventId, Boolean(job.data.replay));
    this.logger.debug(`Processed voice webhook event ${job.data.eventId}`);
  }
}
