import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { DiV0S4ResearchV2Service } from './di-v0-s4-research-v2.service';

const LEADER_JOB = 'di_v0_s4_research_v2';

@Injectable()
export class DiV0S4ResearchV2Scheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiV0S4ResearchV2Scheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly leaderGuard: SchedulerLeaderGuardService,
    private readonly service: DiV0S4ResearchV2Service,
  ) {}

  onModuleInit(): void {
    if (!this.service.isConfigured()) {
      this.logger.log('S4 research V2 scheduler dormant (feature disabled)');
      return;
    }
    const intervalMs = this.service.getRuntimeConfig().schedulerIntervalMs;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.logger.log(`S4 research V2 scheduler active (intervalMs=${intervalMs})`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.running || !this.service.isConfigured()) return;
    if (!this.leaderGuard.shouldRun(LEADER_JOB)) return;
    this.running = true;
    try {
      const pass = await this.service.runPass();
      if (pass.claimed > 0) {
        this.logger.log(
          `research pass discovered=${pass.discovered} claimed=${pass.claimed} ok=${pass.succeeded} neutral=${pass.neutral} retry=${pass.failedRetryable}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `S4 research V2 tick failed: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
