import { Injectable, Logger, Optional } from '@nestjs/common';
import { OperatorMetricsService } from './operator-metrics.service';
import {
  normalizeOperatorErrorCode,
  recordOperatorApiRequest,
  recordOperatorHandover,
  type OperatorApiRoute,
  type OperatorAuthDenialReason,
  type OperatorHandoverEvent,
  type OperatorHandoverKind,
  type OperatorOutboxType,
  type OperatorResult,
} from './operator-prometheus.metrics';
import { orgRef } from './operator-observability.util';

export interface OperatorLogContext {
  correlationId: string;
  requestId?: string | null;
  orgRef?: string | null;
  route?: OperatorApiRoute;
}

/**
 * Structured Operator WebApp observability — no PII in log fields.
 * organizationId is shortened to an 8-char ref for correlation only.
 */
@Injectable()
export class OperatorObservabilityService {
  private readonly logger = new Logger(OperatorObservabilityService.name);

  constructor(@Optional() private readonly metricsService: OperatorMetricsService | null) {}

  private get metrics(): OperatorMetricsService | null {
    return this.metricsService;
  }

  createCorrelationId(seed?: string): string {
    if (seed) return `op-${seed.slice(0, 12)}`;
    return `op-${Date.now().toString(36)}`;
  }

  observeApi(
    ctx: OperatorLogContext,
    labels: {
      route: OperatorApiRoute;
      method: string;
      statusCode: number;
      result: OperatorResult;
    },
    durationMs: number,
  ): void {
    if (this.metrics) {
      recordOperatorApiRequest(this.metrics, labels, durationMs / 1000);
    }
    const level = labels.result === 'error' ? 'warn' : 'log';
    this.logger[level]({
      msg: 'operator.api.request',
      correlationId: ctx.correlationId,
      requestId: ctx.requestId ?? null,
      orgRef: ctx.orgRef ?? null,
      route: labels.route,
      method: labels.method,
      statusCode: labels.statusCode,
      result: labels.result,
      durationMs,
    });
  }

  recordHandoverStart(
    ctx: OperatorLogContext,
    kind: OperatorHandoverKind,
    organizationId: string,
  ): void {
    if (this.metrics) recordOperatorHandover(this.metrics, kind, 'start');
    this.logger.log({
      msg: 'operator.handover.start',
      correlationId: ctx.correlationId,
      requestId: ctx.requestId ?? null,
      orgRef: orgRef(organizationId),
      kind,
    });
  }

  recordHandoverCompletion(
    ctx: OperatorLogContext,
    kind: OperatorHandoverKind,
    organizationId: string,
    success: boolean,
    errorCode?: string,
  ): void {
    const event: OperatorHandoverEvent = success ? 'completion_success' : 'completion_failure';
    if (this.metrics) {
      recordOperatorHandover(
        this.metrics,
        kind,
        event,
        success ? undefined : errorCode,
      );
    }
    const payload = {
      msg: success ? 'operator.handover.completed' : 'operator.handover.failed',
      correlationId: ctx.correlationId,
      requestId: ctx.requestId ?? null,
      orgRef: orgRef(organizationId),
      kind,
      errorCode: errorCode ? normalizeOperatorErrorCode(errorCode) : null,
    };
    if (success) this.logger.log(payload);
    else this.logger.warn(payload);
  }

  recordIdempotencyReplay(scope: string, ctx?: OperatorLogContext): void {
    const normalized = normalizeOperatorErrorCode(scope);
    this.metrics?.idempotencyReplayTotal.inc({ scope: normalized });
    this.logger.log({
      msg: 'operator.idempotency.replay',
      correlationId: ctx?.correlationId ?? null,
      requestId: ctx?.requestId ?? null,
      scope: normalized,
    });
  }

  recordVersionConflict(surface: string, ctx?: OperatorLogContext): void {
    const normalized = normalizeOperatorErrorCode(surface);
    this.metrics?.versionConflictTotal.inc({ surface: normalized });
    this.logger.warn({
      msg: 'operator.version_conflict',
      correlationId: ctx?.correlationId ?? null,
      requestId: ctx?.requestId ?? null,
      surface: normalized,
    });
  }

  recordDraftSaveFailure(reason: string, ctx?: OperatorLogContext): void {
    const normalized = normalizeOperatorErrorCode(reason);
    this.metrics?.draftSaveFailureTotal.inc({ reason: normalized });
    this.logger.warn({
      msg: 'operator.draft.save_failed',
      correlationId: ctx?.correlationId ?? null,
      requestId: ctx?.requestId ?? null,
      reason: normalized,
    });
  }

