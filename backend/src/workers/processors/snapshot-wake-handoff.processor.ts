import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../queues/queue-names';
import { SnapshotWakeCoordinatorService } from '../snapshot-wake/snapshot-wake-coordinator.service';

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
    await this.snapshotWakeCoordinator.dispatchSuccessorHandoff(job.data.vehicleId);
  }
}
