import { Injectable, Logger } from '@nestjs/common';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { BatteryRestTargetEvaluatePayload } from '../battery-v2-job.types';

@Injectable()
export class BatteryRestTargetEvaluateHandler
  implements BatteryV2JobHandler<'BATTERY_REST_TARGET_EVALUATE'>
{
  readonly jobType = 'BATTERY_REST_TARGET_EVALUATE' as const;
  private readonly logger = new Logger(BatteryRestTargetEvaluateHandler.name);

  async handle(payload: BatteryRestTargetEvaluatePayload): Promise<void> {
    this.logger.debug(
      `Battery V2 stub: ${this.jobType} org=${payload.organizationId} vehicle=${payload.vehicleId}`,
    );
  }
}
