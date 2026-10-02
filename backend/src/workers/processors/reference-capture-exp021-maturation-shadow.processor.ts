import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { runWithDimoRequestContext } from '@modules/dimo/provider-budget/dimo-request-context';
import { ReferenceCaptureConfig } from '../../modules/vehicle-intelligence/reference-capture/reference-capture.config';
import { EXP021_MATURATION_SHADOW_WORKER_CONCURRENCY } from '../../modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow.constants';
import type { Exp021MaturationShadowJobData } from '../../modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-job.types';
import { ReferenceCaptureExp021MaturationShadowWorkerService } from '../../modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-worker.service';

@Processor(QUEUE_NAMES.REFERENCE_CAPTURE_EXP021_MATURATION_SHADOW, {
  concurrency: EXP021_MATURATION_SHADOW_WORKER_CONCURRENCY,
})
@Injectable()
export class ReferenceCaptureExp021MaturationShadowProcessor extends WorkerHost {
  private readonly logger = new Logger(ReferenceCaptureExp021MaturationShadowProcessor.name);

  constructor(
    private readonly config: ReferenceCaptureConfig,
    private readonly workerService: ReferenceCaptureExp021MaturationShadowWorkerService,
  ) {
    super();
  }

  async process(job: Job<Exp021MaturationShadowJobData>): Promise<void> {
    if (!this.config.isExp021MaturationShadowEnabled()) {
      this.logger.debug(`Maturation shadow disabled — skipping job ${job.id}`);
      return;
    }

    return runWithDimoRequestContext({ category: 'REFERENCE_CAPTURE', priority: 'BACKGROUND' }, () =>
      this.workerService.executeObservationJob(job.data),
    );
  }
}
