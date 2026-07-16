import { Injectable, Logger } from '@nestjs/common';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { HvRechargeSessionReconcilePayload } from '../battery-v2-job.types';

@Injectable()
export class HvRechargeSessionReconcileHandler
  implements BatteryV2JobHandler<'HV_RECHARGE_SESSION_RECONCILE'>
{
  readonly jobType = 'HV_RECHARGE_SESSION_RECONCILE' as const;
  private readonly logger = new Logger(HvRechargeSessionReconcileHandler.name);

  async handle(payload: HvRechargeSessionReconcilePayload): Promise<void> {
    this.logger.debug(
      `Battery V2 stub: ${this.jobType} org=${payload.organizationId} vehicle=${payload.vehicleId}`,
    );
  }
}
