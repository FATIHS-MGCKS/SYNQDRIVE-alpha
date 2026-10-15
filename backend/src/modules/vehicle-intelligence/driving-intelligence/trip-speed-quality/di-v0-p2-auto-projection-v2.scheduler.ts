import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { DiV0P2AutoProjectionV2ConfigError, parseDiV0P2AutoProjectionV2Config } from './di-v0-p2-auto-projection-v2.config';
import { DiV0P2AutoProjectionV2Service } from './di-v0-p2-auto-projection-v2.service';

const LEADER_JOB = 'di_v0_p2_auto_projection_v2';

@Injectable()
export class DiV0P2AutoProjectionV2Scheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiV0P2AutoProjectionV2Scheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly autoProjection: DiV0P2AutoProjectionV2Service,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  onModuleInit(): void {
    try {
      parseDiV0P2AutoProjectionV2Config();
    } catch (error) {
      if (error instanceof DiV0P2AutoProjectionV2ConfigError) {
        this.logger.error(`P2 auto projection V2 config invalid — scheduler disabled: ${error.message}`);
        return;
      }
      throw error;
    }
    if (!this.autoProjection.isConfigured()) {
      this.logger.log('P2 auto projection V2 scheduler dormant (feature disabled)');
      return;
    }
    const intervalMs = this.autoProjection.getConfig().schedulerIntervalMs;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.logger.log(`P2 auto projection V2 scheduler active (intervalMs=${intervalMs})`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.running || !this.autoProjection.isConfigured()) return;
    if (!this.leaderGuard.shouldRun(LEADER_JOB)) return;
    this.running = true;
    try {
      await this.autoProjection.runPass();
    } catch (error) {
      this.logger.warn(
        `P2 auto projection V2 tick failed: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
