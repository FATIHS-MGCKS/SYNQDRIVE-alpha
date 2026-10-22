import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { DiV0M7aRoadAssignmentShadowService } from './di-v0-m7a-road-assignment-shadow.service';

const LEADER_JOB = 'di_v0_m7a_road_assignment_shadow_v1';

@Injectable()
export class DiV0M7aRoadAssignmentShadowScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiV0M7aRoadAssignmentShadowScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly leaderGuard: SchedulerLeaderGuardService,
    private readonly service: DiV0M7aRoadAssignmentShadowService,
  ) {}

  onModuleInit(): void {
    if (!this.service.isConfigured()) {
      this.logger.log('Motion-core shadow scheduler dormant (feature disabled)');
      return;
    }
    const intervalMs = this.service.getRuntimeConfig().schedulerIntervalMs;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.logger.log(`Motion-core shadow scheduler active (intervalMs=${intervalMs})`);
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
          `motion-core shadow pass discovered=${pass.discovered} claimed=${pass.claimed} ok=${pass.succeeded} neutral=${pass.neutral} retry=${pass.failedRetryable}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `motion-core shadow tick failed: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
