import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

/**
 * Auswertungen / Business-Insights / Forecast pipeline metrics.
 * Bounded labels only — never orgId, vehicleId, customerId, or PII.
 */
@Injectable()
export class EvaluationsMetricsService {
  readonly apiRequestDuration: Histogram<string>;
  readonly apiRequestsTotal: Counter<string>;
  readonly detectorDuration: Histogram<string>;
  readonly detectorRunsTotal: Counter<string>;
  readonly insightsRunDuration: Histogram<string>;
  readonly insightsRunsTotal: Counter<string>;
  readonly insightsPublishedTotal: Counter<string>;
  readonly schedulerRunsTotal: Counter<string>;
  readonly schedulerOrgsEnqueued: Gauge<string>;
  readonly jobDuration: Histogram<string>;
  readonly redisErrorsTotal: Counter<string>;
  readonly cacheTotal: Counter<string>;
  readonly dataSourceTotal: Counter<string>;
  readonly dbQueryDuration: Histogram<string>;
  readonly dbSlowQueriesTotal: Counter<string>;
  readonly forecastTotal: Counter<string>;
  readonly forecastDriftTotal: Counter<string>;
  readonly kpiJumpTotal: Counter<string>;
  readonly sourceMissingTotal: Counter<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;

    this.apiRequestDuration = new Histogram({
      name: 'synqdrive_evaluations_api_request_duration_seconds',
      help: 'Auswertungen-related API request duration',
      labelNames: ['route', 'method', 'result'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
      registers: [register],
    });

    this.apiRequestsTotal = new Counter({
      name: 'synqdrive_evaluations_api_requests_total',
      help: 'Auswertungen-related API requests',
      labelNames: ['route', 'method', 'status_class', 'result'],
      registers: [register],
    });

    this.detectorDuration = new Histogram({
      name: 'synqdrive_evaluations_detector_duration_seconds',
      help: 'Business-insights detector execution duration',
      labelNames: ['detector', 'result'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20],
      registers: [register],
    });

    this.detectorRunsTotal = new Counter({
      name: 'synqdrive_evaluations_detector_runs_total',
      help: 'Business-insights detector run outcomes',
      labelNames: ['detector', 'result'],
      registers: [register],
    });

    this.insightsRunDuration = new Histogram({
      name: 'synqdrive_evaluations_insights_run_duration_seconds',
      help: 'Full insights evaluation run duration per trigger class',
      labelNames: ['trigger_class', 'result'],
      buckets: [0.5, 1, 2, 5, 10, 20, 40, 60, 120],
      registers: [register],
    });

    this.insightsRunsTotal = new Counter({
      name: 'synqdrive_evaluations_insights_runs_total',
      help: 'Insights evaluation run outcomes',
      labelNames: ['trigger_class', 'result'],
      registers: [register],
    });

    this.insightsPublishedTotal = new Counter({
      name: 'synqdrive_evaluations_insights_published_total',
      help: 'Published dashboard insights (aggregate)',
      registers: [register],
    });

    this.schedulerRunsTotal = new Counter({
      name: 'synqdrive_evaluations_scheduler_runs_total',
      help: 'Business insights scheduler enqueue cycles',
      labelNames: ['trigger', 'result'],
      registers: [register],
    });

    this.schedulerOrgsEnqueued = new Gauge({
      name: 'synqdrive_evaluations_scheduler_orgs_enqueued',
      help: 'Organizations enqueued in the last scheduler cycle',
      registers: [register],
    });

    this.jobDuration = new Histogram({
      name: 'synqdrive_evaluations_job_duration_seconds',
      help: 'notification.evaluation job wall duration',
      labelNames: ['trigger_class', 'result'],
      buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300],
      registers: [register],
    });

    this.redisErrorsTotal = new Counter({
      name: 'synqdrive_evaluations_redis_errors_total',
      help: 'Redis errors in evaluations/notification evaluation path',
      labelNames: ['operation'],
      registers: [register],
    });

    this.cacheTotal = new Counter({
      name: 'synqdrive_evaluations_cache_total',
      help: 'Evaluations pipeline cache lookups',
      labelNames: ['cache', 'result'],
      registers: [register],
    });

    this.dataSourceTotal = new Counter({
      name: 'synqdrive_evaluations_data_source_total',
      help: 'Data source freshness observed during insights runs',
      labelNames: ['source', 'freshness'],
      registers: [register],
    });

    this.dbQueryDuration = new Histogram({
      name: 'synqdrive_evaluations_db_query_duration_seconds',
      help: 'Evaluations DB query duration',
      labelNames: ['operation', 'result'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
      registers: [register],
    });

    this.dbSlowQueriesTotal = new Counter({
      name: 'synqdrive_evaluations_db_slow_queries_total',
      help: 'Evaluations DB queries exceeding slow threshold',
      labelNames: ['operation'],
      registers: [register],
    });

    this.forecastTotal = new Counter({
      name: 'synqdrive_evaluations_forecast_total',
      help: 'Forecast pipeline operations (fc.* metrics)',
      labelNames: ['operation', 'result'],
      registers: [register],
    });

    this.forecastDriftTotal = new Counter({
      name: 'synqdrive_evaluations_forecast_drift_total',
      help: 'Forecast model drift detections',
      labelNames: ['level'],
      registers: [register],
    });

    this.kpiJumpTotal = new Counter({
      name: 'synqdrive_evaluations_kpi_jump_total',
      help: 'Unusual insight-count jumps between runs',
      labelNames: ['severity'],
      registers: [register],
    });

    this.sourceMissingTotal = new Counter({
      name: 'synqdrive_evaluations_source_missing_total',
      help: 'Required data sources missing during insights runs',
      labelNames: ['source'],
      registers: [register],
    });
  }
}
