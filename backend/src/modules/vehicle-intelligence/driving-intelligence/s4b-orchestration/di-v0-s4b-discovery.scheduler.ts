import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { DI_V0_S4B_TUNING } from './di-v0-s4b-config';
import type { DiV0S4DiscoveryPassResult, DiV0S4DiscoveryService } from './di-v0-s4b-discovery.service';
import { DI_V0_S4B_DISCOVERY_SERVICE } from './di-v0-s4b-tokens';

/**
 * SINGLETON_GLOBAL `di_v0_s4_discovery`. Leadership only avoids duplicate scans: two discoverers
 * are safe because T01 collapses duplicates (`schedulerLeadershipIsCorrectnessRequirement=false`).
 * No timer is created unless the control plane can enable discovery.
 */
@Injectable()
export class DiV0S4DiscoveryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiV0S4DiscoveryScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @Inject(DI_V0_S4B_DISCOVERY_SERVICE) private readonly discovery: DiV0S4DiscoveryService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  onModuleInit(): void {
    if (!this.discovery.isConfigured()) return;
    this.timer = setInterval(() => void this.tick(), DI_V0_S4B_TUNING.discoveryIntervalMs);
    this.logger.log(`DI V0 S4 discovery scheduler active (intervalMs=${DI_V0_S4B_TUNING.discoveryIntervalMs})`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<DiV0S4DiscoveryPassResult | null> {
    if (this.running || !this.discovery.isConfigured()) return null;
    if (!this.leaderGuard.shouldRun('di_v0_s4_discovery')) return null;
    this.running = true;
    try {
      return await this.discovery.runDiscoveryPass();
    } catch (error) {
      this.logger.warn(`DI V0 S4 discovery tick failed: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`);
      return null;
    } finally {
      this.running = false;
    }
  }
}
