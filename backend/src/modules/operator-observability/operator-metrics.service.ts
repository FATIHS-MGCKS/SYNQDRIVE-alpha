import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

/**
 * Operator WebApp Prometheus metrics — bounded labels only.
 * Never label with userId, customerId, bookingId, or raw organizationId.
 */
@Injectable()
export class OperatorMetricsService {
  readonly apiRequestsTotal: Counter<string>;
  readonly apiRequestDuration: Histogram<string>;
  readonly handoverTotal: Counter<string>;
  readonly idempotencyReplayTotal: Counter<string>;
  readonly versionConflictTotal: Counter<string>;
  readonly draftSaveFailureTotal: Counter<string>;
  readonly uploadTotal: Counter<string>;
  readonly uploadFailureTotal: Counter<string>;
  readonly ocrFailureTotal: Counter<string>;
  readonly documentVerificationFailureTotal: Counter<string>;
  readonly authDenialTotal: Counter<string>;
  readonly taskCompletionFailureTotal: Counter<string>;
  readonly outboxFailureTotal: Counter<string>;
  readonly orphanCleanupTotal: Counter<string>;
  readonly retentionJobFailureTotal: Counter<string>;
  readonly uploadQueueBacklog: Gauge<string>;
  readonly outboxBacklog: Gauge<string>;
  readonly storageHealth: Gauge<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;

    this.apiRequestsTotal = new Counter({
      name: 'synqdrive_operator_api_requests_total',
      help: 'Operator WebApp API requests',
      labelNames: ['route', 'method', 'status_class', 'result'],
      registers: [register],
    });

    this.apiRequestDuration = new Histogram({
      name: 'synqdrive_operator_api_request_duration_seconds',
      help: 'Operator WebApp API request duration',
      labelNames: ['route', 'method', 'result'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
      registers: [register],
    });

    this.handoverTotal = new Counter({
      name: 'synqdrive_operator_handover_total',
      help: 'Operator handover lifecycle events',
      labelNames: ['kind', 'event', 'error_code'],
      registers: [register],
    });

    this.idempotencyReplayTotal = new Counter({
      name: 'synqdrive_operator_idempotency_replay_total',
      help: 'Idempotent replay responses served to operator clients',
      labelNames: ['scope'],
      registers: [register],
    });

    this.versionConflictTotal = new Counter({
      name: 'synqdrive_operator_version_conflict_total',
      help: 'Optimistic locking / version conflicts on operator mutations',
      labelNames: ['surface'],
      registers: [register],
    });

    this.draftSaveFailureTotal = new Counter({
      name: 'synqdrive_operator_draft_save_failure_total',
      help: 'Operator handover draft persistence failures',
      labelNames: ['reason'],
      registers: [register],
    });

    this.uploadTotal = new Counter({
      name: 'synqdrive_operator_upload_total',
      help: 'Operator document upload outcomes',
      labelNames: ['outcome'],
      registers: [register],
    });

    this.uploadFailureTotal = new Counter({
      name: 'synqdrive_operator_upload_failure_total',
      help: 'Operator document upload failures',
      labelNames: ['error_code'],
      registers: [register],
    });

    this.ocrFailureTotal = new Counter({
      name: 'synqdrive_operator_ocr_failure_total',
      help: 'OCR processing failures for operator uploads',
      labelNames: ['error_code', 'retryable'],
      registers: [register],
    });

    this.documentVerificationFailureTotal = new Counter({
      name: 'synqdrive_operator_document_verification_failure_total',
      help: 'Manual pickup document verification failures',
      labelNames: ['reason'],
      registers: [register],
    });

    this.authDenialTotal = new Counter({
      name: 'synqdrive_operator_auth_denial_total',
      help: 'Unauthorized/forbidden/tenant-scope denials on operator routes',
      labelNames: ['reason'],
      registers: [register],
    });

    this.taskCompletionFailureTotal = new Counter({
      name: 'synqdrive_operator_task_completion_failure_total',
      help: 'Operator task completion failures',
      labelNames: ['error_code'],
      registers: [register],
    });

    this.outboxFailureTotal = new Counter({
      name: 'synqdrive_operator_outbox_failure_total',
      help: 'Outbox processing failures affecting operator workflows',
      labelNames: ['outbox_type', 'error_code'],
      registers: [register],
    });

    this.orphanCleanupTotal = new Counter({
      name: 'synqdrive_operator_orphan_cleanup_total',
      help: 'Operator orphan extraction cleanup outcomes',
      labelNames: ['outcome'],
      registers: [register],
    });

    this.retentionJobFailureTotal = new Counter({
      name: 'synqdrive_operator_retention_job_failure_total',
      help: 'Operator data retention job failures',
      labelNames: ['phase'],
      registers: [register],
    });

    this.uploadQueueBacklog = new Gauge({
      name: 'synqdrive_operator_upload_queue_backlog',
      help: 'Waiting jobs in document.extraction queue (operator uploads)',
      registers: [register],
    });

    this.outboxBacklog = new Gauge({
      name: 'synqdrive_operator_outbox_backlog',
      help: 'Pending task automation outbox rows',
      registers: [register],
    });

    this.storageHealth = new Gauge({
      name: 'synqdrive_operator_storage_health',
      help: '1 when document storage is available for operator uploads, else 0',
      registers: [register],
    });
  }
}
