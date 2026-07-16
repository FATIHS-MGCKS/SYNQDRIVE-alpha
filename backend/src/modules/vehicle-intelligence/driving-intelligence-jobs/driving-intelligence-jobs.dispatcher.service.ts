import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { buildBullJobId } from './driving-intelligence-jobs.contract';
import {
  DRIVING_INTELLIGENCE_JOB_BASE_BACKOFF_MS,
  DRIVING_INTELLIGENCE_JOB_DEFAULT_MAX_ATTEMPTS,
} from './driving-intelligence-jobs.retry-policy';
import { DrivingIntelligenceJobRepository } from './driving-intelligence-jobs.repository';
import type {
  DrivingIntelligenceBullJobData,
  EnqueueDrivingIntelligenceJobInput,
  EnqueueDrivingIntelligenceJobResult,
} from './driving-intelligence-jobs.types';

@Injectable()
export class DrivingIntelligenceJobDispatcherService {
  private readonly logger = new Logger(DrivingIntelligenceJobDispatcherService.name);

  constructor(
    private readonly repository: DrivingIntelligenceJobRepository,
    @InjectQueue(QUEUE_NAMES.DRIVING_INTELLIGENCE)
    private readonly queue: Queue<DrivingIntelligenceBullJobData>,
  ) {}

  async enqueue(input: EnqueueDrivingIntelligenceJobInput): Promise<EnqueueDrivingIntelligenceJobResult> {
    const prepared = await this.repository.prepareEnqueue(input);

    if (this.repository.shouldSkipEnqueue(prepared.job.status)) {
      return {
        job: prepared.job,
        created: prepared.created,
        deduplicated: prepared.deduplicated,
        enqueued: false,
      };
    }

    if (!canEnqueueQueue(this.logger, 'driving-intelligence')) {
      return {
        job: prepared.job,
        created: prepared.created,
        deduplicated: prepared.deduplicated,
        enqueued: false,
      };
    }

    const bullJobId = buildBullJobId(prepared.job.id);
    const bullData: DrivingIntelligenceBullJobData = {
      persistentJobId: prepared.job.id,
      jobType: prepared.job.jobType,
      organizationId: prepared.job.organizationId,
    };

    try {
      await this.queue.add(prepared.job.jobType, bullData, {
        jobId: bullJobId,
        removeOnComplete: true,
        removeOnFail: 10,
        attempts: DRIVING_INTELLIGENCE_JOB_DEFAULT_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: DRIVING_INTELLIGENCE_JOB_BASE_BACKOFF_MS },
      });

      const enqueued = await this.repository.markEnqueued(prepared.job.id, bullJobId);
      this.logger.log(
        `Enqueued driving intelligence job type=${prepared.job.jobType} id=${prepared.job.id} bullJobId=${bullJobId}`,
      );

      return {
        job: enqueued,
        created: prepared.created,
        deduplicated: prepared.deduplicated,
        enqueued: true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already exists') || message.includes('duplicate')) {
        this.logger.debug(
          `Driving intelligence bull job ${bullJobId} already queued for persistent id=${prepared.job.id}`,
        );
        const existing = await this.repository.findById(prepared.job.organizationId, prepared.job.id);
        return {
          job: existing ?? prepared.job,
          created: prepared.created,
          deduplicated: true,
          enqueued: false,
        };
      }

      this.logger.error(
        `Failed to enqueue driving intelligence job id=${prepared.job.id} type=${prepared.job.jobType}: ${message}`,
      );
      throw err;
    }
  }
}
