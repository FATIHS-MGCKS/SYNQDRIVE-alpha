import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queues/queue-names';
import { TireDs4ShadowProcessorService } from '@modules/vehicle-intelligence/tires/ds4-shadow/tire-ds4-shadow-processor.service';
import type { TireDs4ShadowJobData } from '@modules/vehicle-intelligence/tires/ds4-shadow/tire-ds4-shadow.types';

@Injectable()
@Processor(QUEUE_NAMES.TIRE_DS4_SHADOW, {
  lockDuration: 120_000,
  concurrency: 2,
})
export class TireDs4ShadowProcessor extends WorkerHost {
  private readonly logger = new Logger(TireDs4ShadowProcessor.name);

  constructor(private readonly processor: TireDs4ShadowProcessorService) {
    super();
  }

  async process(job: Job<TireDs4ShadowJobData>) {
    const outcome = await this.processor.processJob(job.data);
    if (outcome.status === 'exhausted') {
      this.logger.warn(
        JSON.stringify({
          event: 'tire_ds4_shadow_job_exhausted',
          jobId: job.id,
          tripId: job.data.tripId,
          reason: outcome.reason,
        }),
      );
    }
    return outcome;
  }
}
