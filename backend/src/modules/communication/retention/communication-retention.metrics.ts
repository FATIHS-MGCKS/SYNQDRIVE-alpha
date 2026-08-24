import { Injectable } from '@nestjs/common';
import type { CommunicationRetentionMetricsSnapshot } from './communication-retention.types';

/**
 * Lightweight in-process metrics hooks for future C13.2 observability.
 * No dashboards/alerts in C13.1.
 */
@Injectable()
export class CommunicationRetentionMetrics {
  private snapshot: CommunicationRetentionMetricsSnapshot = {
    lastRunDurationMs: null,
    lastRunAffected: null,
    lastRunFailed: null,
    lastRunCompletedAt: null,
  };

  recordRun(input: {
    durationMs: number;
    affected: number;
    failed: number;
    completedAt: Date;
  }): void {
    this.snapshot = {
      lastRunDurationMs: input.durationMs,
      lastRunAffected: input.affected,
      lastRunFailed: input.failed,
      lastRunCompletedAt: input.completedAt.toISOString(),
    };
  }

  getSnapshot(): CommunicationRetentionMetricsSnapshot {
    return { ...this.snapshot };
  }
}
