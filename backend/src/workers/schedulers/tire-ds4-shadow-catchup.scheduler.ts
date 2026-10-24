import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import tireDs4ShadowConfig from '@config/tire-ds4-shadow.config';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import { TireDs4ShadowProducerService } from '@modules/vehicle-intelligence/tires/ds4-shadow/tire-ds4-shadow-producer.service';
import { TireDs4ShadowRepository } from '@modules/vehicle-intelligence/tires/ds4-shadow/tire-ds4-shadow.repository';
import { TIRE_DS4_SHADOW_ADAPTER_VERSION } from '@modules/vehicle-intelligence/tires/ds4-shadow/tire-ds4-shadow-adapter.version';

@Injectable()
export class TireDs4ShadowCatchupScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TireDs4ShadowCatchupScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private inProgress = false;

  constructor(
    @Inject(tireDs4ShadowConfig.KEY)
    private readonly config: ConfigType<typeof tireDs4ShadowConfig>,
    private readonly leaderGuard: SchedulerLeaderGuardService,
    private readonly producer: TireDs4ShadowProducerService,
    private readonly repository: TireDs4ShadowRepository,
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled || !this.config.catchupEnabled) return;

    const intervalMs = Math.max(60_000, this.config.catchupIntervalMs);
    this.timer = setInterval(() => {
      void this.runCatchup();
    }, intervalMs);
    this.logger.log(`Tire DS4 shadow catch-up interval: ${intervalMs}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runCatchup(): Promise<void> {
    if (!this.config.enabled || !this.config.catchupEnabled) return;
    if (!this.leaderGuard.shouldRun('tire_ds4_shadow_catchup')) return;
    if (!canEnqueueQueue(this.logger, 'tire-ds4-shadow-catchup')) return;
    if (this.inProgress) return;

    this.inProgress = true;
    try {
      const missing = await this.repository.findLedgerIdsMissingShadow(
        TIRE_DS4_SHADOW_ADAPTER_VERSION,
        this.config.catchupBatchSize,
      );
      for (const row of missing) {
        await this.producer.enqueueMaterialize({
          organizationId: row.organizationId,
          vehicleId: row.vehicleId,
          tripId: row.tripId,
          tireTripUsageLedgerId: row.tireTripUsageLedgerId,
          attempt: 0,
        });
      }
      if (missing.length > 0) {
        this.logger.log(
          JSON.stringify({
            event: 'tire_ds4_shadow_catchup_enqueued',
            count: missing.length,
            adapterVersion: TIRE_DS4_SHADOW_ADAPTER_VERSION,
          }),
        );
      }
    } finally {
      this.inProgress = false;
    }
  }
}
