import { Injectable, Logger } from '@nestjs/common';
import type { DrivingIntelligenceJob, DrivingIntelligenceJobType } from '@prisma/client';
import { DRIVING_INTELLIGENCE_JOB_TYPES } from './driving-intelligence-jobs.types';

export type DrivingIntelligenceJobHandler = (
  job: DrivingIntelligenceJob,
) => Promise<void>;

/**
 * Stub handler registry for Driving Intelligence V2 job types.
 * Business logic migration happens in later prompts — handlers are no-ops for now.
 */
@Injectable()
export class DrivingIntelligenceJobHandlerRegistry {
  private readonly logger = new Logger(DrivingIntelligenceJobHandlerRegistry.name);
  private readonly handlers = new Map<DrivingIntelligenceJobType, DrivingIntelligenceJobHandler>();

  constructor() {
    for (const jobType of DRIVING_INTELLIGENCE_JOB_TYPES) {
      this.handlers.set(jobType, async (job) => {
        this.logger.debug(
          `Stub handler for ${jobType}: persistentJobId=${job.id} analysisRunId=${job.analysisRunId}`,
        );
      });
    }
  }

  listRegisteredJobTypes(): DrivingIntelligenceJobType[] {
    return [...this.handlers.keys()];
  }

  async dispatch(job: DrivingIntelligenceJob): Promise<void> {
    const handler = this.handlers.get(job.jobType);
    if (!handler) {
      throw new Error(`No handler registered for job type ${job.jobType}`);
    }
    await handler(job);
  }
}
