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
  readonly hfPointsInsertedTotal: Counter<string>;
  readonly hfEventsDetectedTotal: Counter<string>;
  readonly tripEvidencePaths: Counter<string>;
  readonly tripAssignmentResolutions: Counter<string>;
  readonly tripScoreDrift: Counter<string>;
  readonly tripCounterAnomalies: Counter<string>;
  readonly clickHouseMigrationFailures: Counter<string>;
  readonly dimoSnapshotPollTotal: Counter<string>;
  readonly hvSnapshotDuplicatesDiscarded: Counter<string>;
  readonly metricsEndpointRequests: Counter<string>;

  /** Document extraction pipeline — low-cardinality labels only. */
  readonly documentExtractionJobs: Counter<string>;
  readonly documentExtractionFailures: Counter<string>;
  readonly documentExtractionRetries: Counter<string>;
  readonly documentExtractionPages: Counter<string>;
  readonly documentExtractionClassification: Counter<string>;
  readonly documentExtractionApply: Counter<string>;

  /** Notification engine — low-cardinality labels only. */
  readonly notificationsCreated: Counter<string>;
  readonly notificationsUpdated: Counter<string>;
  readonly notificationsResolved: Counter<string>;
  readonly notificationsReopened: Counter<string>;
  readonly notificationOccurrences: Counter<string>;
  readonly notificationDeduplicated: Counter<string>;
  readonly notificationLockContention: Counter<string>;
  readonly notificationDeliveryEnqueued: Counter<string>;
  readonly notificationDeliverySent: Counter<string>;
  readonly notificationDeliveryFailed: Counter<string>;
  readonly notificationDeliveryRetry: Counter<string>;
  readonly notificationDuplicateConstraintViolation: Counter<string>;

  /** Task automation outbox — low-cardinality labels only. */
  readonly taskAutomationOutboxEnqueued: Counter<string>;
  readonly taskAutomationOutboxCompleted: Counter<string>;
  readonly taskAutomationOutboxFailed: Counter<string>;
  readonly taskAutomationOutboxRetry: Counter<string>;
  readonly taskAutomationOutboxRefreshed: Counter<string>;

  /** Driving Intelligence V2 durable jobs (P20). */
  readonly drivingIntelligenceJobCompleted: Counter<string>;
  readonly drivingIntelligenceJobRetry: Counter<string>;
  readonly drivingIntelligenceJobDeadLetter: Counter<string>;
  readonly drivingAnalysisReconciliationActions: Counter<string>;
  readonly drivingCapabilityRefresh: Counter<string>;
  readonly drivingCapabilityTransition: Counter<string>;
  readonly drivingCapabilityDetectorChanged: Counter<string>;
  readonly shadowDetectorRun: Counter<string>;
  readonly shadowDetectorSkipped: Counter<string>;
  readonly shadowDetectorCandidates: Counter<string>;
  readonly shadowDetectorFrameworkSkipped: Counter<string>;
  readonly drivingDecisionSummaryComputed: Counter<string>;
  readonly drivingAnalysisRunsTotal: Counter<string>;
  readonly drivingHealthImpactPublished: Counter<string>;

  /** Battery V2 — low-cardinality labels only (Prompt 68). */
  readonly batteryProviderObservationTotal: Counter<string>;
  readonly batteryProviderDuplicateTotal: Counter<string>;
  readonly batteryJobsTotal: Counter<string>;
  readonly batteryJobsFailedTotal: Counter<string>;
  readonly batteryJobsDeadLetterTotal: Counter<string>;
  readonly batteryV2JobsRetry: Counter<string>;
  readonly batteryV2JobProcessingDuration: Histogram<string>;
  readonly batteryRestWindowsTotal: Counter<string>;
  readonly batteryRestMeasurementsTotal: Counter<string>;
  readonly batteryRestMissedTotal: Counter<string>;
  readonly batteryRestContaminatedTotal: Counter<string>;
  readonly batteryStartProxyTotal: Counter<string>;
  readonly batteryStartInsufficientCoverageTotal: Counter<string>;
  readonly hvRechargeSegmentsTotal: Counter<string>;
  readonly hvChargeSessionsTotal: Counter<string>;
  readonly hvCapacityObservationsTotal: Counter<string>;
  readonly hvCapacitySessionsQualifiedTotal: Counter<string>;
  readonly batteryAssessmentsTotal: Counter<string>;
  readonly batteryPublicationsTotal: Counter<string>;
  readonly batteryV2HvRechargeReconcileErrors: Counter<string>;
  readonly batteryV2HvRechargeProviderDelay: Histogram<string>;
  readonly batteryCapabilitySignalsTotal: Counter<string>;
  readonly hvCapacityMethodConflictTotal: Counter<string>;
  readonly hvCapacityM2SessionCv: Histogram<string>;
  readonly batteryRetentionRunsTotal: Counter<string>;
  readonly batteryRetentionRowsDeletedTotal: Counter<string>;
  readonly batteryRetentionRowsAggregatedTotal: Counter<string>;
  readonly batteryMeasurementDuplicateSkipTotal: Counter<string>;

  // ═══════════════════════════════════════════════════════════════
  //  GAUGES
  // ═══════════════════════════════════════════════════════════════

  readonly enrichmentPending: Gauge<string>;
  readonly documentExtractionQueueAge: Gauge<string>;
  readonly documentExtractionActiveJobs: Gauge<string>;
  readonly possibleEndStuck: Gauge<string>;
  readonly clickHouseConfigured: Gauge<string>;
  readonly clickHouseAvailable: Gauge<string>;
  readonly clickHouseSchemaStatus: Gauge<string>;
  readonly hfMirrorEnabled: Gauge<string>;
  readonly workerRuntimeEnabled: Gauge<string>;
  readonly clickHouseLastMirrorUnixSeconds: Gauge<string>;
  readonly clickHouseTableRows: Gauge<string>;
  readonly queueFailedJobs: Gauge<string>;
  readonly notificationQueueBacklog: Gauge<string>;
  readonly taskAutomationOutboxBacklog: Gauge<string>;
  readonly batteryV2DeadLetterBacklog: Gauge<string>;
  readonly batteryPostgresTableRows: Gauge<string>;

  // ═══════════════════════════════════════════════════════════════
  //  HISTOGRAMS
  // ═══════════════════════════════════════════════════════════════

  readonly tripFinalizeLatency: Histogram<string>;
  /** Seconds from last meaningful movement to trip finalization. */
  readonly tripEndLatencyFromMovement: Histogram<string>;
  readonly detectorLatency: Histogram<string>;
  readonly queueLag: Histogram<string>;
  readonly clickHouseQueryDuration: Histogram<string>;
  readonly clickHouseAnalysisGuard: Counter<string>;
  readonly documentExtractionDuration: Histogram<string>;
  readonly notificationProcessingDuration: Histogram<string>;
  readonly notificationRunDuration: Histogram<string>;
  readonly notificationOpenAge: Histogram<string>;
  readonly taskAutomationOutboxProcessingDuration: Histogram<string>;

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

    this.hfPointsInsertedTotal = new Counter({
      name: 'synqdrive_clickhouse_hf_points_inserted_total',
      help: 'Total high-frequency telemetry points inserted into ClickHouse',
      registers: [this.registry],
    });

    this.hfEventsDetectedTotal = new Counter({
      name: 'synqdrive_clickhouse_hf_events_detected_total',
      help: 'Total high-frequency derived events inserted into ClickHouse',
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

    this.clickHouseMigrationFailures = new Counter({
      name: 'synqdrive_clickhouse_migration_failures_total',
      help: 'Total ClickHouse schema migration failures',
      registers: [this.registry],
    });

    this.dimoSnapshotPollTotal = new Counter({
      name: 'synqdrive_dimo_snapshot_poll_total',
      help: 'Total DIMO snapshot poll worker outcomes',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.hvSnapshotDuplicatesDiscarded = new Counter({
      name: 'synqdrive_hv_snapshot_duplicates_discarded_total',
      help: 'HV battery health snapshots skipped by provider observation dedup policy',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.metricsEndpointRequests = new Counter({
      name: 'synqdrive_metrics_endpoint_requests_total',
      help: 'Total /metrics scrape attempts by result',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.documentExtractionJobs = new Counter({
      name: 'synqdrive_document_extraction_jobs_total',
      help: 'Document extraction pipeline job outcomes by status and stage',
      labelNames: ['status', 'stage'],
      registers: [this.registry],
    });

    this.documentExtractionFailures = new Counter({
      name: 'synqdrive_document_extraction_failures_total',
      help: 'Document extraction failures by stage, error code, and retryability',
      labelNames: ['stage', 'error_code', 'retryable'],
      registers: [this.registry],
    });

    this.documentExtractionRetries = new Counter({
      name: 'synqdrive_document_extraction_retries_total',
      help: 'Document extraction retry attempts by stage',
      labelNames: ['stage'],
      registers: [this.registry],
    });

    this.documentExtractionPages = new Counter({
      name: 'synqdrive_document_extraction_pages_total',
      help: 'Document pages processed by extraction method',
      labelNames: ['method'],
      registers: [this.registry],
    });

    this.documentExtractionClassification = new Counter({
      name: 'synqdrive_document_extraction_classification_total',
      help: 'Document classification outcomes',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.documentExtractionApply = new Counter({
      name: 'synqdrive_document_extraction_apply_total',
      help: 'Document apply outcomes after human confirmation',
      labelNames: ['result'],
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

    this.clickHouseSchemaStatus = new Gauge({
      name: 'synqdrive_clickhouse_schema_status',
      help: 'ClickHouse schema health code: 0=disabled, 1=degraded, 2=schema_error, 3=available',
      registers: [this.registry],
    });

    this.hfMirrorEnabled = new Gauge({
      name: 'synqdrive_hf_mirror_enabled',
      help: 'Whether post-trip HF mirror is enabled via HF_MIRROR_ENABLED',
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

    this.clickHouseTableRows = new Gauge({
      name: 'synqdrive_clickhouse_table_rows',
      help: 'Aggregated active row count per ClickHouse table (from system.parts)',
      labelNames: ['table', 'status'],
      registers: [this.registry],
    });

    this.queueFailedJobs = new Gauge({
      name: 'synqdrive_queue_failed_jobs',
      help: 'Current failed BullMQ job count per queue',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.documentExtractionQueueAge = new Gauge({
      name: 'synqdrive_document_extraction_queue_age_seconds',
      help: 'Age in seconds of the oldest waiting document extraction job',
      registers: [this.registry],
    });

    this.documentExtractionActiveJobs = new Gauge({
      name: 'synqdrive_document_extraction_active_jobs',
      help: 'Currently active document extraction worker jobs',
      registers: [this.registry],
    });

    this.tripFinalizeLatency = new Histogram({
      name: 'synqdrive_trip_finalize_latency_seconds',
      help: 'Time from trip start to finalization in seconds',
      buckets: [60, 300, 900, 1800, 3600, 7200, 18000],
      labelNames: ['profile'],
      registers: [this.registry],
    });

    this.tripEndLatencyFromMovement = new Histogram({
      name: 'synqdrive_trip_end_latency_from_movement_seconds',
      help: 'Time from last meaningful movement to trip finalization in seconds',
      buckets: [30, 60, 120, 180, 300, 600, 900, 1800],
      labelNames: ['profile', 'end_source'],
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

    this.clickHouseQueryDuration = new Histogram({
      name: 'synqdrive_clickhouse_query_duration_seconds',
      help: 'ClickHouse query execution duration in seconds',
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 15],
      labelNames: ['query_type'],
      registers: [this.registry],
    });

    this.clickHouseAnalysisGuard = new Counter({
      name: 'synqdrive_clickhouse_analysis_guard_total',
      help: 'ClickHouse analysis guard outcomes for trip analysis hardening',
      labelNames: ['outcome', 'scope'],
      registers: [this.registry],
    });

    this.documentExtractionDuration = new Histogram({
      name: 'synqdrive_document_extraction_duration_seconds',
      help: 'Document extraction stage duration in seconds',
      buckets: [0.25, 0.5, 1, 2, 5, 15, 30, 60, 120, 300],
      labelNames: ['stage'],
      registers: [this.registry],
    });

    this.notificationsCreated = new Counter({
      name: 'synqdrive_notifications_created_total',
      help: 'Notifications materialized as new OPEN records',
      labelNames: ['domain'],
      registers: [this.registry],
    });

    this.notificationsUpdated = new Counter({
      name: 'synqdrive_notifications_updated_total',
      help: 'Active notifications updated (occurrence/severity)',
      labelNames: ['domain'],
      registers: [this.registry],
    });

    this.notificationsResolved = new Counter({
      name: 'synqdrive_notifications_resolved_total',
      help: 'Notifications transitioned to RESOLVED',
      labelNames: ['domain'],
      registers: [this.registry],
    });

    this.notificationsReopened = new Counter({
      name: 'synqdrive_notifications_reopened_total',
      help: 'Notifications reopened after RESOLVED',
      labelNames: ['domain'],
      registers: [this.registry],
    });

    this.notificationOccurrences = new Counter({
      name: 'synqdrive_notification_occurrences_total',
      help: 'Notification occurrences appended',
      registers: [this.registry],
    });

    this.notificationDeduplicated = new Counter({
      name: 'synqdrive_notification_deduplicated_total',
      help: 'Ingest operations deduplicated without new delivery',
      registers: [this.registry],
    });

    this.notificationLockContention = new Counter({
      name: 'synqdrive_notification_lock_contention_total',
      help: 'Notification evaluation org lock contention events',
      registers: [this.registry],
    });

    this.notificationDeliveryEnqueued = new Counter({
      name: 'synqdrive_notification_delivery_enqueued_total',
      help: 'Outbox delivery rows enqueued',
      labelNames: ['channel', 'transition'],
      registers: [this.registry],
    });

    this.notificationDeliverySent = new Counter({
      name: 'synqdrive_notification_delivery_sent_total',
      help: 'Successful channel deliveries',
      labelNames: ['channel'],
      registers: [this.registry],
    });

    this.notificationDeliveryFailed = new Counter({
      name: 'synqdrive_notification_delivery_failed_total',
      help: 'Failed channel delivery attempts',
      labelNames: ['channel', 'error_code'],
      registers: [this.registry],
    });

    this.notificationDeliveryRetry = new Counter({
      name: 'synqdrive_notification_delivery_retry_total',
      help: 'Delivery retries scheduled',
      labelNames: ['channel'],
      registers: [this.registry],
    });

    this.notificationDuplicateConstraintViolation = new Counter({
      name: 'synqdrive_notification_duplicate_constraint_violation_total',
      help: 'Outbox idempotency unique constraint prevented duplicate delivery',
      registers: [this.registry],
    });

    this.notificationProcessingDuration = new Histogram({
      name: 'synqdrive_notification_processing_duration_seconds',
      help: 'Single outbox delivery processing duration',
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 15, 30],
      registers: [this.registry],
    });

    this.notificationRunDuration = new Histogram({
      name: 'synqdrive_notification_run_duration_seconds',
      help: 'Notification evaluation run duration',
      buckets: [0.5, 1, 2, 5, 15, 30, 60, 120, 300],
      registers: [this.registry],
    });

    this.notificationOpenAge = new Histogram({
      name: 'synqdrive_notification_open_age_seconds',
      help: 'Age distribution of open notifications at observation time',
      buckets: [300, 900, 3600, 14400, 86400, 604800],
      labelNames: ['severity'],
      registers: [this.registry],
    });

    this.notificationQueueBacklog = new Gauge({
      name: 'synqdrive_notification_queue_backlog',
      help: 'Pending or retryable notification delivery outbox rows',
      registers: [this.registry],
    });

    this.taskAutomationOutboxEnqueued = new Counter({
      name: 'synqdrive_task_automation_outbox_enqueued_total',
      help: 'Task automation outbox rows enqueued',
      labelNames: ['rule_id'],
      registers: [this.registry],
    });

    this.taskAutomationOutboxCompleted = new Counter({
      name: 'synqdrive_task_automation_outbox_completed_total',
      help: 'Successful task automation outbox executions',
      labelNames: ['rule_id'],
      registers: [this.registry],
    });

    this.taskAutomationOutboxFailed = new Counter({
      name: 'synqdrive_task_automation_outbox_failed_total',
      help: 'Failed task automation outbox execution attempts',
      labelNames: ['rule_id', 'error_code'],
      registers: [this.registry],
    });

    this.taskAutomationOutboxRetry = new Counter({
      name: 'synqdrive_task_automation_outbox_retry_total',
      help: 'Task automation outbox retries scheduled',
      labelNames: ['rule_id'],
      registers: [this.registry],
    });

    this.taskAutomationOutboxRefreshed = new Counter({
      name: 'synqdrive_task_automation_outbox_refreshed_total',
      help: 'Existing task automation outbox rows refreshed after repeat failure',
      registers: [this.registry],
    });

    this.taskAutomationOutboxBacklog = new Gauge({
      name: 'synqdrive_task_automation_outbox_backlog',
      help: 'Pending or dead-letter task automation outbox rows',
      registers: [this.registry],
    });

    this.taskAutomationOutboxProcessingDuration = new Histogram({
      name: 'synqdrive_task_automation_outbox_processing_duration_seconds',
      help: 'Single task automation outbox processing duration',
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 15, 30],
      registers: [this.registry],
    });

    this.drivingIntelligenceJobCompleted = new Counter({
      name: 'synqdrive_driving_intelligence_job_completed_total',
      help: 'Driving intelligence durable jobs completed successfully',
      labelNames: ['job_type'],
      registers: [this.registry],
    });

    this.drivingIntelligenceJobRetry = new Counter({
      name: 'synqdrive_driving_intelligence_job_retry_total',
      help: 'Driving intelligence durable job retries scheduled',
      labelNames: ['job_type', 'error_code'],
      registers: [this.registry],
    });

    this.drivingIntelligenceJobDeadLetter = new Counter({
      name: 'synqdrive_driving_intelligence_job_dead_letter_total',
      help: 'Driving intelligence durable jobs moved to dead-letter state',
      labelNames: ['job_type', 'error_code'],
      registers: [this.registry],
    });

    this.drivingAnalysisReconciliationActions = new Counter({
      name: 'synqdrive_driving_analysis_reconciliation_actions_total',
      help: 'Driving analysis reconciliation remediations',
      labelNames: ['check_type', 'result'],
      registers: [this.registry],
    });

    this.drivingCapabilityRefresh = new Counter({
      name: 'synqdrive_driving_capability_refresh_total',
      help: 'Driving capability lifecycle refresh attempts',
      labelNames: ['trigger', 'result', 'skipped_reason'],
      registers: [this.registry],
    });

    this.drivingCapabilityTransition = new Counter({
      name: 'synqdrive_driving_capability_transition_total',
      help: 'Capability signal transitions observed during refresh',
      labelNames: ['kind', 'trigger'],
      registers: [this.registry],
    });

    this.drivingCapabilityDetectorChanged = new Counter({
      name: 'synqdrive_driving_capability_detector_changed_total',
      help: 'Detector capability fingerprint changes after refresh',
      labelNames: ['trigger'],
      registers: [this.registry],
    });

    this.shadowDetectorRun = new Counter({
      name: 'synqdrive_shadow_detector_run_total',
      help: 'Shadow detector executions completed',
      labelNames: ['detector_id', 'result'],
      registers: [this.registry],
    });

    this.shadowDetectorSkipped = new Counter({
      name: 'synqdrive_shadow_detector_skipped_total',
      help: 'Shadow detector executions skipped',
      labelNames: ['detector_id', 'reason'],
      registers: [this.registry],
    });

    this.shadowDetectorCandidates = new Counter({
      name: 'synqdrive_shadow_detector_candidates_total',
      help: 'Shadow candidate events produced (not persisted as DrivingEvent)',
      labelNames: ['detector_id'],
      registers: [this.registry],
    });

    this.shadowDetectorFrameworkSkipped = new Counter({
      name: 'synqdrive_shadow_detector_framework_skipped_total',
      help: 'Shadow detector framework skipped entirely',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.drivingDecisionSummaryComputed = new Counter({
      name: 'synqdrive_driving_decision_summary_computed_total',
      help: 'Trip decision summaries computed and persisted',
      labelNames: ['data_basis', 'recommendation'],
      registers: [this.registry],
    });

    this.drivingAnalysisRunsTotal = new Counter({
      name: 'synqdrive_driving_analysis_runs_total',
      help: 'Driving analysis runs completed by type and status',
      labelNames: ['analysis_type', 'status'],
      registers: [this.registry],
    });

    this.drivingHealthImpactPublished = new Counter({
      name: 'synqdrive_driving_health_impact_published_total',
      help: 'Health impact publish jobs that recalculated brake/tire health',
      labelNames: ['eligibility'],
      registers: [this.registry],
    });

    this.batteryProviderObservationTotal = new Counter({
      name: 'synqdrive_battery_provider_observation_total',
      help: 'Battery provider observation classification outcomes',
      labelNames: ['signal', 'outcome'],
      registers: [this.registry],
    });

    this.batteryProviderDuplicateTotal = new Counter({
      name: 'synqdrive_battery_provider_duplicate_total',
      help: 'Battery provider observations discarded as duplicates',
      labelNames: ['signal', 'reason'],
      registers: [this.registry],
    });

    this.batteryJobsTotal = new Counter({
      name: 'synqdrive_battery_jobs_total',
      help: 'Battery V2 jobs enqueued or completed',
      labelNames: ['job_type', 'outcome'],
      registers: [this.registry],
    });

    this.batteryJobsFailedTotal = new Counter({
      name: 'synqdrive_battery_jobs_failed_total',
      help: 'Failed Battery V2 job attempts',
      labelNames: ['job_type', 'error_code'],
      registers: [this.registry],
    });

    this.batteryJobsDeadLetterTotal = new Counter({
      name: 'synqdrive_battery_jobs_dead_letter_total',
      help: 'Battery V2 jobs moved to dead-letter after exhausted retries',
      labelNames: ['job_type', 'error_code'],
      registers: [this.registry],
    });

    this.batteryV2JobsRetry = new Counter({
      name: 'synqdrive_battery_v2_jobs_retry_total',
      help: 'Battery V2 job retries scheduled',
      labelNames: ['job_type', 'error_code'],
      registers: [this.registry],
    });

    this.batteryV2DeadLetterBacklog = new Gauge({
      name: 'synqdrive_battery_v2_dead_letter_backlog',
      help: 'Battery V2 dead-letter rows awaiting operator review',
      registers: [this.registry],
    });

    this.batteryV2JobProcessingDuration = new Histogram({
      name: 'synqdrive_battery_v2_job_processing_duration_seconds',
      help: 'Battery V2 job handler processing duration',
      labelNames: ['job_type'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 15, 30, 60],
      registers: [this.registry],
    });

    this.batteryRestWindowsTotal = new Counter({
      name: 'synqdrive_battery_rest_windows_total',
      help: 'LV rest window lifecycle events',
      labelNames: ['window', 'outcome'],
      registers: [this.registry],
    });

    this.batteryRestMeasurementsTotal = new Counter({
      name: 'synqdrive_battery_rest_measurements_total',
      help: 'LV REST target measurements by window and quality',
      labelNames: ['window', 'quality'],
      registers: [this.registry],
    });

    this.batteryRestMissedTotal = new Counter({
      name: 'synqdrive_battery_rest_missed_total',
      help: 'LV REST targets classified as MISSED',
      labelNames: ['window'],
      registers: [this.registry],
    });

    this.batteryRestContaminatedTotal = new Counter({
      name: 'synqdrive_battery_rest_contaminated_total',
      help: 'LV REST measurements classified as contaminated',
      labelNames: ['window'],
      registers: [this.registry],
    });

    this.batteryStartProxyTotal = new Counter({
      name: 'synqdrive_battery_start_proxy_total',
      help: 'ICE start proxy extraction outcomes',
      labelNames: ['outcome'],
      registers: [this.registry],
    });

    this.batteryStartInsufficientCoverageTotal = new Counter({
      name: 'synqdrive_battery_start_insufficient_coverage_total',
      help: 'Start proxy extractions skipped due to insufficient crank coverage',
      registers: [this.registry],
    });

    this.hvRechargeSegmentsTotal = new Counter({
      name: 'synqdrive_hv_recharge_segments_total',
      help: 'DIMO recharge segments fetched during HV reconcile',
      labelNames: ['trigger', 'outcome'],
      registers: [this.registry],
    });

    this.hvChargeSessionsTotal = new Counter({
      name: 'synqdrive_hv_charge_sessions_total',
      help: 'HV charge sessions persisted during reconcile',
      labelNames: ['trigger', 'change'],
      registers: [this.registry],
    });

    this.hvCapacityObservationsTotal = new Counter({
      name: 'synqdrive_hv_capacity_observations_total',
      help: 'HV capacity shadow observations persisted',
      labelNames: ['quality'],
      registers: [this.registry],
    });

    this.hvCapacitySessionsQualifiedTotal = new Counter({
      name: 'synqdrive_hv_capacity_sessions_qualified_total',
      help: 'HV charge sessions evaluated for capacity shadow qualification',
      labelNames: ['qualified'],
      registers: [this.registry],
    });

    this.batteryAssessmentsTotal = new Counter({
      name: 'synqdrive_battery_assessments_total',
      help: 'Battery health assessments persisted or skipped',
      labelNames: ['scope', 'mode', 'outcome'],
      registers: [this.registry],
    });

    this.batteryPublicationsTotal = new Counter({
      name: 'synqdrive_battery_publications_total',
      help: 'Battery publication update outcomes',
      labelNames: ['maturity', 'outcome'],
      registers: [this.registry],
    });

    this.batteryV2HvRechargeReconcileErrors = new Counter({
      name: 'synqdrive_battery_v2_hv_recharge_reconcile_errors_total',
      help: 'HV recharge reconcile provider errors',
      labelNames: ['trigger', 'error_code'],
      registers: [this.registry],
    });

    this.batteryV2HvRechargeProviderDelay = new Histogram({
      name: 'synqdrive_battery_v2_hv_recharge_provider_delay_seconds',
      help: 'Delay between latest provider segment end and reconcile time',
      labelNames: ['trigger'],
      buckets: [60, 300, 900, 1800, 3600, 7200, 21600, 86400],
      registers: [this.registry],
    });

    this.batteryCapabilitySignalsTotal = new Counter({
      name: 'synqdrive_battery_capability_signals_total',
      help: 'Battery capability preflight signal assessments',
      labelNames: ['signal', 'status'],
      registers: [this.registry],
    });

    this.hvCapacityMethodConflictTotal = new Counter({
      name: 'synqdrive_hv_capacity_method_conflict_total',
      help: 'HV M2/M3 capacity method agreement outcomes',
      labelNames: ['outcome'],
      registers: [this.registry],
    });

    this.hvCapacityM2SessionCv = new Histogram({
      name: 'synqdrive_hv_capacity_m2_session_cv',
      help: 'HV M2 intra-session capacity estimate coefficient of variation',
      buckets: [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5],
      registers: [this.registry],
    });

    this.batteryPostgresTableRows = new Gauge({
      name: 'synqdrive_battery_postgres_table_rows',
      help: 'Battery V2 PostgreSQL table row counts',
      labelNames: ['table'],
      registers: [this.registry],
    });

    this.batteryRetentionRunsTotal = new Counter({
      name: 'synqdrive_battery_retention_runs_total',
      help: 'Battery V2 retention runs completed',
      labelNames: ['dry_run'],
      registers: [this.registry],
    });

    this.batteryRetentionRowsDeletedTotal = new Counter({
      name: 'synqdrive_battery_retention_rows_deleted_total',
      help: 'Battery V2 retention rows deleted',
      registers: [this.registry],
    });

    this.batteryRetentionRowsAggregatedTotal = new Counter({
      name: 'synqdrive_battery_retention_rows_aggregated_total',
      help: 'Battery V2 retention aggregates created',
      registers: [this.registry],
    });

    this.batteryMeasurementDuplicateSkipTotal = new Counter({
      name: 'synqdrive_battery_measurement_duplicate_skip_total',
      help: 'Battery measurement writes skipped as duplicates before insert',
      registers: [this.registry],
    });
  }

  async onModuleInit(): Promise<void> {
    this.workerRuntimeEnabled.set(
      RuntimeStatusRegistry.getWorkersEnabled() ? 1 : 0,
    );
    this.hfMirrorEnabled.set(process.env.HF_MIRROR_ENABLED === 'true' ? 1 : 0);
    this.clickHouseSchemaStatus.set(0);
  }

  /** Returns the Prometheus metrics text for the /metrics endpoint. */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
