import { Injectable, Logger, Optional } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { NotificationEvaluationRunResult } from './notification-evaluation.types';
import {
  recordNotificationEvaluationRunDuration,
} from '../observability/notification-prometheus.metrics';
import { buildNotificationLogFields } from '../observability/notification-observability.util';

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

  constructor(@Optional() private readonly metrics?: TripMetricsService) {}

  increment(metric: NotificationRuntimeMetric, by = 1): void {
    this.counters.set(metric, (this.counters.get(metric) ?? 0) + by);
    if (metric === 'lock_contention') {
      this.metrics?.notificationLockContention.inc();
    }
    if (metric === 'duplicate_prevented') {
      this.metrics?.notificationDeduplicated.inc();
    }
  }

  observeRunDuration(durationMs: number, triggerClass?: string): void {
    this.increment('run_duration_ms', durationMs);
    if (this.metrics && triggerClass) {
      recordNotificationEvaluationRunDuration(
        this.metrics,
        triggerClass,
        durationMs / 1000,
      );
    }
    this.logger.log({
      msg: 'notification.evaluation.run_duration',
      action: 'evaluation_run',
      result: 'success',
      latencyMs: durationMs,
      triggerClass,
    });
  }

  logLockAcquired(organizationId: string, runId: string): void {
    this.increment('lock_acquired');
    this.logger.log(
      buildNotificationLogFields({
        msg: 'notification.evaluation.lock_acquired',
        organizationId,
        action: 'lock_acquired',
        result: 'success',
        correlationId: runId,
      }),
    );
  }

  logLockContention(organizationId: string, runId: string, triggerClass: string): void {
    this.increment('lock_contention');
    this.logger.debug(
      buildNotificationLogFields({
        msg: 'notification.evaluation.lock_contention',
        organizationId,
        action: 'lock_contention',
        result: 'skipped',
        correlationId: runId,
        triggerClass,
      }),
    );
  }

  logJobCoalesced(organizationId: string, triggerClass: string, reason: string): void {
    this.increment('job_coalesced');
    this.logger.debug(
      buildNotificationLogFields({
        msg: 'notification.evaluation.job_coalesced',
        organizationId,
        action: 'job_coalesced',
        result: 'skipped',
        triggerClass,
        errorCode: reason,
      }),
    );
  }

  logJobRetried(organizationId: string, runId: string, attempt: number, err: string): void {
    this.increment('job_retried');
    this.logger.warn(
      buildNotificationLogFields({
        msg: 'notification.evaluation.job_retried',
        organizationId,
        action: 'job_retry',
        result: 'error',
        correlationId: runId,
        errorCode: `attempt_${attempt}`,
      }),
    );
  }

  logJobFailed(organizationId: string, runId: string, err: string, attemptsMade: number): void {
    this.increment('job_failed');
    this.logger.error(
      buildNotificationLogFields({
        msg: 'notification.evaluation.job_failed',
        organizationId,
        action: 'evaluation_run',
        result: 'error',
        correlationId: runId,
        errorCode: `attempts_${attemptsMade}`,
      }),
    );
  }

  logRunCompleted(result: NotificationEvaluationRunResult): void {
    this.logger.log({
      ...buildNotificationLogFields({
        msg: 'notification.evaluation.run_completed',
        organizationId: result.organizationId,
        action: 'evaluation_run',
        result: result.skipped ? 'skipped' : 'success',
        correlationId: result.runId,
        latencyMs: result.durationMs,
        errorCode: result.skipReason,
      }),
      triggerType: result.triggerType,
      followUpScheduled: result.followUpScheduled ?? false,
      publishedCount: result.publishedCount,
      stats: result.stats,
    });
  }

  logDuplicatePrevented(organizationId: string, fingerprint: string): void {
    this.increment('duplicate_prevented');
    this.logger.debug(
      buildNotificationLogFields({
        msg: 'notification.evaluation.duplicate_prevented',
        organizationId,
        action: 'duplicate_prevented',
        result: 'ignored',
        errorCode: fingerprint.slice(0, 16),
      }),
    );
  }

  /** Test helper — not for production metrics export. */
  getCounter(metric: NotificationRuntimeMetric): number {
    return this.counters.get(metric) ?? 0;
  }

  resetCounters(): void {
    this.counters.clear();
  }
}
