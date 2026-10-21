import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { runWithDimoRequestContext } from '@modules/dimo/provider-budget/dimo-request-context';
import { ReferenceCaptureConfig } from '../../modules/vehicle-intelligence/reference-capture/reference-capture.config';
import { ReferenceCaptureSettlementShadowService } from '../../modules/vehicle-intelligence/reference-capture/reference-capture-settlement-shadow.service';
import type { SettlementShadowJobData } from '../../modules/vehicle-intelligence/reference-capture/reference-capture-settlement-shadow.types';

@Processor(QUEUE_NAMES.REFERENCE_CAPTURE_SETTLEMENT_SHADOW, { concurrency: 2 })
@Injectable()
export class ReferenceCaptureSettlementShadowProcessor extends WorkerHost {
  private readonly logger = new Logger(ReferenceCaptureSettlementShadowProcessor.name);

  constructor(
    private readonly config: ReferenceCaptureConfig,
    private readonly shadowService: ReferenceCaptureSettlementShadowService,
  ) {
    super();
  }

  async process(job: Job<SettlementShadowJobData>): Promise<void> {
    if (!this.config.isSettlementShadowEnabled()) {
      this.logger.debug(`Settlement shadow disabled — skipping job ${job.id}`);
      return;
    }

    return runWithDimoRequestContext({ category: 'REFERENCE_CAPTURE', priority: 'BACKGROUND' }, () =>
      this.shadowService.executeScheduledObservation(job.data.scheduleId),
    );
  }
}
