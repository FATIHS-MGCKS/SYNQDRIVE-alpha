import { Injectable, Logger } from '@nestjs/common';
import type { DrivingIntelligenceJob } from '@prisma/client';
import { DrivingImpactService } from '../../driving-impact/driving-impact.service';
import { TripEnrichmentOrchestratorService } from '../../trips/trip-enrichment-orchestrator.service';

@Injectable()
export class DrivingImpactComputeJobHandler {
  private readonly logger = new Logger(DrivingImpactComputeJobHandler.name);

  constructor(
    private readonly drivingImpactService: DrivingImpactService,
    private readonly orchestrator: TripEnrichmentOrchestratorService,
  ) {}

  async handle(job: DrivingIntelligenceJob): Promise<void> {
    if (!job.tripId) {
      this.logger.warn(`DRIVING_IMPACT_COMPUTE missing tripId job=${job.id}`);
      return;
    }

    const processed = await this.drivingImpactService.computeForTrip(job.tripId, job.vehicleId);
    await this.orchestrator.markDrivingImpactComputed(job.tripId, !processed);
    this.logger.log(
      `DRIVING_IMPACT_COMPUTE completed trip=${job.tripId} processed=${processed}`,
    );
  }
}
