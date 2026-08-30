import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import fuelStationEnrichmentConfig from '@config/fuel-station-enrichment.config';
import { PrismaService } from '@shared/database/prisma.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import { FuelStationEnrichmentProducerService } from '@modules/vehicle-intelligence/fuel-stations/enrichment/fuel-station-enrichment-producer.service';
import { EnergyEventKind } from '@prisma/client';
import {
  describeFuelStationEnrichmentCutoverMisconfiguration,
  hasValidFuelStationEnrichmentCutover,
} from '@modules/vehicle-intelligence/fuel-stations/enrichment/fuel-station-enrichment-cutover.util';

const STALE_PROCESSING_MS = 15 * 60_000;

/**
 * Bounded recovery for REFUEL events whose startTime is after cutover and whose
 * enrichment is missing or stuck. Does NOT sweep historical pre-cutover events.
 * FAILED rows are terminal and never automatically requeued.
 */
@Injectable()
export class FuelStationEnrichmentRecoveryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FuelStationEnrichmentRecoveryScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private inProgress = false;

  constructor(
    @Inject(fuelStationEnrichmentConfig.KEY)
    private readonly config: ConfigType<typeof fuelStationEnrichmentConfig>,
    private readonly prisma: PrismaService,
    private readonly producer: FuelStationEnrichmentProducerService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  shouldStartRecoveryTimer(): boolean {
    return (
      this.config.enabled &&
      this.config.recoveryEnabled &&
      hasValidFuelStationEnrichmentCutover(this.config)
    );
  }

  onModuleInit(): void {
    if (!this.config.recoveryEnabled) return;

    if (!this.shouldStartRecoveryTimer()) {
      const detail = !this.config.enabled
        ? 'FUEL_STATION_ENRICHMENT_ENABLED must be true'
        : describeFuelStationEnrichmentCutoverMisconfiguration(this.config.cutoverState);
      this.logger.warn(
        JSON.stringify({
          event: 'fuel_station_enrichment_recovery_timer_not_started',
          reason: 'recovery_misconfigured',
          detail,
        }),
      );
      return;
    }

    const intervalMs = Math.max(60_000, this.config.recoveryIntervalMs);
    this.timer = setInterval(() => {
      void this.recoverMissedEnrichments();
    }, intervalMs);
    this.logger.log(`Fuel station enrichment recovery interval: ${intervalMs}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async recoverMissedEnrichments(): Promise<number> {
    if (!this.config.enabled || !this.config.recoveryEnabled) return 0;
    if (!this.leaderGuard.shouldRun('fuel_station_enrichment_recovery')) return 0;
    if (!canEnqueueQueue(this.logger, 'fuel-station-enrichment-recovery')) return 0;
    if (this.inProgress) return 0;

    if (!hasValidFuelStationEnrichmentCutover(this.config)) {
      this.logger.warn(
        JSON.stringify({
          event: 'fuel_station_enrichment_recovery_disabled',
          reason: 'cutover_not_configured',
          detail: describeFuelStationEnrichmentCutoverMisconfiguration(this.config.cutoverState),
        }),
      );
      return 0;
    }

    const cutoverAt = this.config.cutoverAt as Date;
    this.inProgress = true;
    let recovered = 0;
    try {
      const candidates = await this.prisma.vehicleEnergyEvent.findMany({
        where: {
          kind: EnergyEventKind.REFUEL,
          startTime: { gte: cutoverAt },
          OR: [
            { fuelStationEnrichment: { is: null } },
            {
              fuelStationEnrichment: {
                is: {
                  OR: [
                    { processingStatus: 'PENDING' },
                    {
                      processingStatus: 'PROCESSING',
                      lastAttemptAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) },
                    },
                  ],
                },
              },
            },
          ],
        },
        orderBy: { startTime: 'asc' },
        take: this.config.recoveryBatchSize,
      });

      for (const event of candidates) {
        const jobId = await this.producer.enqueueAfterPersistFromEvent(event);
        if (jobId) recovered += 1;
      }

      if (recovered > 0) {
        this.logger.log(`Fuel station enrichment recovery re-enqueued ${recovered} events`);
      }
    } finally {
      this.inProgress = false;
    }

    return recovered;
  }
}
