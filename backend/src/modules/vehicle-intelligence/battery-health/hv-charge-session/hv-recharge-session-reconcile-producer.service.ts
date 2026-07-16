import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { isBatteryV2HvFallbackChargeSessionEnabled } from '@config/battery-health-v2.config';
import { BatteryCapabilityStatus } from '../battery-v2-domain';
import {
  RECHARGE_SEGMENTS_SIGNAL_KEY,
} from '../capability-preflight/battery-capability-signals.registry';
import { BatteryV2JobProducerService } from '../jobs/battery-v2-job-producer.service';
import { BatteryV2JobDeadLetterService } from '../jobs/battery-v2-job-dead-letter.service';
import {
  buildHvRechargeVehicleReconcileIdempotencyKey,
} from './hv-recharge-session-reconcile.policy';
import {
  HvRechargeSessionReconcileTrigger,
  type HvRechargeSessionReconcileTrigger as HvRechargeSessionReconcileTriggerType,
} from './hv-recharge-session-reconcile.trigger';

export interface EnqueueHvRechargeReconcileInput {
  organizationId: string;
  vehicleId: string;
  trigger: HvRechargeSessionReconcileTriggerType;
  segmentFingerprint?: string | null;
  correlationId?: string;
  delayMs?: number;
  nonce?: string;
}

@Injectable()
export class HvRechargeSessionReconcileProducerService {
  private readonly logger = new Logger(HvRechargeSessionReconcileProducerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobProducer: BatteryV2JobProducerService,
    private readonly deadLetters: BatteryV2JobDeadLetterService,
  ) {}

  async enqueue(input: EnqueueHvRechargeReconcileInput): Promise<string | null> {
    const idempotencyKey = input.segmentFingerprint
      ? buildHvRechargeVehicleReconcileIdempotencyKey({
          vehicleId: input.vehicleId,
          trigger: input.trigger,
          nonce: input.segmentFingerprint,
        })
      : buildHvRechargeVehicleReconcileIdempotencyKey({
          vehicleId: input.vehicleId,
          trigger: input.trigger,
          nonce: input.nonce,
        });

    if (
      await this.deadLetters.isDeadLetter('HV_RECHARGE_SESSION_RECONCILE', idempotencyKey)
    ) {
      return null;
    }

    const jobId = await this.jobProducer.enqueue(
      'HV_RECHARGE_SESSION_RECONCILE',
      {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        idempotencyKey,
        segmentFingerprint: input.segmentFingerprint ?? null,
        reconcileTrigger: input.trigger,
        correlationId: input.correlationId ?? `hv-recharge:${input.trigger}:${input.vehicleId}`,
      },
      { delayMs: input.delayMs ?? 0 },
    );

    if (jobId) {
      this.logger.debug(
        `Enqueued HV_RECHARGE_SESSION_RECONCILE vehicle=${input.vehicleId} trigger=${input.trigger}`,
      );
    }

    return jobId;
  }

  async reconcilePeriodic(batchSize: number): Promise<number> {
    const targets = new Map<string, { vehicleId: string; organizationId: string }>();

    const ongoing = await this.prisma.hvChargeSession.findMany({
      where: { isOngoing: true },
      take: batchSize,
      select: { vehicleId: true, organizationId: true },
    });
    for (const row of ongoing) {
      targets.set(row.vehicleId, row);
    }

    if (targets.size < batchSize) {
      const capable = await this.prisma.vehicleBatteryCapability.findMany({
        where: {
          signalKey: RECHARGE_SEGMENTS_SIGNAL_KEY,
          status: {
            in: [
              BatteryCapabilityStatus.AVAILABLE,
              BatteryCapabilityStatus.AVAILABLE_STALE,
            ],
          },
          vehicle: { dimoVehicle: { is: { tokenId: { not: null } } } },
        },
        distinct: ['vehicleId'],
        take: batchSize - targets.size,
        orderBy: { checkedAt: 'asc' },
        select: { vehicleId: true, organizationId: true },
      });

      for (const row of capable) {
        if (!targets.has(row.vehicleId)) {
          targets.set(row.vehicleId, row);
        }
      }
    }

    if (targets.size < batchSize && isBatteryV2HvFallbackChargeSessionEnabled()) {
      const chargingCapable = await this.prisma.vehicleBatteryCapability.findMany({
        where: {
          signalKey: 'hv.is_charging',
          status: {
            in: [
              BatteryCapabilityStatus.AVAILABLE,
              BatteryCapabilityStatus.AVAILABLE_STALE,
            ],
          },
          vehicle: { dimoVehicle: { is: { tokenId: { not: null } } } },
        },
        distinct: ['vehicleId'],
        take: batchSize - targets.size,
        orderBy: { checkedAt: 'asc' },
        select: { vehicleId: true, organizationId: true },
      });

      for (const row of chargingCapable) {
        if (!targets.has(row.vehicleId)) {
          targets.set(row.vehicleId, row);
        }
      }
    }

    let enqueued = 0;
    for (const target of targets.values()) {
      const jobId = await this.enqueue({
        organizationId: target.organizationId,
        vehicleId: target.vehicleId,
        trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
      });
      if (jobId) enqueued += 1;
    }

    return enqueued;
  }

  async enqueueForChargingTransition(input: {
    organizationId: string;
    vehicleId: string;
    isCharging: boolean;
    observedAt?: Date;
  }): Promise<string | null> {
    const nonce = `${input.isCharging ? 'on' : 'off'}:${(input.observedAt ?? new Date()).toISOString()}`;
    return this.enqueue({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      trigger: HvRechargeSessionReconcileTrigger.CHARGING_STATE,
      nonce,
      correlationId: `hv-recharge:charging:${input.vehicleId}:${nonce}`,
      delayMs: 30_000,
    });
  }

  async enqueueAfterCapabilityRefresh(
    organizationId: string,
    vehicleId: string,
    correlationId?: string,
  ): Promise<string | null> {
    return this.enqueue({
      organizationId,
      vehicleId,
      trigger: HvRechargeSessionReconcileTrigger.CAPABILITY_REFRESH,
      correlationId: correlationId ?? `hv-recharge:capability:${vehicleId}`,
    });
  }
}
