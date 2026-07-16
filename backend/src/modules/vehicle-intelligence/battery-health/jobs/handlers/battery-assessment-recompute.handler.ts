import { Injectable, Logger } from '@nestjs/common';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { BatteryAssessmentRecomputePayload } from '../battery-v2-job.types';

@Injectable()
export class BatteryAssessmentRecomputeHandler
  implements BatteryV2JobHandler<'BATTERY_ASSESSMENT_RECOMPUTE'>
{
  readonly jobType = 'BATTERY_ASSESSMENT_RECOMPUTE' as const;
  private readonly logger = new Logger(BatteryAssessmentRecomputeHandler.name);

  async handle(payload: BatteryAssessmentRecomputePayload): Promise<void> {
    this.logger.debug(
      `Battery V2 stub: ${this.jobType} org=${payload.organizationId} vehicle=${payload.vehicleId}`,
    );
  }
}
