import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { VSI_PROFILE_LIFECYCLE_OUTBOX_WORKER_INTERVAL_MS } from './vsi-profile-lifecycle.constants';
import { VsiProfileLifecycleOutboxProcessor } from './vsi-profile-lifecycle.processor';

@Injectable()
export class VsiProfileLifecycleOutboxWorker {
  private readonly logger = new Logger(VsiProfileLifecycleOutboxWorker.name);
  private running = false;

  constructor(
    private readonly processor: VsiProfileLifecycleOutboxProcessor,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  @Interval(VSI_PROFILE_LIFECYCLE_OUTBOX_WORKER_INTERVAL_MS)
  async runScheduled(): Promise<void> {
    if (!this.leaderGuard.shouldRun('vsi_profile_lifecycle_outbox')) return;
    if (!RuntimeStatusRegistry.getWorkersEnabled()) return;
    await this.runOnce();
  }

  async runOnce(): Promise<{ processed: number; skipped: boolean }> {
    if (this.running) {
      return { processed: 0, skipped: true };
    }
    this.running = true;
    try {
      const results = await this.processor.processPendingBatch();
      const completed = results.filter((r) => r.outcome === 'completed').length;
      if (completed > 0) {
        this.logger.log(`VSI profile lifecycle outbox completed=${completed}`);
      }
      return { processed: results.length, skipped: false };
    } finally {
      this.running = false;
    }
  }
}
