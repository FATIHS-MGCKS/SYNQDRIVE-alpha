import { Injectable, Logger } from '@nestjs/common';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { HvCapacityShadowRecomputePayload } from '../battery-v2-job.types';

@Injectable()
export class HvCapacityShadowRecomputeHandler
  implements BatteryV2JobHandler<'HV_CAPACITY_SHADOW_RECOMPUTE'>
{
  readonly jobType = 'HV_CAPACITY_SHADOW_RECOMPUTE' as const;
  private readonly logger = new Logger(HvCapacityShadowRecomputeHandler.name);

  async handle(payload: HvCapacityShadowRecomputePayload): Promise<void> {
    this.logger.debug(
      `Battery V2 stub: ${this.jobType} org=${payload.organizationId} vehicle=${payload.vehicleId}`,
    );
  }
}
