import { Injectable, Logger, Optional } from '@nestjs/common';
import { isBatteryV2LongitudinalProfileMaterializationEnabled } from '@config/battery-health-v2.config';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { LongitudinalProfileMaterializationService } from './longitudinal-profile-materialization.service';
import {
  longitudinalProfileMaterializationMetricOutcome,
  recordLongitudinalProfileMaterializationObserved,
} from './longitudinal-profile-materialization.metrics';
import type { LongitudinalProfileMaterializationRequest } from './longitudinal-profile-materialization.types';
import type { LongitudinalProfileMaterializationRuntimeOutcome } from './longitudinal-profile-materialization.runtime.types';

/**
 * M3.3F F1 — gated D3 materialization orchestration (default OFF).
 * Application consumers must inject this facade, not the raw materialization service.
 */
@Injectable()
export class LongitudinalProfileMaterializationRuntimeService {
  private readonly logger = new Logger(LongitudinalProfileMaterializationRuntimeService.name);

  constructor(
    private readonly materializationService: LongitudinalProfileMaterializationService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  async materialize(
    request: LongitudinalProfileMaterializationRequest,
  ): Promise<LongitudinalProfileMaterializationRuntimeOutcome> {
    if (!isBatteryV2LongitudinalProfileMaterializationEnabled()) {
      return { status: 'SKIPPED_FLAG_OFF' };
    }

    const started = process.hrtime.bigint();
    try {
      const outcome = await this.materializationService.materialize(request);
      const durationSeconds =
        Number(process.hrtime.bigint() - started) / 1_000_000_000;
      recordLongitudinalProfileMaterializationObserved(this.metrics, {
        outcome: longitudinalProfileMaterializationMetricOutcome(outcome),
        durationSeconds,
      });
      this.logBoundedOutcome(request, outcome.outcome);
      return outcome;
    } catch (error) {
      const durationSeconds =
        Number(process.hrtime.bigint() - started) / 1_000_000_000;
      recordLongitudinalProfileMaterializationObserved(this.metrics, {
        outcome: 'ERROR',
        durationSeconds,
      });
      const errorClass = error instanceof Error ? error.constructor.name : 'UnknownError';
      this.logger.warn(
        `longitudinal_profile_materialization_error org=${request.organizationId} vehicle=${request.vehicleId} class=${errorClass}`,
      );
      throw error;
    }
  }

  private logBoundedOutcome(
    request: LongitudinalProfileMaterializationRequest,
    outcome: string,
  ): void {
    this.logger.log(
      `longitudinal_profile_materialization outcome=${outcome} org=${request.organizationId} vehicle=${request.vehicleId}`,
    );
  }
}
