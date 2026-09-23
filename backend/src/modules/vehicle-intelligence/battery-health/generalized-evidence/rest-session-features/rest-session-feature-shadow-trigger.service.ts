import { Injectable, Logger } from '@nestjs/common';
import { isBatteryV2RestSessionFeaturesShadowEnabled } from '@config/battery-health-v2.config';
import { RestSessionFeatureComputationService } from './rest-session-feature-computation.service';
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
  ) {}

  async triggerFeatureComputation(
    input: RestSessionFeatureShadowTriggerInput,
  ): Promise<RestSessionFeatureShadowTriggerOutcome> {
    if (!isBatteryV2RestSessionFeaturesShadowEnabled()) {
      return { status: 'SKIPPED_FLAG_OFF' };
    }

    try {
      const outcome = await this.featureComputation.computeAndPersist({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        restSessionId: input.restSessionId,
      });

      if (outcome.status === 'SKIPPED_FLAG_OFF') {
        return { status: 'SKIPPED_FLAG_OFF' };
      }
      if (outcome.status === 'SESSION_NOT_FOUND') {
        this.logTrigger(input, 'SESSION_NOT_FOUND');
        return { status: 'SESSION_NOT_FOUND' };
      }
      if (outcome.status === 'DUPLICATE_EXISTING') {
        this.logTrigger(input, 'DUPLICATE_EXISTING');
        return { status: 'DUPLICATE_EXISTING' };
      }
      this.logTrigger(input, 'CREATED');
      return { status: 'CREATED' };
    } catch (error) {
      const errorClass = error instanceof Error ? error.constructor.name : 'UnknownError';
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `rest-session feature shadow trigger isolated failure reason=${input.reason} vehicleId=${input.vehicleId} restSessionId=${input.restSessionId} errorClass=${errorClass} errorMessage=${errorMessage}`,
      );
      return { status: 'FAILED_ISOLATED', errorClass, errorMessage };
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
