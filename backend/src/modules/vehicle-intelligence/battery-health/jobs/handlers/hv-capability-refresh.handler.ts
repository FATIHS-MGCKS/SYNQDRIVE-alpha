import { Injectable, Logger } from '@nestjs/common';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { HvCapabilityRefreshPayload } from '../battery-v2-job.types';

@Injectable()
export class HvCapabilityRefreshHandler implements BatteryV2JobHandler<'HV_CAPABILITY_REFRESH'> {
  readonly jobType = 'HV_CAPABILITY_REFRESH' as const;
  private readonly logger = new Logger(HvCapabilityRefreshHandler.name);

  async handle(payload: HvCapabilityRefreshPayload): Promise<void> {
    this.logger.debug(
      `Battery V2 stub: ${this.jobType} org=${payload.organizationId} vehicle=${payload.vehicleId}`,
    );
  }
}
