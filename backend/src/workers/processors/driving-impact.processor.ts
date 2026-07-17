import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../queues/queue-names';
import { DrivingImpactService } from '../../modules/vehicle-intelligence/driving-impact/driving-impact.service';
import { TripEnrichmentOrchestratorService } from '../../modules/vehicle-intelligence/trips/trip-enrichment-orchestrator.service';
import { BrakeHealthService } from '../../modules/vehicle-intelligence/brakes/brake-health.service';
import { TripDrivingImpactAnalysisStatus } from '@prisma/client';

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

    try {
      const outcome = await this.drivingImpactService.computeForTrip(tripId, vehicleId);

      if (outcome.processed && outcome.action !== 'skipped') {
        const skipped =
          outcome.analysisStatus === TripDrivingImpactAnalysisStatus.UNSUPPORTED ||
          outcome.analysisStatus === TripDrivingImpactAnalysisStatus.FAILED;
        await this.orchestrator.markDrivingImpactComputed(tripId, skipped);
        this.logger.log(
          `DrivingImpact compute ${outcome.action}: trip=${tripId} status=${outcome.analysisStatus}`,
        );
      } else {
        this.logger.debug(
          `DrivingImpact compute skipped: trip=${tripId} reason=${outcome.skipReason ?? 'unknown'}`,
        );
        await this.orchestrator.markDrivingImpactComputed(tripId, true);
      }

      if (outcome.shouldRecalculateBrake) {
        try {
          await this.brakeHealthService.recalculate(vehicleId);
        } catch (err: any) {
          this.logger.warn(
            `Brake health refresh after driving-impact failed: vehicle=${vehicleId} ${err?.message ?? 'unknown error'}`,
          );
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`DrivingImpact compute failed: trip=${tripId} ${message}`);
      await this.orchestrator.markDrivingImpactComputed(tripId, true);
    }
  }
}
