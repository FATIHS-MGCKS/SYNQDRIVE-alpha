import { Injectable } from '@nestjs/common';
import { HvRechargeSessionReconcileService } from '../../hv-charge-session/hv-recharge-session-reconcile.service';
import { BatteryV2ProviderError } from '../battery-v2-job.errors';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { HvRechargeSessionReconcilePayload } from '../battery-v2-job.types';
import {
  HvRechargeSessionReconcileTrigger,
  type HvRechargeSessionReconcileTrigger as HvRechargeSessionReconcileTriggerType,
} from '../../hv-charge-session/hv-recharge-session-reconcile.trigger';

function parseReconcileTrigger(
  value: string | null | undefined,
): HvRechargeSessionReconcileTriggerType {
  const triggers = Object.values(HvRechargeSessionReconcileTrigger);
  if (value && triggers.includes(value as HvRechargeSessionReconcileTriggerType)) {
    return value as HvRechargeSessionReconcileTriggerType;
  }
  return HvRechargeSessionReconcileTrigger.PERIODIC;
}

@Injectable()
export class HvRechargeSessionReconcileHandler
  implements BatteryV2JobHandler<'HV_RECHARGE_SESSION_RECONCILE'>
{
  readonly jobType = 'HV_RECHARGE_SESSION_RECONCILE' as const;

  constructor(private readonly reconcile: HvRechargeSessionReconcileService) {}

  async handle(payload: HvRechargeSessionReconcilePayload): Promise<void> {
    const result = await this.reconcile.reconcile({
      organizationId: payload.organizationId,
      vehicleId: payload.vehicleId,
      trigger: parseReconcileTrigger(payload.reconcileTrigger),
      segmentFingerprint: payload.segmentFingerprint,
      from: payload.windowFrom ? new Date(payload.windowFrom) : undefined,
      to: payload.windowTo ? new Date(payload.windowTo) : undefined,
      correlationId: payload.correlationId,
    });

    if (result.skipped && result.skipReason === 'segment_not_found') {
      throw new BatteryV2ProviderError(
        `Recharge segment not found vehicle=${payload.vehicleId} fingerprint=${payload.segmentFingerprint}`,
        { retryable: true, jobType: this.jobType },
      );
    }
  }
}