  recordUpload(outcome: 'success' | 'failure', errorCode?: string, ctx?: OperatorLogContext): void {
    this.metrics?.uploadTotal.inc({ outcome });
    if (outcome === 'failure') {
      this.metrics?.uploadFailureTotal.inc({
        error_code: normalizeOperatorErrorCode(errorCode),
      });
      this.logger.warn({
        msg: 'operator.upload.failed',
        correlationId: ctx?.correlationId ?? null,
        requestId: ctx?.requestId ?? null,
        errorCode: normalizeOperatorErrorCode(errorCode),
      });
    } else {
      this.logger.log({
        msg: 'operator.upload.accepted',
        correlationId: ctx?.correlationId ?? null,
        requestId: ctx?.requestId ?? null,
      });
    }
  }

  recordOcrFailure(errorCode: string, retryable: boolean, ctx?: OperatorLogContext): void {
    this.metrics?.ocrFailureTotal.inc({
      error_code: normalizeOperatorErrorCode(errorCode),
      retryable: retryable ? 'true' : 'false',
    });
    this.logger.warn({
      msg: 'operator.ocr.failed',
      correlationId: ctx?.correlationId ?? null,
      requestId: ctx?.requestId ?? null,
      errorCode: normalizeOperatorErrorCode(errorCode),
      retryable,
    });
  }

  recordDocumentVerificationFailure(reason: string, ctx?: OperatorLogContext): void {
    const normalized = normalizeOperatorErrorCode(reason);
    this.metrics?.documentVerificationFailureTotal.inc({ reason: normalized });
    this.logger.warn({
      msg: 'operator.document_verification.failed',
      correlationId: ctx?.correlationId ?? null,
      requestId: ctx?.requestId ?? null,
      reason: normalized,
    });
  }

  recordAuthDenial(reason: OperatorAuthDenialReason, ctx?: OperatorLogContext): void {
    this.metrics?.authDenialTotal.inc({ reason });
    this.logger.warn({
      msg: 'operator.auth.denied',
      correlationId: ctx?.correlationId ?? null,
      requestId: ctx?.requestId ?? null,
      reason,
    });
  }

  recordTaskCompletionFailure(errorCode: string, ctx?: OperatorLogContext): void {
    const normalized = normalizeOperatorErrorCode(errorCode);
    this.metrics?.taskCompletionFailureTotal.inc({ error_code: normalized });
    this.logger.warn({
      msg: 'operator.task.completion_failed',
      correlationId: ctx?.correlationId ?? null,
      requestId: ctx?.requestId ?? null,
      errorCode: normalized,
    });
  }

  recordOutboxFailure(
    outboxType: OperatorOutboxType,
    errorCode: string,
    ctx?: OperatorLogContext,
  ): void {
    const normalized = normalizeOperatorErrorCode(errorCode);
    this.metrics?.outboxFailureTotal.inc({
      outbox_type: outboxType,
      error_code: normalized,
    });
    this.logger.warn({
      msg: 'operator.outbox.failed',
      correlationId: ctx?.correlationId ?? null,
      requestId: ctx?.requestId ?? null,
      outboxType,
      errorCode: normalized,
    });
  }

  recordOrphanCleanup(outcome: 'success' | 'failure', ctx?: OperatorLogContext): void {
    this.metrics?.orphanCleanupTotal.inc({ outcome });
    this.logger.log({
      msg: outcome === 'success' ? 'operator.orphan_cleanup.success' : 'operator.orphan_cleanup.failed',
      correlationId: ctx?.correlationId ?? null,
      requestId: ctx?.requestId ?? null,
      outcome,
    });
  }

  recordRetentionJobFailure(phase: string, ctx?: OperatorLogContext): void {
    const normalized = normalizeOperatorErrorCode(phase);
    this.metrics?.retentionJobFailureTotal.inc({ phase: normalized });
    this.logger.error({
      msg: 'operator.retention.job_failed',
      correlationId: ctx?.correlationId ?? null,
      requestId: ctx?.requestId ?? null,
      phase: normalized,
    });
  }

  setUploadQueueBacklog(count: number): void {
    this.metrics?.uploadQueueBacklog.set(Math.max(0, count));
  }

  setOutboxBacklog(count: number): void {
    this.metrics?.outboxBacklog.set(Math.max(0, count));
  }

  setStorageHealth(healthy: boolean): void {
    this.metrics?.storageHealth.set(healthy ? 1 : 0);
  }
}
