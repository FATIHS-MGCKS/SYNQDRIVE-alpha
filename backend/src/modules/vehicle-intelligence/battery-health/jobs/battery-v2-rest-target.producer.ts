import { Injectable } from '@nestjs/common';
import {
  computeBatteryRestTargetDelayMs,
  getBatteryRest60mDelayMs,
} from '../../../../config/battery-health-v2.config';
import {
  buildBatteryRestTargetJobIdempotencyKey,
  targetSuffixForRestType,
} from './battery-v2-job-idempotency.policy';
import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';
import {
  LV_REST_TARGET_JOB_STATUS,
  LV_REST_TARGET_TYPES,
  type LvRestTargetType,
} from '../lv-rest-window/lv-rest-window-target.metadata';

export interface ScheduleLvRestTargetJobInput {
  organizationId: string;
  vehicleId: string;
  sessionId: string;
  restWindowId: string;
  restWindowStartedAt: Date;
  restTargetType: Extract<LvRestTargetType, 'REST_60M' | 'REST_6H'>;
  now?: Date;
}

export interface ScheduleLvRestTargetJobResult {
  scheduled: boolean;
  skipped: boolean;
  skipReason?: string;
  idempotencyKey: string;
  scheduledFor: Date;
  delayMs: number;
  bullJobId: string | null;
}

@Injectable()
export class BatteryV2RestTargetProducer {
  constructor(private readonly jobProducer: BatteryV2JobProducerService) {}

  getRest60mDelayMs(): number {
    return getBatteryRest60mDelayMs();
  }

  computeDelayMs(restWindowStartedAt: Date, now: Date = new Date()): number {
    return computeBatteryRestTargetDelayMs(restWindowStartedAt, now);
  }

  buildIdempotencyKey(input: {
    vehicleId: string;
    restWindowId: string;
    restTargetType: Extract<LvRestTargetType, 'REST_60M' | 'REST_6H'>;
  }): string {
    return buildBatteryRestTargetJobIdempotencyKey({
      vehicleId: input.vehicleId,
      restWindowId: input.restWindowId,
      targetSuffix: targetSuffixForRestType(input.restTargetType),
    });
  }

  async scheduleRest60m(
    input: Omit<ScheduleLvRestTargetJobInput, 'restTargetType'>,
  ): Promise<ScheduleLvRestTargetJobResult> {
    return this.scheduleTarget({
      ...input,
      restTargetType: LV_REST_TARGET_TYPES.REST_60M,
    });
  }

  async scheduleTarget(
    input: ScheduleLvRestTargetJobInput,
  ): Promise<ScheduleLvRestTargetJobResult> {
    const now = input.now ?? new Date();
    const delayMs = this.computeDelayMs(input.restWindowStartedAt, now);
    const scheduledFor = new Date(input.restWindowStartedAt.getTime() + this.getRest60mDelayMs());
    const idempotencyKey = this.buildIdempotencyKey({
      vehicleId: input.vehicleId,
      restWindowId: input.restWindowId,
      restTargetType: input.restTargetType,
    });

    const bullJobId = await this.jobProducer.enqueue(
      'BATTERY_REST_TARGET_EVALUATE',
      {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        idempotencyKey,
        restWindowId: input.restWindowId,
        restWindowStartedAt: input.restWindowStartedAt.toISOString(),
        restTargetType: input.restTargetType,
        sourceEntityId: input.sessionId,
      },
      { delayMs },
    );

    if (!bullJobId) {
      return {
        scheduled: false,
        skipped: true,
        skipReason: 'enqueue_suppressed',
        idempotencyKey,
        scheduledFor,
        delayMs,
        bullJobId: null,
      };
    }

    return {
      scheduled: true,
      skipped: false,
      idempotencyKey,
      scheduledFor,
      delayMs,
      bullJobId,
    };
  }

  buildScheduledTargetMetadata(
    result: ScheduleLvRestTargetJobResult,
    targetType: LvRestTargetType,
    enqueuedAt: Date = new Date(),
  ) {
    return {
      idempotencyKey: result.idempotencyKey,
      scheduledFor: result.scheduledFor.toISOString(),
      enqueuedAt: enqueuedAt.toISOString(),
      bullJobId: result.bullJobId,
      status: result.scheduled
        ? LV_REST_TARGET_JOB_STATUS.ENQUEUED
        : LV_REST_TARGET_JOB_STATUS.SCHEDULED,
    };
  }
}
