import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import type { DrivingIntelligenceJob } from '@prisma/client';
import { MisuseCaseReconcileService } from './misuse-case-reconcile.service';
import { inferMisuseReconcileTrigger } from './misuse-case-reconcile.trigger';
import { RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS } from '../../../rental-driving-analysis/rental-driving-analysis.recompute.types';
import {
  RENTAL_DRIVING_ANALYSIS_RECOMPUTE_TRIGGER_PORT,
  type RentalDrivingAnalysisRecomputeTriggerPort,
} from '../../ports/rental-driving-analysis-recompute-trigger.port';

@Injectable()
export class DrivingMisuseReconcileJobHandler {
  private readonly logger = new Logger(DrivingMisuseReconcileJobHandler.name);

  constructor(
    private readonly reconcile: MisuseCaseReconcileService,
    @Optional()
    @Inject(RENTAL_DRIVING_ANALYSIS_RECOMPUTE_TRIGGER_PORT)
    private readonly rentalRecomputeTrigger?: RentalDrivingAnalysisRecomputeTriggerPort,
  ) {}

  async handle(job: DrivingIntelligenceJob): Promise<void> {
    if (!job.tripId) {
      throw new Error(`DRIVING_MISUSE_RECONCILE requires tripId (job=${job.id})`);
    }

    const trigger = inferMisuseReconcileTrigger(job);
    const result = await this.reconcile.reconcileTrip({
      organizationId: job.organizationId,
      vehicleId: job.vehicleId,
      tripId: job.tripId,
      analysisRunId: job.analysisRunId,
      trigger,
    });

    this.logger.debug(
      `DRIVING_MISUSE_RECONCILE completed job=${job.id} trip=${job.tripId} ` +
        `upserted=${result.upserted} resolved=${result.resolved}`,
    );

    if (job.bookingId) {
      await this.rentalRecomputeTrigger?.enqueueForBooking({
        organizationId: job.organizationId,
        vehicleId: job.vehicleId,
        bookingId: job.bookingId,
        tripId: job.tripId,
        reason: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.MISUSE_RECONCILED,
        correlationId: `rental-recompute:${job.bookingId}:${RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.MISUSE_RECONCILED}`,
      });
    }
  }
}
