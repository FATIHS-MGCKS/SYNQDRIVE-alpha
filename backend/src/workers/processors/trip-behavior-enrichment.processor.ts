import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../queues/queue-names';
import { TripEnrichmentOrchestratorService } from '../../modules/vehicle-intelligence/trips/trip-enrichment-orchestrator.service';
import { TripMetricsService } from '../../modules/observability/trip-metrics.service';
import { observeQueueLag } from '../../modules/observability/queue-lag.util';

export interface TripBehaviorEnrichmentJobData {
  tripId: string;
  vehicleId: string;
  organizationId: string | null;
  requestedAt: string;
}

/**
 * TripBehaviorEnrichmentProcessor
 *
 * Thin BullMQ worker that delegates entirely to TripEnrichmentOrchestratorService.
 * The orchestrator owns all status tracking, logging, and chaining to DrivingImpact.
 * Both this processor and the manual HTTP endpoint call the same orchestrator method,
 * ensuring a single canonical enrichment flow.
 */
@Processor(QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT)
@Injectable()
export class TripBehaviorEnrichmentProcessor extends WorkerHost {
  private readonly logger = new Logger(TripBehaviorEnrichmentProcessor.name);

  constructor(
    private readonly orchestrator: TripEnrichmentOrchestratorService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {
    super();
  }

  async process(job: Job<TripBehaviorEnrichmentJobData>): Promise<void> {
    observeQueueLag(this.tripMetrics, QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT, job);
    const { tripId, vehicleId, organizationId } = job.data;

    this.logger.log(`HF enrichment job started: trip=${tripId} vehicle=${vehicleId} attempt=${job.attemptsMade + 1}`);

    // Delegate to canonical orchestrator — handles status, logging, and DrivingImpact chaining
    await this.orchestrator.runEnrichmentSync(tripId, vehicleId, organizationId);
  }
}
