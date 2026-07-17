import { Injectable, Logger } from '@nestjs/common';
import type { DrivingIntelligenceJob } from '@prisma/client';
import { TripDecisionSummaryService } from '../../trips/trip-decision-summary.service';

@Injectable()
export class DrivingDecisionSummaryComputeJobHandler {
  private readonly logger = new Logger(DrivingDecisionSummaryComputeJobHandler.name);

  constructor(private readonly decisionSummary: TripDecisionSummaryService) {}

  async handle(job: DrivingIntelligenceJob): Promise<void> {
    if (!job.tripId) {
      this.logger.warn(`DRIVING_DECISION_SUMMARY_COMPUTE missing tripId job=${job.id}`);
      return;
    }

    const summary = await this.decisionSummary.computeAndPersist({
      organizationId: job.organizationId,
      vehicleId: job.vehicleId,
      tripId: job.tripId,
      analysisRunId: job.analysisRunId,
    });

    this.logger.log(
      `DRIVING_DECISION_SUMMARY_COMPUTE completed trip=${job.tripId} recommendation=${summary.recommendation.level}`,
    );
  }
}
