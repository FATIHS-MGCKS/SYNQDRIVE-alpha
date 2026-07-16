import { Injectable } from '@nestjs/common';
import { HvChargeSessionIngestService } from '../hv-charge-session/hv-charge-session-ingest.service';
import { BatteryV2ProviderError } from '../battery-v2-job.errors';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { HvRechargeSessionReconcilePayload } from '../battery-v2-job.types';

@Injectable()
export class HvRechargeSessionReconcileHandler
  implements BatteryV2JobHandler<'HV_RECHARGE_SESSION_RECONCILE'>
{
  readonly jobType = 'HV_RECHARGE_SESSION_RECONCILE' as const;

  constructor(private readonly ingest: HvChargeSessionIngestService) {}

  async handle(payload: HvRechargeSessionReconcilePayload): Promise<void> {
    const segmentFingerprint = payload.segmentFingerprint?.trim();
    if (!segmentFingerprint) {
      throw new BatteryV2ProviderError(
        'HV recharge session reconcile missing segmentFingerprint',
        { retryable: false, jobType: this.jobType },
      );
    }

    const result = await this.ingest.ingestSegmentByFingerprint({
      organizationId: payload.organizationId,
      vehicleId: payload.vehicleId,
      segmentFingerprint,
      correlationId: payload.correlationId,
    });

    if (!result) {
      throw new BatteryV2ProviderError(
        `Recharge segment not found for fingerprint=${segmentFingerprint}`,
        { retryable: true, jobType: this.jobType },
      );
    }
  }
}
