import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { SnapshotWakeCoordinatorService } from '../snapshot-wake/snapshot-wake-coordinator.service';

/**
 * Leader-gated recovery for durable successor handoffs whose BullMQ consumer
 * was lost after Redis persist (e.g. handoffQueue.add failure). Does not wait
 * for LONG_IDLE scheduler polling — bounded SCAN per tick.
 */
@Injectable()
export class SnapshotWakeHandoffRecoveryScheduler {
  private readonly logger = new Logger(SnapshotWakeHandoffRecoveryScheduler.name);
  private scanCursor = '0';

  constructor(
    private readonly coordinator: SnapshotWakeCoordinatorService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  @Interval(60_000)
  async recoverOrphanedSuccessorHandoffs(): Promise<void> {
    if (!this.leaderGuard.shouldRun('snapshot_wake_handoff_recovery')) {
      return;
    }

    const result = await this.coordinator.recoverOrphanedSuccessorHandoffs(
      this.scanCursor,
    );
    this.scanCursor = result.nextCursor;

    if (result.rearmed > 0 || result.errors > 0) {
      this.logger.log(
        `Successor handoff recovery tick: scanned=${result.scanned} rearmed=${result.rearmed} errors=${result.errors} cursor=${result.nextCursor}`,
      );
    }
  }
}
