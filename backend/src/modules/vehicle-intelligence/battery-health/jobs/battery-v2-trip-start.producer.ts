import { Injectable } from '@nestjs/common';
import {
  getBatteryV2StartProxyDelayMs,
  isStartWindowCollectionEnabled,
} from '../../../../config/battery-health-v2.config';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { BATTERY_V2_JOB_MODEL_VERSION_DEFAULT } from './battery-v2-job.types';
import { buildStartProxyJobIdempotencyKey } from './battery-v2-job-idempotency.policy';
import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';

@Injectable()
export class BatteryV2TripStartProducer {
  constructor(
    private readonly jobProducer: BatteryV2JobProducerService,
    private readonly policyProfiles: BatteryPolicyProfileService,
  ) {}

  isStartProxyEnabled(): boolean {
    return isStartWindowCollectionEnabled();
  }

  async canEnqueueForVehicle(vehicleId: string): Promise<boolean> {
    const policy = await this.policyProfiles.resolveForVehicle(vehicleId);
    return policy.startProxyAllowed;
  }

  async enqueueStartProxy(input: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    tripStartedAt: Date;
  }): Promise<string | null> {
    if (!this.isStartProxyEnabled()) {
      return null;
    }

    if (!(await this.canEnqueueForVehicle(input.vehicleId))) {
      return null;
    }

    return this.jobProducer.enqueue(
      'BATTERY_START_PROXY_EXTRACT',
      {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tripId: input.tripId,
        tripStartedAt: input.tripStartedAt.toISOString(),
        idempotencyKey: buildStartProxyJobIdempotencyKey({
          tripId: input.tripId,
          modelVersion: BATTERY_V2_JOB_MODEL_VERSION_DEFAULT,
        }),
        sourceEntityId: input.tripId,
      },
      { delayMs: getBatteryV2StartProxyDelayMs() },
    );
  }
}
