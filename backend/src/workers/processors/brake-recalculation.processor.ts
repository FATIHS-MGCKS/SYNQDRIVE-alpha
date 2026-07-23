import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '@shared/database/prisma.service';
import { VehicleHealthEnforcementService } from '@modules/data-authorizations/vehicle-health-enforcement/vehicle-health-enforcement.service';
import {
  VEHICLE_HEALTH_DATA_CATEGORY,
  VEHICLE_HEALTH_OBSERVATION_SOURCE,
  VEHICLE_HEALTH_PATH,
  VEHICLE_HEALTH_PURPOSE,
  VEHICLE_HEALTH_SERVICE_IDENTITY,
} from '@modules/data-authorizations/vehicle-health-enforcement/vehicle-health-enforcement.constants';
import { QUEUE_NAMES } from '../queues/queue-names';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { observeQueueLag } from '@modules/observability/queue-lag.util';
import {
  BrakeRecalculationOrchestratorService,
  type BrakeRecalculationJobData,
} from '../../modules/vehicle-intelligence/brakes/brake-recalculation-orchestrator.service';

@Injectable()
@Processor(QUEUE_NAMES.BRAKE_RECALCULATION, {
  lockDuration: 120_000,
  concurrency: 2,
})
export class BrakeRecalculationProcessor extends WorkerHost {
  private readonly logger = new Logger(BrakeRecalculationProcessor.name);

  constructor(
    private readonly orchestrator: BrakeRecalculationOrchestratorService,
    private readonly tripMetrics: TripMetricsService,
    private readonly prisma: PrismaService,
    @Optional() private readonly healthEnforcement?: VehicleHealthEnforcementService,
  ) {
    super();
  }

  async process(job: Job<BrakeRecalculationJobData>) {
    observeQueueLag(this.tripMetrics, QUEUE_NAMES.BRAKE_RECALCULATION, job);
    const { vehicleId, trigger } = job.data;
    if (!vehicleId) {
      this.logger.warn('Missing vehicleId in brake recalculation job');
      return;
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (vehicle?.organizationId && this.healthEnforcement) {
      const mayDerive = await this.healthEnforcement.mayDerive({
        organizationId: vehicle.organizationId,
        vehicleId,
        dataCategory: VEHICLE_HEALTH_DATA_CATEGORY.HEALTH_SIGNALS,
        purpose: VEHICLE_HEALTH_PURPOSE.VEHICLE_HEALTH,
        processingPath: VEHICLE_HEALTH_PATH.BRAKE_DERIVE,
        serviceIdentity: VEHICLE_HEALTH_SERVICE_IDENTITY.BRAKE_WORKER,
        correlationId: `brake-derive:${vehicleId}:${job.id}`,
        observationSource: VEHICLE_HEALTH_OBSERVATION_SOURCE.TELEMETRY,
        effectiveTimestamp: job.data.requestedAt ?? null,
      });
      if (!mayDerive) {
        this.logger.warn(`Brake derive denied vehicle=${vehicleId} trigger=${trigger}`);
        return;
      }
    }

    this.logger.debug(`Brake recalc job start: vehicle=${vehicleId} trigger=${trigger}`);
    await this.orchestrator.executeWithLock(job.data);
  }
}
