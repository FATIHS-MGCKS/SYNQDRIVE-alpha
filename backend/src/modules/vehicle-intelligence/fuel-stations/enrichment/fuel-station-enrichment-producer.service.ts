import { Injectable, Logger, Optional } from '@nestjs/common';
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

export interface EnqueueFuelStationEnrichmentInput {
  energyEventId: string;
  eventCreatedAt: Date;
  startLatitude: number | null;
  startLongitude: number | null;
}

@Injectable()
export class FuelStationEnrichmentProducerService {
  private readonly logger = new Logger(FuelStationEnrichmentProducerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.ENERGY_REFUEL_STATION_ENRICH)
    private readonly queue: Queue<RefuelStationEnrichmentJobData>,
    @Inject(fuelStationEnrichmentConfig.KEY)
    private readonly config: ConfigType<typeof fuelStationEnrichmentConfig>,
  ) {}

  async enqueueAfterPersist(input: EnqueueFuelStationEnrichmentInput): Promise<string | null> {
    if (!this.config.enabled) {
      return null;
    }

    if (!this.isAfterCutover(input.eventCreatedAt)) {
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

    const idempotencyKey = buildFuelStationEnrichmentJobIdempotencyKey({
      energyEventId: input.energyEventId,
      inputFingerprint: fingerprint,
    });
    const jobId = sanitizeBullMqJobId({
      namespace: 'refuel-station',
      key: idempotencyKey,
    });

    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
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
      if (state === 'completed' || state === 'failed') {
        await existing.remove();
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
      eventCreatedAt: event.createdAt,
      startLatitude: event.startLatitude,
      startLongitude: event.startLongitude,
    });
  }

  isAfterCutover(eventCreatedAt: Date): boolean {
    if (!this.config.cutoverAt) {
      return true;
    }
    return eventCreatedAt.getTime() >= this.config.cutoverAt.getTime();
  }
}
