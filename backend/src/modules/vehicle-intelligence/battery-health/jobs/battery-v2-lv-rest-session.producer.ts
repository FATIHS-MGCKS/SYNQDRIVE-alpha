import { Injectable } from '@nestjs/common';
import { isBatteryV2RestShadowEnabled } from '../../../../config/battery-health-v2.config';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { isLvRestWindowPolicySupported } from '../lv-rest-window/lv-rest-window.policy';
import { buildLvRestSessionOpenJobIdempotencyKey } from './battery-v2-job-idempotency.policy';
import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';

/**
 * Enqueues the durable BATTERY_LV_REST_SESSION_OPEN job for a persisted
 * COMPLETED trip. Used by the Trip Detection finalize path (primary) and by
 * Battery V2 reconciliation (recovery); both produce the identical
 * deterministic job identity `lv-rest-open:{vehicleId}:{anchorMs}`, so the
 * BullMQ job-id boundary deduplicates racing producers.
 */
@Injectable()
export class BatteryV2LvRestSessionProducer {
  constructor(
    private readonly jobProducer: BatteryV2JobProducerService,
    private readonly policyProfiles: BatteryPolicyProfileService,
  ) {}

  async canEnqueueForVehicle(vehicleId: string): Promise<boolean> {
    const policy = await this.policyProfiles.resolveForVehicle(vehicleId);
    return isLvRestWindowPolicySupported(policy);
  }

  async enqueueSessionOpenForFinalizedTrip(input: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    tripEndedAt: Date;
    correlationId?: string;
  }): Promise<string | null> {
    if (!isBatteryV2RestShadowEnabled()) {
      return null;
    }

    if (!(await this.canEnqueueForVehicle(input.vehicleId))) {
      return null;
    }

    return this.jobProducer.enqueue(
      'BATTERY_LV_REST_SESSION_OPEN',
      {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tripId: input.tripId,
        tripEndedAt: input.tripEndedAt.toISOString(),
        idempotencyKey: buildLvRestSessionOpenJobIdempotencyKey({
          vehicleId: input.vehicleId,
          anchorAt: input.tripEndedAt,
        }),
        sourceEntityId: input.tripId,
        correlationId: input.correlationId,
      },
    );
  }
}
