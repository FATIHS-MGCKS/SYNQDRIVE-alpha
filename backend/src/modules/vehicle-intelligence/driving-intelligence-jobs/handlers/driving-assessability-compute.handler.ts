import { Injectable, Logger } from '@nestjs/common';
import type { DrivingIntelligenceJob } from '@prisma/client';
import { TripAssessabilityInputLoader } from '../../trip-assessability/trip-assessability-input.loader';
import { TripAssessabilityService } from '../../trip-assessability/trip-assessability.service';

@Injectable()
export class DrivingAssessabilityComputeJobHandler {
  private readonly logger = new Logger(DrivingAssessabilityComputeJobHandler.name);

  constructor(
    private readonly inputLoader: TripAssessabilityInputLoader,
    private readonly assessabilityService: TripAssessabilityService,
  ) {}

  async handle(job: DrivingIntelligenceJob): Promise<void> {
    if (!job.tripId) {
      this.logger.warn(`DRIVING_ASSESSABILITY_COMPUTE missing tripId job=${job.id}`);
      return;
    }

    const input = await this.inputLoader.loadForTrip(job.organizationId, job.tripId);
    const result = await this.assessabilityService.evaluateWithVehicleDetectorCapabilities(
      job.organizationId,
      job.vehicleId,
      job.tripId,
      input,
      job.analysisRunId,
    );

    this.logger.log(
      `DRIVING_ASSESSABILITY_COMPUTE completed trip=${job.tripId} dimensions=${result.result.dimensions.length}`,
    );
  }
}
