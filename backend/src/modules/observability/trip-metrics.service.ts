import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';
import { RuntimeStatusRegistry } from './runtime-status.registry';

/**
 * TripMetricsService
 *
 * Prometheus observability layer for the SynqDrive trip lifecycle.
 * Exposes counters, gauges, and histograms for:
 * - Trip lifecycle (start candidates, confirmations, finalizations, discards)
 * - Detector latency
 * - Enrichment pipeline (pending, failed)
 * - Queue lag
 * - Reconciliation/repair actions
 * - Snapshot health (empty, stale)
 * - Anomaly detection
 *
 * Exposes the standard Prometheus /metrics endpoint via the registry.
 */
@Injectable()
export class TripMetricsService implements OnModuleInit {
  readonly registry: Registry;

  // ═══════════════════════════════════════════════════════════════
  //  COUNTERS
  // ═══════════════════════════════════════════════════════════════

  readonly tripStartCandidates: Counter<string>;
  readonly tripStartsConfirmed: Counter<string>;
  readonly tripFinalized: Counter<string>;
  readonly tripDiscarded: Counter<string>;
  readonly enrichmentFailed: Counter<string>;
  readonly repairActions: Counter<string>;
  readonly emptySnapshots: Counter<string>;
  readonly staleSnapshots: Counter<string>;
  readonly duplicateCandidates: Counter<string>;
  readonly missingTripCandidates: Counter<string>;
  readonly missingEndCandidates: Counter<string>;
  readonly tripQualityAnomalies: Counter<string>;
  readonly clickHouseMirrorWrites: Counter<string>;
  readonly clickHouseAnalyticsQueries: Counter<string>;
  readonly tripEvidencePaths: Counter<string>;
  readonly tripAssignmentResolutions: Counter<string>;
  readonly tripScoreDrift: Counter<string>;
  readonly tripCounterAnomalies: Counter<string>;

  // ═══════════════════════════════════════════════════════════════
  //  GAUGES
  // ═══════════════════════════════════════════════════════════════

  readonly enrichmentPending: Gauge<string>;
  readonly possibleEndStuck: Gauge<string>;
  readonly clickHouseConfigured: Gauge<string>;
  readonly clickHouseAvailable: Gauge<string>;
  readonly workerRuntimeEnabled: Gauge<string>;
  readonly clickHouseLastMirrorUnixSeconds: Gauge<string>;

  // ═══════════════════════════════════════════════════════════════
  //  HISTOGRAMS
  // ═══════════════════════════════════════════════════════════════

