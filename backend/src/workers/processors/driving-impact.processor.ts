import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../queues/queue-names';
import { DrivingImpactService } from '../../modules/vehicle-intelligence/driving-impact/driving-impact.service';
import { TripEnrichmentOrchestratorService } from '../../modules/vehicle-intelligence/trips/trip-enrichment-orchestrator.service';
import { BrakeHealthService } from '../../modules/vehicle-intelligence/brakes/brake-health.service';

export interface DrivingImpactJobData {
  tripId: string;
  vehicleId: string;
  organizationId: string | null;
  requestedAt: string;
}

@Processor(QUEUE_NAMES.DRIVING_IMPACT_COMPUTE)
@Injectable()
export class DrivingImpactProcessor extends WorkerHost {
  private readonly logger = new Logger(DrivingImpactProcessor.name);

  constructor(
    private readonly drivingImpactService: DrivingImpactService,
    private readonly orchestrator: TripEnrichmentOrchestratorService,
    private readonly brakeHealthService: BrakeHealthService,
  ) {
    super();
  }

  async process(job: Job<DrivingImpactJobData>): Promise<void> {
    const { tripId, vehicleId } = job.data;

    this.logger.log(`DrivingImpact compute started: trip=${tripId} vehicle=${vehicleId}`);

    const processed = await this.drivingImpactService.computeForTrip(tripId, vehicleId);

    if (processed) {
      this.logger.log(`DrivingImpact compute complete: trip=${tripId}`);
      // Record that driving impact has been computed for this trip
      await this.orchestrator.markDrivingImpactComputed(tripId);
      // Keep brake-health estimates fresher than hourly scheduler cycles.
      try {
        await this.brakeHealthService.recalculate(vehicleId);
      } catch (err: any) {
        this.logger.warn(
          `Brake health refresh after driving-impact failed: vehicle=${vehicleId} ${err?.message ?? 'unknown error'}`,
        );
      }
    } else {
      this.logger.debug(`DrivingImpact compute skipped: trip=${tripId} (below threshold or missing data)`);
    }
  }
}
