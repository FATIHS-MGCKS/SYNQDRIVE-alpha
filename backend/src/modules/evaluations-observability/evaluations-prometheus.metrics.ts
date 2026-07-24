import type { EvaluationsMetricsService } from './evaluations-metrics.service';

export type EvaluationsApiRoute =
  | 'dashboard_insights'
  | 'dashboard_insights_summary'
  | 'data_analyse'
  | 'evaluations_metrics_registry'
  | 'evaluations_metrics_lookup'
  | 'admin_insights_run';

export type EvaluationsResult = 'success' | 'error' | 'not_found';
export type EvaluationsFreshness = 'fresh' | 'stale' | 'missing' | 'degraded' | 'error';
export type EvaluationsCacheResult = 'hit' | 'miss' | 'error';
export type EvaluationsDriftLevel = 'none' | 'warning' | 'critical';
export type EvaluationsKpiJumpSeverity = 'none' | 'moderate' | 'severe';

const SLOW_DB_QUERY_SECONDS = 1;
const SLOW_DETECTOR_SECONDS = 2;

export function statusClassFromCode(statusCode: number): string {
  if (statusCode >= 500) return '5xx';
  if (statusCode >= 400) return '4xx';
  if (statusCode >= 300) return '3xx';
  return '2xx';
}

export function recordApiRequest(
  metrics: EvaluationsMetricsService,
  labels: { route: EvaluationsApiRoute; method: string; statusCode: number; result: EvaluationsResult },
  durationSeconds: number,
): void {
  const statusClass = statusClassFromCode(labels.statusCode);
  metrics.apiRequestDuration.observe(
    { route: labels.route, method: labels.method, result: labels.result },
    durationSeconds,
  );
  metrics.apiRequestsTotal.inc({
    route: labels.route,
    method: labels.method,
    status_class: statusClass,
    result: labels.result,
  });
}

export function recordDetectorRun(
  metrics: EvaluationsMetricsService,
  detector: string,
  result: 'success' | 'error' | 'slow',
  durationSeconds: number,
): void {
  metrics.detectorDuration.observe({ detector, result }, durationSeconds);
  metrics.detectorRunsTotal.inc({ detector, result });
}

export function isSlowDetector(durationSeconds: number): boolean {
  return durationSeconds >= SLOW_DETECTOR_SECONDS;
}

export function recordInsightsRun(
  metrics: EvaluationsMetricsService,
  triggerClass: string,
  result: EvaluationsResult,
  durationSeconds: number,
  publishedCount: number,
): void {
  metrics.insightsRunDuration.observe({ trigger_class: triggerClass, result }, durationSeconds);
  metrics.insightsRunsTotal.inc({ trigger_class: triggerClass, result });
  if (result === 'success' && publishedCount > 0) {
    metrics.insightsPublishedTotal.inc(publishedCount);
  }
}

export function recordSchedulerRun(
  metrics: EvaluationsMetricsService,
  trigger: string,
  result: EvaluationsResult,
  orgsEnqueued: number,
): void {
  metrics.schedulerRunsTotal.inc({ trigger, result });
  if (result === 'success') {
    metrics.schedulerOrgsEnqueued.set(orgsEnqueued);
  }
}

export function recordEvaluationJob(
  metrics: EvaluationsMetricsService,
  triggerClass: string,
  result: EvaluationsResult,
  durationSeconds: number,
): void {
  metrics.jobDuration.observe({ trigger_class: triggerClass, result }, durationSeconds);
}

export function recordRedisError(metrics: EvaluationsMetricsService, operation: string): void {
  metrics.redisErrorsTotal.inc({ operation });
}

export function recordCacheLookup(
  metrics: EvaluationsMetricsService,
  cache: 'policy' | 'coalesce' | 'insights_read',
  result: EvaluationsCacheResult,
): void {
  metrics.cacheTotal.inc({ cache, result });
}

export function recordDataSource(
  metrics: EvaluationsMetricsService,
  source: string,
  freshness: EvaluationsFreshness,
): void {
  metrics.dataSourceTotal.inc({ source, freshness });
  if (freshness === 'missing') {
    metrics.sourceMissingTotal.inc({ source });
  }
}

export function recordDbQuery(
  metrics: EvaluationsMetricsService,
  operation: string,
  result: EvaluationsResult,
  durationSeconds: number,
): void {
  metrics.dbQueryDuration.observe({ operation, result }, durationSeconds);
  if (durationSeconds >= SLOW_DB_QUERY_SECONDS) {
    metrics.dbSlowQueriesTotal.inc({ operation });
  }
}

export function recordForecast(
  metrics: EvaluationsMetricsService,
  operation: string,
  result: EvaluationsResult | 'skipped' | 'unavailable',
): void {
  metrics.forecastTotal.inc({ operation, result });
}

export function recordForecastDrift(
  metrics: EvaluationsMetricsService,
  level: EvaluationsDriftLevel,
): void {
  metrics.forecastDriftTotal.inc({ level });
}

export function recordKpiJump(
  metrics: EvaluationsMetricsService,
  severity: EvaluationsKpiJumpSeverity,
): void {
  metrics.kpiJumpTotal.inc({ severity });
}
