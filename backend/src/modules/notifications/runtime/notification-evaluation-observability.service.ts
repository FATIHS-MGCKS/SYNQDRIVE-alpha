import { Injectable, Logger } from '@nestjs/common';
import type { NotificationEvaluationRunResult } from './notification-evaluation.types';

export type NotificationRuntimeMetric =
  | 'lock_acquired'
  | 'lock_contention'
  | 'job_coalesced'
  | 'job_retried'
  | 'job_failed'
  | 'run_duration_ms'
  | 'candidates_processed'
  | 'duplicate_prevented';

@Injectable()
export class NotificationEvaluationObservabilityService {
  private readonly logger = new Logger(NotificationEvaluationObservabilityService.name);
  private readonly counters = new Map<NotificationRuntimeMetric, number>();

  increment(metric: NotificationRuntimeMetric, by = 1): void {
    this.counters.set(metric, (this.counters.get(metric) ?? 0) + by);
  }

  observeRunDuration(durationMs: number): void {
    this.increment('run_duration_ms', durationMs);
    this.logger.log({
      msg: 'notification.evaluation.run_duration',
      durationMs,
    });
  }

  logLockAcquired(organizationId: string, runId: string): void {
    this.increment('lock_acquired');
    this.logger.log({
      msg: 'notification.evaluation.lock_acquired',
      organizationId,
      runId,
    });
  }

  logLockContention(organizationId: string, runId: string, triggerClass: string): void {
    this.increment('lock_contention');
    this.logger.debug({
      msg: 'notification.evaluation.lock_contention',
      organizationId,
      runId,
      triggerClass,
    });
  }

  logJobCoalesced(organizationId: string, triggerClass: string, reason: string): void {
    this.increment('job_coalesced');
    this.logger.debug({
      msg: 'notification.evaluation.job_coalesced',
      organizationId,
      triggerClass,
      reason,
    });
  }

  logJobRetried(organizationId: string, runId: string, attempt: number, err: string): void {
    this.increment('job_retried');
    this.logger.warn({
      msg: 'notification.evaluation.job_retried',
      organizationId,
      runId,
      attempt,
      error: err,
    });
  }

  logJobFailed(organizationId: string, runId: string, err: string, attemptsMade: number): void {
    this.increment('job_failed');
    this.logger.error({
      msg: 'notification.evaluation.job_failed',
      organizationId,
      runId,
      attemptsMade,
      error: err,
    });
  }

  logRunCompleted(result: NotificationEvaluationRunResult): void {
    this.logger.log({
      msg: 'notification.evaluation.run_completed',
      runId: result.runId,
      organizationId: result.organizationId,
      triggerType: result.triggerType,
      skipped: result.skipped ?? false,
      skipReason: result.skipReason,
      followUpScheduled: result.followUpScheduled ?? false,
      durationMs: result.durationMs,
      insightsRunId: result.insightsRunId,
      publishedCount: result.publishedCount,
      stats: result.stats,
    });
  }

  logDuplicatePrevented(organizationId: string, fingerprint: string): void {
    this.increment('duplicate_prevented');
    this.logger.debug({
      msg: 'notification.evaluation.duplicate_prevented',
      organizationId,
      fingerprint,
    });
  }

  /** Test helper — not for production metrics export. */
  getCounter(metric: NotificationRuntimeMetric): number {
    return this.counters.get(metric) ?? 0;
  }

  resetCounters(): void {
    this.counters.clear();
  }
}
