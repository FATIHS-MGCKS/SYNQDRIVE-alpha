import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queues/queue-names';
import { ClickHouseTelemetryService } from '../../modules/clickhouse/clickhouse-telemetry.service';
import type { ClickHouseMirrorRetryJobData } from '../../modules/clickhouse/clickhouse-mirror-retry.producer';

@Processor(QUEUE_NAMES.CLICKHOUSE_MIRROR_RETRY, { concurrency: 3 })
export class ClickHouseMirrorRetryProcessor extends WorkerHost {
  private readonly logger = new Logger(ClickHouseMirrorRetryProcessor.name);

  constructor(private readonly telemetry: ClickHouseTelemetryService) {
    super();
  }

  async process(job: Job<ClickHouseMirrorRetryJobData>): Promise<void> {
    const { type, payload } = job.data;
    if (type === 'telemetry_snapshot') {
      await this.telemetry.retryInsertSnapshotFromQueue(payload);
      return;
    }
    if (type === 'telemetry_state_changes') {
      await this.telemetry.retryInsertStateChangesFromQueue(payload);
      return;
    }
    this.logger.warn(`Unknown CH mirror retry type: ${type}`);
  }
}
