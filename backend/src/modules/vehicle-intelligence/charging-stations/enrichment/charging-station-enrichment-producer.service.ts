import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigType } from '@nestjs/config';
import chargingStationEnrichmentConfig from '@config/charging-station-enrichment.config';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import {
  formatBullMqJobIdLogContext,
  sanitizeBullMqJobId,
} from '@shared/queue/bullmq-job-id.sanitizer';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { PrismaService } from '@shared/database/prisma.service';
import type { VehicleEnergyEvent } from '@prisma/client';
import { deriveCanonicalChargingStationEnrichmentCoordinate } from './derive-canonical-charging-station-enrichment-coordinate';
import {
  buildChargingStationEnrichmentInputFingerprint,
  buildChargingStationEnrichmentJobIdempotencyKey,
} from './charging-station-enrichment-fingerprint.util';
import {
  describeChargingStationEnrichmentCutoverMisconfiguration,
  hasValidChargingStationEnrichmentCutover,
  isChargingStationEnrichmentEventAfterCutover,
} from './charging-station-enrichment-cutover.util';
import { getChargingStationEnrichmentAutomaticSkipReason } from './charging-station-enrichment-lifecycle.policy';
import type { ChargingStationEnrichmentEnqueueOutcome } from './charging-station-enrichment-producer.outcome';
import {
  isCanonicalErdRechargeForChargingEnrichment,
  RECHARGE_STATION_ENRICHMENT_JOB_NAME,
  type RechargeStationEnrichmentJobData,
} from './charging-station-enrichment.types';
import { ChargingStationEnrichmentMetricsService } from './charging-station-enrichment.metrics';

