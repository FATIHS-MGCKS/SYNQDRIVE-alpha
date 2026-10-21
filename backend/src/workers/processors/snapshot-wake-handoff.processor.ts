import { Processor, WorkerHost } from '@nestjs/bullmq';
import { DelayedError, Job } from 'bullmq';

import { QUEUE_NAMES } from '../queues/queue-names';
import { SnapshotWakeCoordinatorService } from '../snapshot-wake/snapshot-wake-coordinator.service';
import { isSnapshotWakeHandoffDeferError } from '../snapshot-wake/snapshot-wake-handoff-defer.error';

export interface SnapshotWakeHandoffJobData {
  vehicleId: string;
}

/**
 * Lightweight post-terminal wake successor dispatcher.
 * Does not perform provider fetches — only hands off to the canonical snapshot queue.
 */
@Processor(QUEUE_NAMES.SNAPSHOT_WAKE_HANDOFF, { concurrency: 10 })
export class SnapshotWakeHandoffProcessor extends WorkerHost {
  constructor(
    private readonly snapshotWakeCoordinator: SnapshotWakeCoordinatorService,
  ) {
    super();
  }

  async process(job: Job<SnapshotWakeHandoffJobData>): Promise<void> {
    try {
      await this.snapshotWakeCoordinator.dispatchSuccessorHandoff(job.data.vehicleId);
    } catch (err) {
      if (isSnapshotWakeHandoffDeferError(err)) {
        const delayMs = Math.max(1, err.retryAfterMs);
        await job.moveToDelayed(Date.now() + delayMs, job.token);
        throw new DelayedError(
          `snapshot wake handoff deferred (${err.reason}) for ${delayMs}ms`,
        );
      }
      throw err;
    }
  }
}