  readonly tripFinalizeLatency: Histogram<string>;
  readonly detectorLatency: Histogram<string>;
  readonly queueLag: Histogram<string>;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });

    this.tripStartCandidates = new Counter({
      name: 'synqdrive_trip_start_candidates_total',
      help: 'Total snapshot evaluations that triggered a POSSIBLE_START candidate',
      labelNames: ['profile', 'detector'],
      registers: [this.registry],
    });

    this.tripStartsConfirmed = new Counter({
      name: 'synqdrive_trip_starts_confirmed_total',
      help: 'Total trips confirmed as ACTIVE_TRIP',
      labelNames: ['profile', 'mode'],
      registers: [this.registry],
    });

    this.tripFinalized = new Counter({
      name: 'synqdrive_trip_finalized_total',
      help: 'Total trips finalized as COMPLETED',
      labelNames: ['profile', 'quality', 'source'],
      registers: [this.registry],
    });

    this.tripDiscarded = new Counter({
      name: 'synqdrive_trip_discarded_total',
      help: 'Total trips discarded/cancelled',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.enrichmentFailed = new Counter({
      name: 'synqdrive_enrichment_failed_total',
      help: 'Total behavior enrichment failures',
      labelNames: ['stage'],
      registers: [this.registry],
    });

    this.repairActions = new Counter({
      name: 'synqdrive_repair_actions_total',
      help: 'Total repair actions taken by the reconciliation layer',
      labelNames: ['type', 'result'],
      registers: [this.registry],
    });

    this.emptySnapshots = new Counter({
      name: 'synqdrive_empty_snapshots_total',
      help: 'Total DIMO snapshots with no signalsLatest',
      labelNames: ['vehicle_profile'],
      registers: [this.registry],
    });

    this.staleSnapshots = new Counter({
      name: 'synqdrive_stale_snapshots_total',
      help: 'Total DIMO snapshots where data age exceeds stale threshold',
      labelNames: ['vehicle_profile'],
      registers: [this.registry],
    });

    this.duplicateCandidates = new Counter({
      name: 'synqdrive_duplicate_trip_candidates_total',
      help: 'Total trip candidates rejected due to overlap detection',
      registers: [this.registry],
    });

    this.missingTripCandidates = new Counter({
      name: 'synqdrive_missing_trip_candidates_total',
      help: 'Total missing trip candidates detected by reconciliation',
      labelNames: ['tier'],
      registers: [this.registry],
    });

    this.missingEndCandidates = new Counter({
      name: 'synqdrive_missing_end_candidates_total',
      help: 'Total trips found with missing end time during reconciliation',
      registers: [this.registry],
    });

    this.tripQualityAnomalies = new Counter({
      name: 'synqdrive_trip_quality_anomalies_total',
      help: 'Total trips flagged with quality anomalies',
      labelNames: ['anomaly_type'],
      registers: [this.registry],
    });

    this.clickHouseMirrorWrites = new Counter({
      name: 'synqdrive_clickhouse_mirror_writes_total',
      help: 'Total best-effort ClickHouse mirror write attempts by table/result',
      labelNames: ['table', 'result'],
      registers: [this.registry],
    });

    this.clickHouseAnalyticsQueries = new Counter({
      name: 'synqdrive_clickhouse_analytics_queries_total',
      help: 'Total ClickHouse analytics query executions by query/result',
      labelNames: ['query', 'result'],
      registers: [this.registry],
    });

    this.tripEvidencePaths = new Counter({
      name: 'synqdrive_trip_evidence_paths_total',
      help: 'Total trip decisions by evidence path used',
      labelNames: ['phase', 'path'],
      registers: [this.registry],
    });

    this.tripAssignmentResolutions = new Counter({
      name: 'synqdrive_trip_assignment_resolutions_total',
      help: 'Total canonical trip assignment resolutions by status and eligibility',
      labelNames: ['status', 'score_eligible'],
      registers: [this.registry],
    });

    this.tripScoreDrift = new Counter({
      name: 'synqdrive_trip_score_drift_total',
      help: 'Total observed drift between legacy VehicleTrip score and canonical style score',
      labelNames: ['bucket'],
      registers: [this.registry],
    });

    this.tripCounterAnomalies = new Counter({
      name: 'synqdrive_trip_counter_anomalies_total',
      help: 'Total canonical trip counter anomalies detected during enrichment',
      labelNames: ['anomaly_type', 'source'],
      registers: [this.registry],
    });

    this.enrichmentPending = new Gauge({
      name: 'synqdrive_enrichment_pending',
      help: 'Current number of trips pending behavior enrichment',
      registers: [this.registry],
    });

    this.possibleEndStuck = new Gauge({
      name: 'synqdrive_possible_end_stuck',
      help: 'Number of vehicles currently stuck in POSSIBLE_END state',
      labelNames: ['vehicle_profile'],
      registers: [this.registry],
    });

    this.clickHouseConfigured = new Gauge({
      name: 'synqdrive_clickhouse_configured',
      help: 'Whether ClickHouse is configured via environment variables',
      registers: [this.registry],
    });

    this.clickHouseAvailable = new Gauge({
      name: 'synqdrive_clickhouse_available',
      help: 'Whether ClickHouse is currently reachable and enabled',
      registers: [this.registry],
    });

    this.workerRuntimeEnabled = new Gauge({
      name: 'synqdrive_worker_runtime_enabled',
      help: 'Whether BullMQ workers were enabled at backend bootstrap time',
      registers: [this.registry],
    });

    this.clickHouseLastMirrorUnixSeconds = new Gauge({
      name: 'synqdrive_clickhouse_last_mirror_unix_seconds',
      help: 'Unix timestamp of the last successful ClickHouse mirror write per table',
      labelNames: ['table'],
      registers: [this.registry],
    });

    this.tripFinalizeLatency = new Histogram({
      name: 'synqdrive_trip_finalize_latency_seconds',
      help: 'Time from trip start to finalization in seconds',
      buckets: [60, 300, 900, 1800, 3600, 7200, 18000],
      labelNames: ['profile'],
      registers: [this.registry],
    });

    this.detectorLatency = new Histogram({
      name: 'synqdrive_detector_latency_seconds',
      help: 'Time taken by a detector to execute in seconds',
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 15],
      labelNames: ['detector'],
      registers: [this.registry],
    });

    this.queueLag = new Histogram({
      name: 'synqdrive_queue_lag_seconds',
      help: 'Time from job creation to job processing start in seconds',
      buckets: [1, 5, 15, 60, 300, 900],
      labelNames: ['queue'],
      registers: [this.registry],
    });
  }

  async onModuleInit(): Promise<void> {
    this.workerRuntimeEnabled.set(
      RuntimeStatusRegistry.getWorkersEnabled() ? 1 : 0,
    );
  }

  /** Returns the Prometheus metrics text for the /metrics endpoint. */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
