import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { DI_V0_S4E_TUNING } from './di-v0-s4e-config';
import type { DiV0S4MaintenancePassResult, DiV0S4MaintenanceService } from './di-v0-s4e-maintenance.service';
import { DI_V0_S4E_MAINTENANCE_SERVICE } from './di-v0-s4e-tokens';

/** SINGLETON_GLOBAL `di_v0_s4_maintenance_reaper` — bounded T10 exhaustion + T12 retirement batches. */
@Injectable()
export class DiV0S4MaintenanceScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiV0S4MaintenanceScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @Inject(DI_V0_S4E_MAINTENANCE_SERVICE) private readonly maintenance: DiV0S4MaintenanceService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  onModuleInit(): void {
    if (!this.maintenance.isConfigured()) return;
    this.timer = setInterval(() => void this.tick(), DI_V0_S4E_TUNING.maintenanceIntervalMs);
    this.logger.log(`DI V0 S4 maintenance reaper scheduler active (intervalMs=${DI_V0_S4E_TUNING.maintenanceIntervalMs})`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<DiV0S4MaintenancePassResult | null> {
    if (this.running || !this.maintenance.isConfigured()) return null;
    if (!this.leaderGuard.shouldRun('di_v0_s4_maintenance_reaper')) return null;
    this.running = true;
    try {
      return await this.maintenance.runMaintenancePass();
    } catch (error) {
      this.logger.warn(
        `DI V0 S4 maintenance tick failed: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`,
      );
      return null;
    } finally {
      this.running = false;
    }
  }
}
