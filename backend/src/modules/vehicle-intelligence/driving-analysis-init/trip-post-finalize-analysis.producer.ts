import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { DrivingAnalysisInitService } from './driving-analysis-init.service';
import type { TripAnalysisInitResult, TripAnalysisInitSource } from './driving-analysis-init.types';
import { RentalDrivingAnalysisRecomputeTriggerService } from '../../rental-driving-analysis/rental-driving-analysis-recompute.trigger';
import { RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS } from '../../rental-driving-analysis/rental-driving-analysis.recompute.types';

/**
 * Post-finalize producer — awaited durable analysis init only after persisted COMPLETED trip.
 * Legacy enrichment queues remain separate until fully replaced.
 */
@Injectable()
export class TripPostFinalizeAnalysisProducer {
  private readonly logger = new Logger(TripPostFinalizeAnalysisProducer.name);

  constructor(
    private readonly analysisInit: DrivingAnalysisInitService,
    @Optional()
    @Inject(forwardRef(() => RentalDrivingAnalysisRecomputeTriggerService))
    private readonly rentalRecomputeTrigger?: RentalDrivingAnalysisRecomputeTriggerService,
  ) {}

  async produceAfterPersistedCompletion(input: {
    tripId: string;
    vehicleId: string;
    organizationId: string | null;
    source: TripAnalysisInitSource;
  }): Promise<TripAnalysisInitResult | null> {
    if (!input.organizationId) {
      this.logger.warn(
        `Skip durable analysis init — missing organizationId for trip ${input.tripId}`,
      );
      return null;
    }

    try {
      const result = await this.analysisInit.initializeForCompletedTrip({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tripId: input.tripId,
        source: input.source,
      });

      if (result.queueErrors.length > 0) {
        this.logger.warn(
          `Durable analysis init queue errors trip=${input.tripId} source=${input.source}: ` +
            result.queueErrors.join('; '),
        );
      }

      void this.rentalRecomputeTrigger
        ?.enqueueForTrip({
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          tripId: input.tripId,
          reason: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.TRIP_COMPLETED,
          correlationId: `rental-recompute:trip:${input.tripId}:${RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.TRIP_COMPLETED}`,
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Rental analysis recompute enqueue failed trip=${input.tripId}: ${message}`,
          );
        });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Durable analysis init failed trip=${input.tripId} source=${input.source}: ${message}`,
      );
      return {
        runId: 'unknown',
        runCreated: false,
        runDeduplicated: false,
        jobs: [],
        queueErrors: [message],
      };
    }
  }
}
