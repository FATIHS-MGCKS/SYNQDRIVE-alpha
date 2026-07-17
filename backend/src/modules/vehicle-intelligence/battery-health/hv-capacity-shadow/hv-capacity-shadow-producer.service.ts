import { Injectable, Logger } from '@nestjs/common';
import { isBatteryV2HvCapacityShadowEnabled } from '@config/battery-health-v2.config';
import { BatteryV2JobProducerService } from '../jobs/battery-v2-job-producer.service';
import { BatteryV2JobDeadLetterService } from '../jobs/battery-v2-job-dead-letter.service';
import { buildHvCapacityJobIdempotencyKey } from '../jobs/battery-v2-job-idempotency.policy';
import { HV_M2_CAPACITY_METHOD, HV_M2_MODEL_VERSION } from './hv-capacity-m2.types';
import type { HvChargeSession } from '@prisma/client';
import type {
  HvChargeSessionChangeKind,
  HvChargeSessionMetadata,
} from '../hv-charge-session/hv-charge-session.types';

export interface EnqueueHvCapacityShadowInput {
  organizationId: string;
  vehicleId: string;
  chargeSessionId: string;
  correlationId?: string;
  delayMs?: number;
}

@Injectable()
export class HvCapacityShadowProducerService {
  private readonly logger = new Logger(HvCapacityShadowProducerService.name);

  constructor(
    private readonly jobProducer: BatteryV2JobProducerService,
    private readonly deadLetters: BatteryV2JobDeadLetterService,
  ) {}

  async enqueueForSession(input: EnqueueHvCapacityShadowInput): Promise<string | null> {
    if (!isBatteryV2HvCapacityShadowEnabled()) return null;

    const idempotencyKey = buildHvCapacityJobIdempotencyKey({
      chargeSessionId: input.chargeSessionId,
      method: HV_M2_CAPACITY_METHOD,
      modelVersion: HV_M2_MODEL_VERSION,
    });

    if (
      await this.deadLetters.isDeadLetter('HV_CAPACITY_SHADOW_RECOMPUTE', idempotencyKey)
    ) {
      return null;
    }

    const jobId = await this.jobProducer.enqueue(
      'HV_CAPACITY_SHADOW_RECOMPUTE',
      {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        idempotencyKey,
        chargeSessionId: input.chargeSessionId,
        method: HV_M2_CAPACITY_METHOD,
        capacityModelVersion: HV_M2_MODEL_VERSION,
        correlationId:
          input.correlationId ??
          `hv-cap-shadow:m2:${input.chargeSessionId}`,
      },
      { delayMs: input.delayMs ?? 0 },
    );

    if (jobId) {
      this.logger.debug(
        `Enqueued HV_CAPACITY_SHADOW_RECOMPUTE session=${input.chargeSessionId}`,
      );
    }

    return jobId;
  }

  maybeEnqueueAfterSessionPersist(input: {
    organizationId: string;
    vehicleId: string;
    session: HvChargeSession;
    changeKind: HvChargeSessionChangeKind;
    correlationId?: string | null;
  }): Promise<string | null> {
    if (!this.shouldTrigger(input.session, input.changeKind)) {
      return Promise.resolve(null);
    }

    return this.enqueueForSession({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      chargeSessionId: input.session.id,
      correlationId:
        input.correlationId ?? `hv-cap-shadow:persist:${input.session.id}`,
      delayMs: 5_000,
    });
  }

  private shouldTrigger(
    session: HvChargeSession,
    changeKind: HvChargeSessionChangeKind,
  ): boolean {
    if (!isBatteryV2HvCapacityShadowEnabled()) return false;
    if (session.isOngoing) return false;

    const metadata = (session.metadata ?? {}) as unknown as HvChargeSessionMetadata;
    if (metadata.capacityShadowEligible !== true) return false;

    return (
      changeKind === 'created' ||
      changeKind === 'completed' ||
      changeKind === 'provider_refresh'
    );
  }
}
