import { Injectable, Logger } from '@nestjs/common';
import type { DrivingIntelligenceJob } from '@prisma/client';
import { EventContextEnrichmentService } from './event-context-enrichment.service';
import { DrivingEventContextJobService } from './driving-event-context-job.service';
import { EVENT_CONTEXT_MODEL_VERSION } from './event-context.config';

@Injectable()
export class DrivingEventContextEnrichJobHandler {
  private readonly logger = new Logger(DrivingEventContextEnrichJobHandler.name);

  constructor(
    private readonly enrichment: EventContextEnrichmentService,
    private readonly contextJobs: DrivingEventContextJobService,
  ) {}

  async handle(job: DrivingIntelligenceJob): Promise<void> {
    if (this.contextJobs.isCoordinatorJob(job)) {
      await this.contextJobs.handleCoordinatorJob(job);
      return;
    }

    const parsed = this.contextJobs.parsePerEventJob(job);
    if (!parsed) {
      this.logger.warn(
        `Context enrich job ${job.id} has unrecognized idempotency key — treating as coordinator`,
      );
      await this.contextJobs.handleCoordinatorJob(job);
      return;
    }

    const assessment = await this.enrichment.enrichDrivingEventContextForJob(
      parsed.drivingEventId,
      parsed.contextModelVersion ?? EVENT_CONTEXT_MODEL_VERSION,
      { attemptCount: job.attemptCount, maxAttempts: job.maxAttempts },
    );

    this.logger.debug(
      `Context enrich job completed event=${parsed.drivingEventId} status=${assessment.status}`,
    );

    if (job.tripId) {
      await this.contextJobs.tryCompleteEventContextStage(
        job.organizationId,
        job.analysisRunId,
        job.tripId,
      );
    }
  }
}
