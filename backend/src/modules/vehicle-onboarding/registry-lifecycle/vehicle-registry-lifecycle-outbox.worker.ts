import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { VehicleRegistryLifecycleOutboxProcessor } from './vehicle-registry-lifecycle-outbox.processor';
import {
  VEHICLE_REGISTRY_LIFECYCLE_OUTBOX_BATCH_SIZE,
  VEHICLE_REGISTRY_LIFECYCLE_OUTBOX_WORKER_INTERVAL_MS,
} from './vehicle-registry-lifecycle-outbox.constants';

@Injectable()
export class VehicleRegistryLifecycleOutboxWorker {
  private readonly logger = new Logger(VehicleRegistryLifecycleOutboxWorker.name);
  private running = false;

  constructor(
    private readonly processor: VehicleRegistryLifecycleOutboxProcessor,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  @Interval(VEHICLE_REGISTRY_LIFECYCLE_OUTBOX_WORKER_INTERVAL_MS)
  async runScheduled(): Promise<void> {
    if (!this.leaderGuard.shouldRun('vehicle_registry_lifecycle_outbox')) return;
    if (!RuntimeStatusRegistry.getWorkersEnabled()) return;
    await this.runOnce();
  }

  async runOnce(): Promise<{ processed: number; skipped: boolean }> {
    if (this.running) {
      return { processed: 0, skipped: true };
    }
    this.running = true;
    try {
      const results = await this.processor.processPendingBatch(
        VEHICLE_REGISTRY_LIFECYCLE_OUTBOX_BATCH_SIZE,
      );
      const published = results.filter((r) => r.outcome === 'published').length;
      if (published > 0) {
        this.logger.log(`Registry lifecycle outbox worker published=${published}`);
      }
      return { processed: results.length, skipped: false };
    } finally {
      this.running = false;
    }
  }
}
