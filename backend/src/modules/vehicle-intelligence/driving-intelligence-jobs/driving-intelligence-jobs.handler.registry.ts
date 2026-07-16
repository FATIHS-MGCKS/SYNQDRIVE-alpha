import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import type { DrivingIntelligenceJob, DrivingIntelligenceJobType } from '@prisma/client';
import { DrivingEventContextEnrichJobHandler } from '../event-context/driving-event-context-enrich.handler';
import { DimoTripSegmentValidateJobHandler } from '../dimo-trip-segment-validation/dimo-trip-segment-validation.handler';
import { DRIVING_INTELLIGENCE_JOB_TYPES } from './driving-intelligence-jobs.types';

export type DrivingIntelligenceJobHandler = (
  job: DrivingIntelligenceJob,
) => Promise<void>;

@Injectable()
export class DrivingIntelligenceJobHandlerRegistry implements OnModuleInit {
  private readonly logger = new Logger(DrivingIntelligenceJobHandlerRegistry.name);
  private readonly handlers = new Map<DrivingIntelligenceJobType, DrivingIntelligenceJobHandler>();

  constructor(
    @Optional() private readonly eventContextHandler?: DrivingEventContextEnrichJobHandler,
    @Optional() private readonly segmentValidateHandler?: DimoTripSegmentValidateJobHandler,
  ) {}

  onModuleInit(): void {
    for (const jobType of DRIVING_INTELLIGENCE_JOB_TYPES) {
      this.handlers.set(jobType, async (job) => {
        this.logger.debug(
          `Stub handler for ${jobType}: persistentJobId=${job.id} analysisRunId=${job.analysisRunId}`,
        );
      });
    }

    if (this.eventContextHandler) {
      this.handlers.set('DRIVING_EVENT_CONTEXT_ENRICH', (job) =>
        this.eventContextHandler!.handle(job),
      );
    }

    if (this.segmentValidateHandler) {
      this.handlers.set('DIMO_TRIP_SEGMENT_VALIDATE', (job) =>
        this.segmentValidateHandler!.handle(job),
      );
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
