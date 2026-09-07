import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { SnapshotWakeCoordinatorService } from '../snapshot-wake/snapshot-wake-coordinator.service';
import { INITIAL_SUCCESSOR_HANDOFF_RECOVERY_CONTINUATION } from '../snapshot-wake/snapshot-wake-recovery.util';

/**
 * Leader-gated recovery for durable successor handoffs whose BullMQ consumer
 * was lost after Redis persist (e.g. handoffQueue.add failure). Does not wait
 * for LONG_IDLE scheduler polling — bounded SCAN per tick with batch-tail carry.
 */
@Injectable()
export class SnapshotWakeHandoffRecoveryScheduler {
  private readonly logger = new Logger(SnapshotWakeHandoffRecoveryScheduler.name);
  private continuation = { ...INITIAL_SUCCESSOR_HANDOFF_RECOVERY_CONTINUATION };

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
      this.continuation,
    );
    this.continuation = result.continuation;

    if (result.rearmed > 0 || result.errors > 0) {
      this.logger.log(
        `Successor handoff recovery tick: scanned=${result.scanned} rearmed=${result.rearmed} errors=${result.errors} cursor=${result.continuation.scanCursor} pending=${result.continuation.pendingBatchKeys.length}`,
      );
    }
  }
}
