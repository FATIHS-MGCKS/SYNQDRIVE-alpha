import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../workers/queues/queue-names';
import { sanitizeBullMqJobId } from '@shared/queue/bullmq-job-id.sanitizer';

export type ClickHouseMirrorRetryJobType = 'telemetry_snapshot' | 'telemetry_state_changes';

export interface ClickHouseMirrorRetryJobData {
  type: ClickHouseMirrorRetryJobType;
  payload: Record<string, unknown>;
  enqueuedAt: string;
  source?: string;
}

/**
 * Durable retry queue for failed ClickHouse mirror writes (P1-PL1).
 * Best-effort enqueue — never throws to telemetry ingest callers.
 */
@Injectable()
export class ClickHouseMirrorRetryProducer {
  private readonly logger = new Logger(ClickHouseMirrorRetryProducer.name);

  constructor(
    @Optional()
    @InjectQueue(QUEUE_NAMES.CLICKHOUSE_MIRROR_RETRY)
    private readonly queue?: Queue<ClickHouseMirrorRetryJobData>,
  ) {}

  async enqueue(
    type: ClickHouseMirrorRetryJobType,
    payload: Record<string, unknown>,
    source?: string,
  ): Promise<void> {
    if (!this.queue) {
      this.logger.debug(`Mirror retry skipped (queue unavailable) type=${type}`);
      return;
    }

    const vehicleId = String(payload.vehicle_id ?? payload.vehicleId ?? 'unknown');
    const timeKey =
      payload.recorded_at ??
      payload.changed_at ??
      payload.recordedAt ??
      Date.now();
    const jobId = sanitizeBullMqJobId({
      namespace: 'ch-mirror',
      key: `${type}-${vehicleId}-${timeKey}`,
    });

    try {
      await this.queue.add(
        type,
        {
          type,
          payload,
          enqueuedAt: new Date().toISOString(),
          source,
        },
        {
          jobId,
          removeOnComplete: true,
          removeOnFail: { count: 200, age: 7 * 24 * 3600 },
          attempts: 5,
          backoff: { type: 'exponential', delay: 10_000 },
        },
      );
    } catch (err: unknown) {
      const msg = (err as Error).message ?? String(err);
      if (!msg.toLowerCase().includes('duplicate')) {
        this.logger.warn(`Failed to enqueue CH mirror retry (${type}): ${msg}`);
      }
    }
  }
}
