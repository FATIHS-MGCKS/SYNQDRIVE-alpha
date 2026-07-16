import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queues/queue-names';
import { TireHealthService } from '@modules/vehicle-intelligence/tires/tire-health.service';
import { TireHealthObservabilityService } from '@modules/vehicle-intelligence/tires/tire-health-observability.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { observeQueueLag } from '@modules/observability/queue-lag.util';

@Injectable()
@Processor(QUEUE_NAMES.TIRE_RECALCULATION, {
  lockDuration: 120_000,
  concurrency: 2,
})
export class TireRecalculationProcessor extends WorkerHost {
  private readonly logger = new Logger(TireRecalculationProcessor.name);

  constructor(
    private readonly tireHealthService: TireHealthService,
    private readonly tripMetrics: TripMetricsService,
    @Optional() private readonly observability?: TireHealthObservabilityService,
  ) {
    super();
  }

  async process(job: Job<{ vehicleId?: string }>) {
    observeQueueLag(this.tripMetrics, QUEUE_NAMES.TIRE_RECALCULATION, job);
    const { vehicleId } = job.data;
    if (!vehicleId) {
      this.logger.warn('Missing vehicleId in tire recalculation job');
      return;
    }

    const startedAt = Date.now();
    try {
      const result = await this.tireHealthService.recalculate(vehicleId);
      if (result?.skipped) {
        this.observability?.recordRecalculation({
          result: 'deduplicated',
          durationMs: Date.now() - startedAt,
          skipReason: result.skipReason ?? 'identical_input_fingerprint',
        });
        return;
      }
      if (result) {
        this.logger.debug(
          `Tire health recalculated: ${result.overallPercent}% (${result.healthStatus})`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.observability?.recordRecalculation({
        result: 'failed',
        durationMs: Date.now() - startedAt,
        errorCode: 'recalculation_error',
      });
      this.logger.error(`Tire recalculation failed: ${message}`);
      throw err;
    }
  }
}
