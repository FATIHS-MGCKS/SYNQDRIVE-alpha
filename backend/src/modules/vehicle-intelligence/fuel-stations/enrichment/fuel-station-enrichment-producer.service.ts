import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import fuelStationEnrichmentConfig from '@config/fuel-station-enrichment.config';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import {
  formatBullMqJobIdLogContext,
  sanitizeBullMqJobId,
} from '@shared/queue/bullmq-job-id.sanitizer';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { PrismaService } from '@shared/database/prisma.service';
import type { VehicleEnergyEvent } from '@prisma/client';
import { deriveCanonicalFuelStationCoordinate } from './fuel-station-enrichment-coordinate.util';
import {
  buildFuelStationEnrichmentInputFingerprint,
  buildFuelStationEnrichmentJobIdempotencyKey,
} from './fuel-station-enrichment-fingerprint.util';
import {
  FUEL_STATION_ENRICHMENT_JOB_NAME,
  type RefuelStationEnrichmentJobData,
} from './fuel-station-enrichment.types';
import {
  describeFuelStationEnrichmentCutoverMisconfiguration,
  hasValidFuelStationEnrichmentCutover,
  isFuelStationEnrichmentEventAfterCutover,
} from './fuel-station-enrichment-cutover.util';
import { getFuelStationEnrichmentAutomaticSkipReason } from './fuel-station-enrichment-lifecycle.policy';

export interface EnqueueFuelStationEnrichmentInput {
  energyEventId: string;
  eventStartTime: Date;
  startLatitude: number | null;
  startLongitude: number | null;
  /** G2.1 V2 coordinate source when physical-refuel reconciliation supplied coordinates. */
  coordinateSource?: string | null;
  physicalRefuelReconciliationV2?: boolean;
}

@Injectable()
export class FuelStationEnrichmentProducerService {
  private readonly logger = new Logger(FuelStationEnrichmentProducerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.ENERGY_REFUEL_STATION_ENRICH)
    private readonly queue: Queue<RefuelStationEnrichmentJobData>,
    @Inject(fuelStationEnrichmentConfig.KEY)
    private readonly config: ConfigType<typeof fuelStationEnrichmentConfig>,
    private readonly prisma: PrismaService,
  ) {}

  async enqueueAfterPersist(input: EnqueueFuelStationEnrichmentInput): Promise<string | null> {
    if (!this.config.enabled) {
      return null;
    }

    if (!hasValidFuelStationEnrichmentCutover(this.config)) {
      this.logger.warn(
        JSON.stringify({
          event: 'fuel_station_enrichment_enqueue_skipped',
          reason: 'cutover_not_configured',
          detail: describeFuelStationEnrichmentCutoverMisconfiguration(this.config.cutoverState),
          energyEventId: input.energyEventId,
        }),
      );
      return null;
    }

    if (!this.isEventEligibleForEnrichment(input.eventStartTime)) {
      return null;
    }

    if (!canEnqueueQueue(this.logger, 'fuel-station-enrichment')) {
      return null;
    }

    const coordinate = deriveCanonicalFuelStationCoordinate({
      startLatitude: input.startLatitude,
      startLongitude: input.startLongitude,
    });

    const fingerprint = coordinate
      ? buildFuelStationEnrichmentInputFingerprint({
          energyEventId: input.energyEventId,
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
        })
      : buildFuelStationEnrichmentInputFingerprint({
          energyEventId: input.energyEventId,
          latitude: 0,
          longitude: 0,
        });

    const enrichment = await this.prisma.vehicleEnergyEventFuelStationEnrichment.findUnique({
      where: { energyEventId: input.energyEventId },
    });
    const terminalSkipReason = getFuelStationEnrichmentAutomaticSkipReason({
      enrichment,
      inputFingerprint: fingerprint,
    });
    if (terminalSkipReason) {
      this.logger.debug(
        JSON.stringify({
          event: 'fuel_station_enrichment_enqueue_skipped',
          reason: terminalSkipReason,
          energyEventId: input.energyEventId,
          inputFingerprint: fingerprint,
        }),
      );
      return null;
    }

    const idempotencyKey = buildFuelStationEnrichmentJobIdempotencyKey({
      energyEventId: input.energyEventId,
      inputFingerprint: fingerprint,
    });
    const jobId = sanitizeBullMqJobId({
      namespace: 'refuel-station',
      key: idempotencyKey,
    });

    const existingJob = await this.queue.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'waiting' || state === 'delayed' || state === 'active' || state === 'prioritized') {
        this.logger.debug(
          `Fuel station enrichment duplicate suppressed ${formatBullMqJobIdLogContext({
            namespace: 'refuel-station',
            key: idempotencyKey,
            jobId,
          })}`,
        );
        return jobId;
      }
    }

    await this.queue.add(
      FUEL_STATION_ENRICHMENT_JOB_NAME,
      { energyEventId: input.energyEventId },
      {
        jobId,
        attempts: this.config.jobAttempts,
        backoff: { type: 'exponential', delay: this.config.jobBackoffMs },
        removeOnComplete: { count: 1000, age: 24 * 60 * 60 },
        removeOnFail: { count: 5000, age: 7 * 24 * 60 * 60 },
      },
    );

    this.logger.debug(
      `Fuel station enrichment enqueued energyEventId=${input.energyEventId} ${formatBullMqJobIdLogContext(
        { namespace: 'refuel-station', key: idempotencyKey, jobId },
      )}`,
    );

    return jobId;
  }

  enqueueAfterPersistFromEvent(event: VehicleEnergyEvent): Promise<string | null> {
    return this.enqueueAfterPersist({
      energyEventId: event.id,
      eventStartTime: event.startTime,
      startLatitude: event.startLatitude,
      startLongitude: event.startLongitude,
    });
  }

  isEventEligibleForEnrichment(eventStartTime: Date): boolean {
    return isFuelStationEnrichmentEventAfterCutover(eventStartTime, this.config.cutoverAt);
  }
}
