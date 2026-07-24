import { Injectable, Logger, Optional } from '@nestjs/common';
import { EvaluationsMetricsService } from './evaluations-metrics.service';
import {
  recordApiRequest,
  recordCacheLookup,
  recordDataSource,
  recordDbQuery,
  recordDetectorRun,
  recordEvaluationJob,
  recordForecast,
  recordForecastDrift,
  recordInsightsRun,
  recordKpiJump,
  recordRedisError,
  recordSchedulerRun,
  isSlowDetector,
  type EvaluationsApiRoute,
  type EvaluationsCacheResult,
  type EvaluationsDriftLevel,
  type EvaluationsFreshness,
  type EvaluationsKpiJumpSeverity,
  type EvaluationsResult,
} from './evaluations-prometheus.metrics';
import { classifyInsightCountJump } from './evaluations-kpi-anomaly.util';
import { sourcesForDetector } from './evaluations-detector-sources';

export interface EvaluationsLogContext {
  correlationId: string;
  runId?: string;
  triggerClass?: string;
  route?: EvaluationsApiRoute;
}

/**
 * Structured Auswertungen pipeline observability — no PII in log fields.
 * organizationId is hashed to a short stable prefix for correlation only.
 */
@Injectable()
export class EvaluationsObservabilityService {
  private readonly logger = new Logger(EvaluationsObservabilityService.name);

  constructor(
    @Optional() private readonly metricsService: EvaluationsMetricsService | null,
  ) {}

  private get metrics(): EvaluationsMetricsService | null {
    return this.metricsService;
  }

  createCorrelationId(seed?: string): string {
    if (seed) return `eval-${seed.slice(0, 8)}`;
    return `eval-${Date.now().toString(36)}`;
  }

  orgRef(organizationId: string): string {
    return organizationId.slice(0, 8);
  }

  observeApi(
    ctx: EvaluationsLogContext,
    labels: { route: EvaluationsApiRoute; method: string; statusCode: number; result: EvaluationsResult },
    durationMs: number,
  ): void {
    const durationSeconds = durationMs / 1000;
    if (this.metrics) {
      recordApiRequest(this.metrics, labels, durationSeconds);
    }
    const level = labels.result === 'error' ? 'warn' : 'log';
    this.logger[level]({
      msg: 'evaluations.api.request',
      correlationId: ctx.correlationId,
      route: labels.route,
      method: labels.method,
      statusCode: labels.statusCode,
      result: labels.result,
      durationMs,
    });
  }

  observeDetector(
    ctx: EvaluationsLogContext,
    detector: string,
    durationMs: number,
    error?: unknown,
  ): void {
    const durationSeconds = durationMs / 1000;
    const result = error ? 'error' : isSlowDetector(durationSeconds) ? 'slow' : 'success';
    if (this.metrics) {
      recordDetectorRun(this.metrics, detector, result, durationSeconds);
      if (error) {
        for (const source of sourcesForDetector(detector)) {
          recordDataSource(this.metrics, source, 'error');
        }
      }
    }
    if (error) {
      this.logger.warn({
        msg: 'evaluations.detector.failed',
        correlationId: ctx.correlationId,
        runId: ctx.runId,
        detector,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      });
    } else if (result === 'slow') {
      this.logger.warn({
        msg: 'evaluations.detector.slow',
        correlationId: ctx.correlationId,
        runId: ctx.runId,
        detector,
        durationMs,
      });
    }
  }

  observeInsightsRun(
    ctx: EvaluationsLogContext,
    triggerClass: string,
    result: EvaluationsResult,
    durationMs: number,
    publishedCount: number,
    detectorFailureCount: number,
  ): void {
    if (this.metrics) {
      recordInsightsRun(this.metrics, triggerClass, result, durationMs / 1000, publishedCount);
    }
    this.logger.log({
      msg: 'evaluations.insights.run_completed',
      correlationId: ctx.correlationId,
      runId: ctx.runId,
      triggerClass,
      result,
      durationMs,
      publishedCount,
      detectorFailureCount,
    });
  }

  observeScheduler(
    ctx: EvaluationsLogContext,
    trigger: string,
    result: EvaluationsResult,
    orgsEnqueued: number,
    durationMs: number,
    error?: unknown,
  ): void {
    if (this.metrics) {
      recordSchedulerRun(this.metrics, trigger, result, orgsEnqueued);
    }
    if (result === 'error') {
      this.logger.error({
        msg: 'evaluations.scheduler.failed',
        correlationId: ctx.correlationId,
        trigger,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      });
    } else {
      this.logger.log({
        msg: 'evaluations.scheduler.enqueued',
        correlationId: ctx.correlationId,
        trigger,
        orgsEnqueued,
        durationMs,
      });
    }
  }

  observeEvaluationJob(
    ctx: EvaluationsLogContext,
    triggerClass: string,
    result: EvaluationsResult,
    durationMs: number,
    skipped?: boolean,
  ): void {
    if (this.metrics) {
      recordEvaluationJob(this.metrics, triggerClass, result, durationMs / 1000);
    }
    this.logger.log({
      msg: 'evaluations.job.completed',
      correlationId: ctx.correlationId,
      runId: ctx.runId,
      triggerClass,
      result,
      durationMs,
      skipped: skipped ?? false,
    });
  }

  recordRedisFailure(operation: string, ctx?: EvaluationsLogContext): void {
    if (this.metrics) recordRedisError(this.metrics, operation);
    this.logger.warn({
      msg: 'evaluations.redis.error',
      correlationId: ctx?.correlationId,
      operation,
    });
  }

  recordCache(cache: 'policy' | 'coalesce' | 'insights_read', result: EvaluationsCacheResult): void {
    if (this.metrics) recordCacheLookup(this.metrics, cache, result);
  }

  recordSourceFreshness(source: string, freshness: EvaluationsFreshness): void {
    if (this.metrics) recordDataSource(this.metrics, source, freshness);
  }

  observeDbQuery(operation: string, durationMs: number, error?: unknown): void {
    const result: EvaluationsResult = error ? 'error' : 'success';
    if (this.metrics) recordDbQuery(this.metrics, operation, result, durationMs / 1000);
    if (error) {
      this.logger.warn({
        msg: 'evaluations.db.query_error',
        operation,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  recordInsightCountJump(previousCount: number, currentCount: number, ctx: EvaluationsLogContext): EvaluationsKpiJumpSeverity {
    const severity = classifyInsightCountJump(previousCount, currentCount);
    if (this.metrics) recordKpiJump(this.metrics, severity);
    if (severity !== 'none') {
      this.logger.warn({
        msg: 'evaluations.kpi.jump_detected',
        correlationId: ctx.correlationId,
        runId: ctx.runId,
        severity,
        previousCount,
        currentCount,
      });
    }
    return severity;
  }

  recordForecastOperation(operation: string, result: EvaluationsResult | 'skipped' | 'unavailable'): void {
    if (this.metrics) recordForecast(this.metrics, operation, result);
    if (result === 'error' || result === 'unavailable') {
      this.logger.warn({ msg: 'evaluations.forecast.issue', operation, result });
    }
  }

  recordForecastModelDrift(level: EvaluationsDriftLevel, model: string): void {
    if (this.metrics) recordForecastDrift(this.metrics, level);
    if (level !== 'none') {
      this.logger.warn({ msg: 'evaluations.forecast.drift', level, model });
    }
  }

  /** Placeholder hook for future fc.* forecast engine — marks unavailable until backend exists. */
  markForecastUnavailable(operation: string): void {
    this.recordForecastOperation(operation, 'unavailable');
  }
}
