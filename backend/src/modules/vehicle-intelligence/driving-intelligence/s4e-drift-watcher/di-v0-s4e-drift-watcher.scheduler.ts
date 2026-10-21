import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { DI_V0_S4E_TUNING } from './di-v0-s4e-config';
import type { DiV0S4DriftWatchPassResult, DiV0S4DriftWatcherService } from './di-v0-s4e-drift-watcher.service';
import { DI_V0_S4E_DRIFT_WATCHER_SERVICE } from './di-v0-s4e-tokens';

/**
 * SINGLETON_GLOBAL `di_v0_s4_drift_watcher`. Leadership avoids duplicate scans; T11 row locks keep correctness.
 */
@Injectable()
export class DiV0S4DriftWatcherScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiV0S4DriftWatcherScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @Inject(DI_V0_S4E_DRIFT_WATCHER_SERVICE) private readonly driftWatcher: DiV0S4DriftWatcherService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  onModuleInit(): void {
    if (!this.driftWatcher.isConfigured()) return;
    this.timer = setInterval(() => void this.tick(), DI_V0_S4E_TUNING.driftWatchIntervalMs);
    this.logger.log(`DI V0 S4 drift watcher scheduler active (intervalMs=${DI_V0_S4E_TUNING.driftWatchIntervalMs})`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<DiV0S4DriftWatchPassResult | null> {
    if (this.running || !this.driftWatcher.isConfigured()) return null;
    if (!this.leaderGuard.shouldRun('di_v0_s4_drift_watcher')) return null;
    this.running = true;
    try {
      return await this.driftWatcher.runDriftWatchPass();
    } catch (error) {
      this.logger.warn(
        `DI V0 S4 drift watcher tick failed: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`,
      );
      return null;
    } finally {
      this.running = false;
    }
  }
}
