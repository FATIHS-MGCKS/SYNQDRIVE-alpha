import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import physicalRefuelReconciliationConfig from '@config/physical-refuel-reconciliation.config';
import { PhysicalRefuelReconciliationRuntimeService } from '@modules/vehicle-intelligence/energy-events/physical-refuel-reconciliation-runtime.service';

/**
 * G2.1a durable reconciliation recovery: settlement due, orphan refuels, lost enqueue.
 * G2.1d: Redis-independent — every replica may scan; vehicle PG advisory lock serializes work.
 */
@Injectable()
export class PhysicalRefuelReconciliationRecoveryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PhysicalRefuelReconciliationRecoveryScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private inProgress = false;

  constructor(
    @Inject(physicalRefuelReconciliationConfig.KEY)
    private readonly config: ConfigType<typeof physicalRefuelReconciliationConfig>,
    private readonly runtime: PhysicalRefuelReconciliationRuntimeService,
  ) {}

  shouldStartRecoveryTimer(): boolean {
    return this.config.enabled && this.config.recoveryEnabled;
  }

  onModuleInit(): void {
    if (!this.shouldStartRecoveryTimer()) return;

    const intervalMs = Math.max(30_000, this.config.recoveryIntervalMs);
    this.timer = setInterval(() => {
      void this.runRecoveryTick();
    }, intervalMs);
    this.logger.log(
      JSON.stringify({
        event: 'physical_refuel_recovery_timer_started',
        intervalMs,
        leaderElection: 'none_pg_vehicle_lock',
      }),
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runRecoveryTick(): Promise<number> {
    if (!this.config.enabled || !this.config.recoveryEnabled) return 0;
    if (this.inProgress) return 0;

    this.inProgress = true;
    try {
      this.logger.debug(JSON.stringify({ event: 'physical_refuel_recovery_tick' }));
      await this.runtime.emitRecoveryBacklogMetrics();
      const result = await this.runtime.runRecoveryBatch();
      return result.processedVehicles;
    } finally {
      this.inProgress = false;
    }
  }
}