@Injectable()
export class ChargingStationEnrichmentProducerService {
  private readonly logger = new Logger(ChargingStationEnrichmentProducerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.ENERGY_RECHARGE_STATION_ENRICH)
    private readonly queue: Queue<RechargeStationEnrichmentJobData>,
    @Inject(chargingStationEnrichmentConfig.KEY)
    private readonly config: ConfigType<typeof chargingStationEnrichmentConfig>,
    private readonly prisma: PrismaService,
    @Optional() private readonly metrics?: ChargingStationEnrichmentMetricsService,
  ) {}

  async enqueueAfterProjection(energyEventId: string): Promise<string | null> {
    const outcome = await this.enqueueAfterProjectionOutcome(energyEventId);
    return outcome.jobId;
  }

  async enqueueAfterProjectionOutcome(
    energyEventId: string,
  ): Promise<ChargingStationEnrichmentEnqueueOutcome> {
    if (!this.config.enabled) {
      this.metrics?.recordEnqueue('skipped', 'feature_disabled');
      return { status: 'skipped', jobId: null, reason: 'feature_disabled' };
    }

    if (!hasValidChargingStationEnrichmentCutover(this.config)) {
      this.logger.warn(
        JSON.stringify({
          event: 'charging_station_enrichment_enqueue_skipped',
          reason: 'cutover_not_configured',
          detail: describeChargingStationEnrichmentCutoverMisconfiguration(this.config.cutoverState),
          energyEventId,
        }),
      );
      this.metrics?.recordEnqueue('skipped', 'cutover_not_configured');
      return { status: 'skipped', jobId: null, reason: 'cutover_not_configured' };
    }

    const event = await this.prisma.vehicleEnergyEvent.findUnique({
      where: { id: energyEventId },
      include: { chargingStationEnrichment: true },
    });

    if (!event) {
      this.metrics?.recordEnqueue('skipped', 'event_not_found');
      return { status: 'skipped', jobId: null, reason: 'event_not_found' };
    }

    return this.enqueueForEventOutcome(event);
  }

  async enqueueForEventOutcome(
    event: VehicleEnergyEvent & {
      chargingStationEnrichment?: import('@prisma/client').VehicleEnergyEventChargingStationEnrichment | null;
    },
  ): Promise<ChargingStationEnrichmentEnqueueOutcome> {
    if (!this.config.enabled) {
      this.metrics?.recordEnqueue('skipped', 'feature_disabled');
      return { status: 'skipped', jobId: null, reason: 'feature_disabled' };
    }

    if (!hasValidChargingStationEnrichmentCutover(this.config)) {
      this.metrics?.recordEnqueue('skipped', 'cutover_not_configured');
      return { status: 'skipped', jobId: null, reason: 'cutover_not_configured' };
    }

    if (!isCanonicalErdRechargeForChargingEnrichment(event)) {
      this.metrics?.recordEnqueue('skipped', 'not_canonical_recharge');
      return { status: 'skipped', jobId: null, reason: 'not_canonical_recharge' };
    }

    const cutoverAt = this.config.cutoverAt as Date;
    if (!isChargingStationEnrichmentEventAfterCutover(event.endTime, cutoverAt)) {
      this.metrics?.recordEnqueue('skipped', 'before_cutover');
      return { status: 'skipped', jobId: null, reason: 'before_cutover' };
    }

    if (!canEnqueueQueue(this.logger, 'charging-station-enrichment')) {
      this.metrics?.recordEnqueue('deferred', 'queue_unavailable');
      return { status: 'deferred_queue_unavailable', jobId: null };
    }

    const coordinateOutcome = deriveCanonicalChargingStationEnrichmentCoordinate(event);
    const fingerprint = buildChargingStationEnrichmentInputFingerprint({
      energyEventId: event.id,
      coordinateOutcome,
    });

    const terminalSkipReason = getChargingStationEnrichmentAutomaticSkipReason({
      enrichment: event.chargingStationEnrichment,
      inputFingerprint: fingerprint,
    });
    if (terminalSkipReason) {
      this.metrics?.recordEnqueue('terminal_skip', terminalSkipReason);
      return { status: 'terminal_skip', jobId: null, reason: terminalSkipReason };
    }

    const idempotencyKey = buildChargingStationEnrichmentJobIdempotencyKey({
      energyEventId: event.id,
      inputFingerprint: fingerprint,
    });
    const jobId = sanitizeBullMqJobId({
      namespace: 'recharge-station',
      key: idempotencyKey,
    });

    const existingJob = await this.queue.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (
        state === 'waiting' ||
        state === 'delayed' ||
        state === 'active' ||
        state === 'prioritized'
      ) {
        this.metrics?.recordEnqueue('deduped', 'active_job');
        return { status: 'deduped', jobId };
      }
      if (state === 'completed') {
        this.metrics?.recordEnqueue('deduped', 'completed_job');
        return { status: 'deduped', jobId };
      }
      if (state === 'failed') {
        await existingJob.remove();
      }
    }

    await this.queue.add(
      RECHARGE_STATION_ENRICHMENT_JOB_NAME,
      { energyEventId: event.id },
      {
        jobId,
        attempts: this.config.jobAttempts,
        backoff: { type: 'exponential', delay: this.config.jobBackoffMs },
        removeOnComplete: { count: 1000, age: 24 * 60 * 60 },
        removeOnFail: { count: 5000, age: 7 * 24 * 60 * 60 },
      },
    );

    this.metrics?.recordEnqueue('enqueued', 'ok');
    this.logger.debug(
      `Charging station enrichment enqueued energyEventId=${event.id} ${formatBullMqJobIdLogContext({
        namespace: 'recharge-station',
        key: idempotencyKey,
        jobId,
      })}`,
    );

    return { status: 'enqueued', jobId };
  }

  enqueueAfterPersistFromEvent(
    event: VehicleEnergyEvent & {
      chargingStationEnrichment?: import('@prisma/client').VehicleEnergyEventChargingStationEnrichment | null;
    },
  ): Promise<string | null> {
    return this.enqueueForEventOutcome(event).then((o) => o.jobId);
  }
}
