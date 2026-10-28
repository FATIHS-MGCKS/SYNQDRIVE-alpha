import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { Ds4AssessmentServiceV1 } from './ds4-assessment.service.v1';

const LEADER_JOB = 'di_v0_ds4_assessment_v1';

@Injectable()
export class Ds4AssessmentSchedulerV1 implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Ds4AssessmentSchedulerV1.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly leaderGuard: SchedulerLeaderGuardService,
    private readonly service: Ds4AssessmentServiceV1,
  ) {}

  onModuleInit(): void {
    if (!this.service.isConfigured()) {
      this.logger.log('DS4 assessment scheduler dormant (feature disabled)');
      return;
    }
    const intervalMs = this.service.getRuntimeConfig().schedulerIntervalMs;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.logger.log(`DS4 assessment scheduler active (intervalMs=${intervalMs})`);
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
          `DS4 assessment pass discovered=${pass.discovered} claimed=${pass.claimed} ok=${pass.succeeded} skipped=${pass.skipped} retry=${pass.failedRetryable}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `DS4 assessment tick failed: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
