import { Injectable, Logger } from '@nestjs/common';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { BatteryPublicationUpdatePayload } from '../battery-v2-job.types';

@Injectable()
export class BatteryPublicationUpdateHandler
  implements BatteryV2JobHandler<'BATTERY_PUBLICATION_UPDATE'>
{
  readonly jobType = 'BATTERY_PUBLICATION_UPDATE' as const;
  private readonly logger = new Logger(BatteryPublicationUpdateHandler.name);

  async handle(payload: BatteryPublicationUpdatePayload): Promise<void> {
    this.logger.debug(
      `Battery V2 stub: ${this.jobType} org=${payload.organizationId} vehicle=${payload.vehicleId}`,
    );
  }
}
