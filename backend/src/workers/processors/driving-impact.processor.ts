import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../queues/queue-names';
import { DrivingImpactService } from '../../modules/vehicle-intelligence/driving-impact/driving-impact.service';
import { TripEnrichmentOrchestratorService } from '../../modules/vehicle-intelligence/trips/trip-enrichment-orchestrator.service';
import { BrakeRecalculationOrchestratorService } from '../../modules/vehicle-intelligence/brakes/brake-recalculation-orchestrator.service';
import { BrakeHealthObservabilityService } from '../../modules/vehicle-intelligence/brakes/brake-health-observability.service';
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
    private readonly brakeRecalcOrchestrator: BrakeRecalculationOrchestratorService,
    @Optional() private readonly observability?: BrakeHealthObservabilityService,
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
        this.observability?.recordTdiProcessing({
          status: skipped ? 'skipped' : 'completed',
          reasonCode: outcome.analysisStatus,
        });
        this.logger.log(
          `DrivingImpact compute ${outcome.action}: trip=${tripId} status=${outcome.analysisStatus}`,
        );
      } else {
        this.logger.debug(
          `DrivingImpact compute skipped: trip=${tripId} reason=${outcome.skipReason ?? 'unknown'}`,
        );
        this.observability?.recordTdiProcessing({
          status: 'skipped',
          reasonCode: outcome.skipReason ?? 'not_processed',
        });
        await this.orchestrator.markDrivingImpactComputed(tripId, true);
      }

      if (outcome.shouldRecalculateBrake) {
        try {
          await this.brakeRecalcOrchestrator.enqueue({
            vehicleId,
            organizationId: job.data.organizationId,
            trigger: 'post_trip',
          });
        } catch (err: any) {
          this.logger.warn(
            `Brake health refresh after driving-impact failed: vehicle=${vehicleId} ${err?.message ?? 'unknown error'}`,
          );
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`DrivingImpact compute failed: trip=${tripId} ${message}`);
      this.observability?.recordTdiProcessing({ status: 'failed', reasonCode: message });
      await this.orchestrator.markDrivingImpactComputed(tripId, true);
    }
  }
}
