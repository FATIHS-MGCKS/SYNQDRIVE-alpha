import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import chargingStationEnrichmentConfig from '@config/charging-station-enrichment.config';
import { PrismaService } from '@shared/database/prisma.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import { ChargingStationEnrichmentProducerService } from '@modules/vehicle-intelligence/charging-stations/enrichment/charging-station-enrichment-producer.service';
import {
  describeChargingStationEnrichmentCutoverMisconfiguration,
  hasValidChargingStationEnrichmentCutover,
} from '@modules/vehicle-intelligence/charging-stations/enrichment/charging-station-enrichment-cutover.util';
import { CHARGING_STATION_ENRICHMENT_STALE_PROCESSING_MS } from '@modules/vehicle-intelligence/charging-stations/enrichment/charging-station-enrichment-stale.util';
import { EnergyEventKind, VehicleEnergyEventDetectionSource } from '@prisma/client';
import { ChargingStationEnrichmentMetricsService } from '@modules/vehicle-intelligence/charging-stations/enrichment/charging-station-enrichment.metrics';
import { Optional } from '@nestjs/common';

@Injectable()
export class ChargingStationEnrichmentRecoveryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChargingStationEnrichmentRecoveryScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private inProgress = false;

  constructor(
    @Inject(chargingStationEnrichmentConfig.KEY)
    private readonly config: ConfigType<typeof chargingStationEnrichmentConfig>,
    private readonly prisma: PrismaService,
    private readonly producer: ChargingStationEnrichmentProducerService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
    @Optional() private readonly metrics?: ChargingStationEnrichmentMetricsService,
  ) {}

  shouldStartRecoveryTimer(): boolean {
    return (
      this.config.enabled &&
      this.config.recoveryEnabled &&
      hasValidChargingStationEnrichmentCutover(this.config)
    );
  }

  onModuleInit(): void {
    if (!this.config.recoveryEnabled) return;

    if (!this.shouldStartRecoveryTimer()) {
      const detail = !this.config.enabled
        ? 'CHARGING_STATION_ENRICHMENT_ENABLED must be true'
        : describeChargingStationEnrichmentCutoverMisconfiguration(this.config.cutoverState);
      this.logger.warn(
        JSON.stringify({
          event: 'charging_station_enrichment_recovery_timer_not_started',
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
    this.logger.log(`Charging station enrichment recovery interval: ${intervalMs}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async recoverMissedEnrichments(): Promise<number> {
    if (!this.config.enabled || !this.config.recoveryEnabled) return 0;
    if (!this.leaderGuard.shouldRun('charging_station_enrichment_recovery')) return 0;
    if (!canEnqueueQueue(this.logger, 'charging-station-enrichment-recovery')) return 0;
    if (this.inProgress) return 0;

    if (!hasValidChargingStationEnrichmentCutover(this.config)) {
      return 0;
    }

    const cutoverAt = this.config.cutoverAt as Date;
    this.inProgress = true;
    let recovered = 0;
    try {
      const candidates = await this.prisma.vehicleEnergyEvent.findMany({
        where: {
          kind: EnergyEventKind.RECHARGE,
          detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
          endTime: { gte: cutoverAt },
          OR: [
            { chargingStationEnrichment: { is: null } },
            {
              chargingStationEnrichment: {
                is: {
                  OR: [
                    { processingStatus: 'PENDING' },
                    {
                      processingStatus: 'PROCESSING',
                      lastAttemptAt: {
                        lt: new Date(Date.now() - CHARGING_STATION_ENRICHMENT_STALE_PROCESSING_MS),
                      },
                    },
                    {
                      processingStatus: 'PROCESSING',
                      resolutionStatus: 'ERROR',
                    },
                  ],
                },
              },
            },
          ],
        },
        include: { chargingStationEnrichment: true },
        orderBy: { endTime: 'asc' },
        take: this.config.recoveryBatchSize,
      });

      for (const event of candidates) {
        const outcome = await this.producer.enqueueForEventOutcome(event);
        if (outcome.status === 'enqueued') recovered += 1;
      }

      if (recovered > 0) {
        this.logger.log(`Charging station enrichment recovery re-enqueued ${recovered} events`);
        this.metrics?.recordRecovery('recovered');
      }
    } finally {
      this.inProgress = false;
    }

    return recovered;
  }
}
