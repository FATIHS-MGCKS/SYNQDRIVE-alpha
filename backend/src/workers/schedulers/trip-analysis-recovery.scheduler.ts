import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { TripEnrichmentOrchestratorService } from '../../modules/vehicle-intelligence/trips/trip-enrichment-orchestrator.service';

/**
 * Recovery scheduler for post-trip analysis stages left pending after process restarts.
 *
 * Primary path: misuse aggregation runs fire-and-forget after behavior enrichment.
 * If the worker restarts before misuse completes, trips can remain PARTIAL with
 * misuse=pending indefinitely. This scheduler re-triggers misuse evaluation.
 */
@Injectable()
export class TripAnalysisRecoveryScheduler implements OnModuleInit {
  private readonly logger = new Logger(TripAnalysisRecoveryScheduler.name);

  constructor(
    @Optional() private readonly orchestrator?: TripEnrichmentOrchestratorService,
  ) {}

  onModuleInit() {
    this.logger.log('Trip analysis recovery scheduler active');
    void this.recoverStuckMisuseStages();
  }

  @Interval(300_000)
  async recoverStuckMisuseStages(): Promise<void> {
    if (!this.orchestrator) return;
    try {
      const recovered = await this.orchestrator.recoverStuckMisuseStages(50);
      if (recovered > 0) {
        this.logger.warn(`Trip analysis recovery: re-scheduled misuse for ${recovered} trip(s)`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Trip analysis recovery failed: ${message}`);
    }
  }
}
