import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  isBatteryV2HvFallbackChargeSessionEnabled,
  isBatteryV2HvRechargeSessionEnabled,
} from '@config/battery-health-v2.config';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { BatteryV2JobProducerService } from '../jobs/battery-v2-job-producer.service';
import { BatteryV2JobDeadLetterService } from '../jobs/battery-v2-job-dead-letter.service';
import {
  buildHvRechargePeriodicPeriodBucket,
  buildHvRechargeVehicleReconcileIdempotencyKey,
} from './hv-recharge-session-reconcile.policy';
import {
  HvRechargeSessionReconcileTrigger,
  type HvRechargeSessionReconcileTrigger as HvRechargeSessionReconcileTriggerType,
} from './hv-recharge-session-reconcile.trigger';
import { fetchHvRechargePeriodicReconcileTargets } from './hv-recharge-reconcile-target.query';
import { recordErdLivenessMetric } from './hv-erd-liveness.metrics';

export interface EnqueueHvRechargeReconcileInput {
  organizationId: string;
  vehicleId: string;
  trigger: HvRechargeSessionReconcileTriggerType;
  segmentFingerprint?: string | null;
  correlationId?: string;
  delayMs?: number;
  nonce?: string;
  periodBucket?: string;
  evaluatedAt?: Date;
}

@Injectable()
export class HvRechargeSessionReconcileProducerService {
  private readonly logger = new Logger(HvRechargeSessionReconcileProducerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobProducer: BatteryV2JobProducerService,
    private readonly deadLetters: BatteryV2JobDeadLetterService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  async enqueue(input: EnqueueHvRechargeReconcileInput): Promise<string | null> {
    const evaluatedAt = input.evaluatedAt ?? new Date();
    const periodBucket =
      input.periodBucket ??
      (input.trigger === HvRechargeSessionReconcileTrigger.PERIODIC
        ? buildHvRechargePeriodicPeriodBucket(evaluatedAt)
        : undefined);

    const idempotencyKey = input.segmentFingerprint
      ? buildHvRechargeVehicleReconcileIdempotencyKey({
          vehicleId: input.vehicleId,
          trigger: input.trigger,
          nonce: input.segmentFingerprint,
        })
      : buildHvRechargeVehicleReconcileIdempotencyKey({
          vehicleId: input.vehicleId,
          trigger: input.trigger,
          periodBucket,
          nonce: input.nonce,
          evaluatedAt,
        });

    if (
      await this.deadLetters.isDeadLetter('HV_RECHARGE_SESSION_RECONCILE', idempotencyKey)
    ) {
      recordErdLivenessMetric(this.metrics, 'reconcile_skipped_dead_letter');
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
      recordErdLivenessMetric(this.metrics, 'reconcile_enqueued');
      this.logger.debug(
        `Enqueued HV_RECHARGE_SESSION_RECONCILE vehicle=${input.vehicleId} trigger=${input.trigger}`,
      );
    } else {
      recordErdLivenessMetric(this.metrics, 'reconcile_duplicate_suppressed');
    }

    return jobId;
  }

  async reconcilePeriodic(
    batchSize: number,
    evaluatedAt: Date = new Date(),
  ): Promise<number> {
    if (!isBatteryV2HvRechargeSessionEnabled()) {
      recordErdLivenessMetric(this.metrics, 'reconcile_skipped_disabled');
      return 0;
    }

    const periodBucket = buildHvRechargePeriodicPeriodBucket(evaluatedAt);
    const selected = await fetchHvRechargePeriodicReconcileTargets(
      this.prisma,
      batchSize,
      evaluatedAt,
    );

    recordErdLivenessMetric(
      this.metrics,
      'reconcile_target_selected',
      selected.length,
    );

    let enqueued = 0;
    for (const target of selected) {
      const jobId = await this.enqueue({
        organizationId: target.organizationId,
        vehicleId: target.vehicleId,
        trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
        periodBucket,
        evaluatedAt,
      });
      if (jobId) enqueued += 1;
    }

    if (!isBatteryV2HvFallbackChargeSessionEnabled()) {
      this.logger.debug(
        'HV recharge periodic: fallback flag off — native + ongoing targets only',
      );
    }

    return enqueued;
  }

  async enqueueForChargingTransition(input: {
    organizationId: string;
    vehicleId: string;
    isCharging: boolean;
    observedAt?: Date;
  }): Promise<string | null> {
    if (!isBatteryV2HvRechargeSessionEnabled()) {
      recordErdLivenessMetric(this.metrics, 'reconcile_skipped_disabled');
      return null;
    }

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
    if (!isBatteryV2HvRechargeSessionEnabled()) {
      recordErdLivenessMetric(this.metrics, 'reconcile_skipped_disabled');
      return null;
    }

    return this.enqueue({
      organizationId,
      vehicleId,
      trigger: HvRechargeSessionReconcileTrigger.CAPABILITY_REFRESH,
      correlationId: correlationId ?? `hv-recharge:capability:${vehicleId}`,
    });
  }
}
