import { Injectable, Logger } from '@nestjs/common';
import {
  BATTERY_V2_JOB_TYPES,
  type BatteryV2JobPayload,
  type BatteryV2JobType,
} from './battery-v2-job.types';
import type { BatteryV2JobHandler } from './battery-v2-job.handler';
import { BatteryObservationClassifyHandler } from './handlers/battery-observation-classify.handler';
import { BatteryRestTargetEvaluateHandler } from './handlers/battery-rest-target-evaluate.handler';
import { BatteryStartProxyExtractHandler } from './handlers/battery-start-proxy-extract.handler';
import { BatteryAssessmentRecomputeHandler } from './handlers/battery-assessment-recompute.handler';
import { BatteryPublicationUpdateHandler } from './handlers/battery-publication-update.handler';
import { HvCapabilityRefreshHandler } from './handlers/hv-capability-refresh.handler';
import { HvRechargeSessionReconcileHandler } from './handlers/hv-recharge-session-reconcile.handler';
import { HvCapacityShadowRecomputeHandler } from './handlers/hv-capacity-shadow-recompute.handler';

@Injectable()
export class BatteryV2JobHandlerRegistry {
  private readonly logger = new Logger(BatteryV2JobHandlerRegistry.name);
  private readonly registry = new Map<BatteryV2JobType, BatteryV2JobHandler>();

  constructor(
    observationClassify: BatteryObservationClassifyHandler,
    restTargetEvaluate: BatteryRestTargetEvaluateHandler,
    startProxyExtract: BatteryStartProxyExtractHandler,
    assessmentRecompute: BatteryAssessmentRecomputeHandler,
    publicationUpdate: BatteryPublicationUpdateHandler,
    hvCapabilityRefresh: HvCapabilityRefreshHandler,
    hvRechargeSessionReconcile: HvRechargeSessionReconcileHandler,
    hvCapacityShadowRecompute: HvCapacityShadowRecomputeHandler,
  ) {
    const handlers: BatteryV2JobHandler[] = [
      observationClassify,
      restTargetEvaluate,
      startProxyExtract,
      assessmentRecompute,
      publicationUpdate,
      hvCapabilityRefresh,
      hvRechargeSessionReconcile,
      hvCapacityShadowRecompute,
    ];

    for (const handler of handlers) {
      this.registry.set(handler.jobType, handler);
    }

    const missing = BATTERY_V2_JOB_TYPES.filter((type) => !this.registry.has(type));
    if (missing.length > 0) {
      throw new Error(`Battery V2 handler registry missing: ${missing.join(', ')}`);
    }
  }

  getHandler(jobType: BatteryV2JobType): BatteryV2JobHandler | undefined {
    return this.registry.get(jobType);
  }

  async dispatch<T extends BatteryV2JobType>(
    jobType: T,
    payload: BatteryV2JobPayload<T>,
  ): Promise<void> {
    const handler = this.registry.get(jobType);
    if (!handler) {
      throw new Error(`No Battery V2 handler registered for job type: ${jobType}`);
    }

    this.logger.debug(
      `Dispatching ${jobType} correlation=${payload.correlationId} attempt=${payload.attemptContext.attemptNumber}`,
    );
    await handler.handle(payload);
  }

  registeredJobTypes(): BatteryV2JobType[] {
    return [...this.registry.keys()];
  }
}
