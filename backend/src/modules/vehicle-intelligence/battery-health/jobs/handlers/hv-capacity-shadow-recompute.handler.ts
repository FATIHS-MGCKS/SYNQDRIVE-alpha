import { Injectable, Logger } from '@nestjs/common';
import { isBatteryV2HvCapacityShadowEnabled } from '@config/battery-health-v2.config';
import { HvCapacityShadowService } from '../../hv-capacity-shadow/hv-capacity-shadow.service';
import { BatteryV2ProviderError } from '../battery-v2-job.errors';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { HvCapacityShadowRecomputePayload } from '../battery-v2-job.types';

@Injectable()
export class HvCapacityShadowRecomputeHandler
  implements BatteryV2JobHandler<'HV_CAPACITY_SHADOW_RECOMPUTE'>
{
  readonly jobType = 'HV_CAPACITY_SHADOW_RECOMPUTE' as const;
  private readonly logger = new Logger(HvCapacityShadowRecomputeHandler.name);

  constructor(private readonly shadowService: HvCapacityShadowService) {}

  async handle(payload: HvCapacityShadowRecomputePayload): Promise<void> {
    if (!isBatteryV2HvCapacityShadowEnabled()) {
      this.logger.debug(
        `Battery V2 skipped (shadow disabled): ${this.jobType} vehicle=${payload.vehicleId}`,
      );
      return;
    }

    const chargeSessionId = payload.chargeSessionId;
    if (!chargeSessionId) {
      throw new BatteryV2ProviderError('HV capacity shadow job missing chargeSessionId', {
        retryable: false,
        jobType: this.jobType,
      });
    }

    const result = await this.shadowService.recomputeM2ForSession({
      organizationId: payload.organizationId,
      vehicleId: payload.vehicleId,
      chargeSessionId,
      correlationId: payload.correlationId,
    });

    this.logger.debug(
      `Battery V2 ${this.jobType} session=${chargeSessionId} persisted=${result.persistedCount} median=${result.sessionMedianKwh ?? 'n/a'}`,
    );
  }
}
