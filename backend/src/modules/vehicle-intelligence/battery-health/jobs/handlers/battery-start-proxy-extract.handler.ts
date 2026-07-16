import { Injectable, Logger } from '@nestjs/common';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { BatteryStartProxyExtractPayload } from '../battery-v2-job.types';

@Injectable()
export class BatteryStartProxyExtractHandler
  implements BatteryV2JobHandler<'BATTERY_START_PROXY_EXTRACT'>
{
  readonly jobType = 'BATTERY_START_PROXY_EXTRACT' as const;
  private readonly logger = new Logger(BatteryStartProxyExtractHandler.name);

  async handle(payload: BatteryStartProxyExtractPayload): Promise<void> {
    this.logger.debug(
      `Battery V2 stub: ${this.jobType} org=${payload.organizationId} vehicle=${payload.vehicleId}`,
    );
  }
}
