import { Injectable, Logger } from '@nestjs/common';
import { isBatteryV2RestShadowEnabled } from '@config/battery-health-v2.config';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { BatteryLvRestSessionOpenPayload } from '../battery-v2-job.types';
import { LvRestWindowSessionArmingService } from '../../lv-rest-window/lv-rest-window-session-arming.service';

/**
 * Consumes BATTERY_LV_REST_SESSION_OPEN — the observation-independent
 * LV_REST_WINDOW opener. Enqueued (a) by Trip Detection right after a trip is
 * persisted as COMPLETED and the vehicle transitions to RESTING, and (b) by
 * Battery V2 reconciliation when it detects a finalized trip whose canonical
 * rest session is missing. Both converge on the same canonical idempotent
 * operation, so replays, retries, and races cannot create duplicates.
 */
@Injectable()
export class BatteryLvRestSessionOpenHandler
  implements BatteryV2JobHandler<'BATTERY_LV_REST_SESSION_OPEN'>
{
  readonly jobType = 'BATTERY_LV_REST_SESSION_OPEN' as const;
  private readonly logger = new Logger(BatteryLvRestSessionOpenHandler.name);

  constructor(
    private readonly sessionArming: LvRestWindowSessionArmingService,
  ) {}

  async handle(payload: BatteryLvRestSessionOpenPayload): Promise<void> {
    if (!isBatteryV2RestShadowEnabled()) {
      this.logger.debug(
        `LV rest session open skipped (shadow disabled): vehicle=${payload.vehicleId} trip=${payload.tripId}`,
      );
      return;
    }

    const result = await this.sessionArming.ensureLvRestWindowForFinalizedTrip({
      organizationId: payload.organizationId,
      vehicleId: payload.vehicleId,
      tripId: payload.tripId,
    });

    // not_eligible/already_exists complete without error: eligibility is
    // policy-adjudicated state, not a transient fault. Reconciliation
    // re-detects genuinely missing sessions while the condition persists.
    // Infrastructure errors propagate and use the BullMQ retry policy.
    this.logger.log(
      `LV rest session open handled: vehicle=${payload.vehicleId} trip=${payload.tripId} ` +
        `outcome=${result.outcome} reason=${result.reason}` +
        (result.sessionId ? ` session=${result.sessionId}` : ''),
    );
  }
}
