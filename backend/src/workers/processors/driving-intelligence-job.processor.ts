import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DrivingIntelligenceJobProcessorService } from '@modules/vehicle-intelligence/driving-intelligence-jobs/driving-intelligence-jobs.processor.service';
import type { DrivingIntelligenceBullJobData } from '@modules/vehicle-intelligence/driving-intelligence-jobs/driving-intelligence-jobs.types';
import { QUEUE_NAMES } from '../queues/queue-names';

@Injectable()
@Processor(QUEUE_NAMES.DRIVING_INTELLIGENCE, {
  concurrency: 2,
  lockDuration: 120_000,
})
export class DrivingIntelligenceJobProcessor extends WorkerHost {
  private readonly logger = new Logger(DrivingIntelligenceJobProcessor.name);

  constructor(private readonly processorService: DrivingIntelligenceJobProcessorService) {
    super();
  }

  async process(job: Job<DrivingIntelligenceBullJobData>): Promise<void> {
    const { persistentJobId, organizationId, jobType } = job.data;
    this.logger.log(
      `Driving intelligence worker started: bullJob=${job.id} persistentJobId=${persistentJobId} type=${jobType}`,
    );

    const result = await this.processorService.processPersistentJobForWorker(
      organizationId,
      persistentJobId,
    );
    this.logger.debug(
      `Driving intelligence worker finished: persistentJobId=${persistentJobId}`,
    );
  }
}
