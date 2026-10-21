import { Injectable, Logger, Optional } from '@nestjs/common';
import { BatteryRestSessionFeatureComputationPhase, BatteryRestSessionFeatureSessionTrust } from '@prisma/client';
import { isBatteryV2RestSessionFeaturesShadowEnabled } from '@config/battery-health-v2.config';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { RestSessionFeatureComputationService } from './rest-session-feature-computation.service';
import {
  recordRestSessionFeatureRowCreated,
  recordRestSessionFeatureTriggerObserved,
} from './rest-session-feature.metrics';
import type {
  RestSessionFeatureShadowTriggerInput,
  RestSessionFeatureShadowTriggerOutcome,
} from './rest-session-feature-shadow-trigger.types';

/**
 * M3.3C C4 — post-mutation shadow feature orchestration (fail-open, flag gated).
 */
@Injectable()
export class RestSessionFeatureShadowTriggerService {
  private readonly logger = new Logger(RestSessionFeatureShadowTriggerService.name);

  constructor(
    private readonly featureComputation: RestSessionFeatureComputationService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  async triggerFeatureComputation(
    input: RestSessionFeatureShadowTriggerInput,
  ): Promise<RestSessionFeatureShadowTriggerOutcome> {
    const started = process.hrtime.bigint();
    let outcome: RestSessionFeatureShadowTriggerOutcome = {
      status: 'FAILED_ISOLATED',
      errorClass: 'UnknownError',
      errorMessage: 'uninitialized',
    };

    try {
      if (!isBatteryV2RestSessionFeaturesShadowEnabled()) {
        outcome = { status: 'SKIPPED_FLAG_OFF' };
        return outcome;
      }

      const computation = await this.featureComputation.computeAndPersist({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        restSessionId: input.restSessionId,
      });

      if (computation.status === 'SKIPPED_FLAG_OFF') {
        outcome = { status: 'SKIPPED_FLAG_OFF' };
        return outcome;
      }
      if (computation.status === 'SESSION_NOT_FOUND') {
        outcome = { status: 'SESSION_NOT_FOUND' };
        this.logTrigger(input, outcome.status);
        return outcome;
      }
      if (computation.status === 'DUPLICATE_EXISTING') {
        outcome = { status: 'DUPLICATE_EXISTING' };
        this.logTrigger(input, outcome.status);
        return outcome;
      }

      outcome = { status: 'CREATED' };
      this.logTrigger(input, outcome.status);
      recordRestSessionFeatureRowCreated(this.metrics, {
        phase:
          computation.row.computationPhase === BatteryRestSessionFeatureComputationPhase.INCREMENTAL
            ? 'INCREMENTAL'
            : 'FINAL',
        trust:
          computation.row.sessionTrust === BatteryRestSessionFeatureSessionTrust.INVALIDATED
            ? 'INVALIDATED'
            : 'VALID',
      });
      return outcome;
    } catch (error) {
      const errorClass = error instanceof Error ? error.constructor.name : 'UnknownError';
      const errorMessage = error instanceof Error ? error.message : String(error);
      outcome = { status: 'FAILED_ISOLATED', errorClass, errorMessage };
      this.logger.warn(
        `rest-session feature shadow trigger isolated failure reason=${input.reason} vehicleId=${input.vehicleId} restSessionId=${input.restSessionId} errorClass=${errorClass} errorMessage=${errorMessage}`,
      );
      return outcome;
    } finally {
      const durationSeconds = Number(process.hrtime.bigint() - started) / 1e9;
      recordRestSessionFeatureTriggerObserved(this.metrics, {
        reason: input.reason,
        outcome: outcome.status,
        durationSeconds,
      });
    }
  }

  private logTrigger(
    input: RestSessionFeatureShadowTriggerInput,
    status: RestSessionFeatureShadowTriggerOutcome['status'],
  ): void {
    const sub =
      input.terminalSubcontext != null ? ` terminalSubcontext=${input.terminalSubcontext}` : '';
    this.logger.debug(
      `rest-session feature shadow trigger reason=${input.reason}${sub} vehicleId=${input.vehicleId} restSessionId=${input.restSessionId} status=${status}`,
    );
  }
}
