import { Injectable, Logger } from '@nestjs/common';
import type { DrivingIntelligenceJob } from '@prisma/client';
import { RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS } from './rental-driving-analysis.recompute.types';
import { RentalDrivingAnalysisService } from './rental-driving-analysis.service';

function parseRecomputeReason(
  correlationId: string,
): (typeof RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS)[keyof typeof RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS] {
  const match = correlationId.match(/rental-recompute:[^:]+:(.+)$/);
  const reason = match?.[1];
  const values = Object.values(RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS);
  if (reason && values.includes(reason as (typeof values)[number])) {
    return reason as (typeof values)[number];
  }
  return RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.INPUT_OR_MODEL_CHANGED;
}

@Injectable()
export class RentalDrivingAnalysisRecomputeJobHandler {
  private readonly logger = new Logger(RentalDrivingAnalysisRecomputeJobHandler.name);

  constructor(private readonly rentalAnalysis: RentalDrivingAnalysisService) {}

  async handle(job: DrivingIntelligenceJob): Promise<void> {
    if (!job.bookingId) {
      throw new Error(`RENTAL_DRIVING_ANALYSIS_RECOMPUTE requires bookingId (job=${job.id})`);
    }

    const result = await this.rentalAnalysis.recomputeForBooking(
      job.organizationId,
      job.bookingId,
      {
        recomputeReason: parseRecomputeReason(job.correlationId),
        jobId: job.id,
      },
    );

    this.logger.debug(
      `RENTAL_DRIVING_ANALYSIS_RECOMPUTE job=${job.id} booking=${job.bookingId} status=${result.status}`,
    );
  }
}
