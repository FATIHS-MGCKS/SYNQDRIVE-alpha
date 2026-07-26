import { Injectable, Logger } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  recordNotificationCandidate,
  recordNotificationCandidateRejected,
  recordNotificationIngestDuration,
  recordNotificationIngestFailure,
  recordNotificationIngestOperationMetric,
  recordNotificationApiRequest,
  type NotificationIngestOperation,
} from './notification-prometheus.metrics';
import { buildNotificationLogFields } from './notification-observability.util';

@Injectable()
export class NotificationIngestObservabilityService {
  private readonly logger = new Logger(NotificationIngestObservabilityService.name);

  constructor(private readonly metrics: TripMetricsService) {}

  recordCandidate(input: {
    organizationId: string;
    sourceType: string;
    eventType: string;
    correlationId?: string;
  }): void {
    recordNotificationCandidate(this.metrics, {
      sourceType: input.sourceType,
      eventType: input.eventType,
    });
    this.logger.debug(
      buildNotificationLogFields({
        msg: 'notification.ingest.candidate',
        organizationId: input.organizationId,
        action: 'candidate',
        result: 'success',
        correlationId: input.correlationId,
        eventType: input.eventType,
      }),
    );
  }

  recordCandidateRejected(input: {
    organizationId: string;
    reason: string;
    eventType?: string;
    correlationId?: string;
  }): void {
    recordNotificationCandidateRejected(this.metrics, input.reason);
    this.logger.debug(
      buildNotificationLogFields({
        msg: 'notification.ingest.candidate_rejected',
        organizationId: input.organizationId,
        action: 'candidate',
        result: 'skipped',
        correlationId: input.correlationId,
        eventType: input.eventType,
        errorCode: input.reason,
      }),
    );
  }

  recordIngestOperation(input: {
    organizationId: string;
    operation: NotificationIngestOperation;
    domain: string;
    eventType: string;
    notificationId?: string;
    correlationId?: string;
    latencyMs?: number;
  }): void {
    recordNotificationIngestOperationMetric(this.metrics, input.operation, input.domain);
    if (input.latencyMs != null) {
      recordNotificationIngestDuration(
        this.metrics,
        input.eventType,
        input.latencyMs / 1000,
      );
    }
    this.logger.log(
      buildNotificationLogFields({
        msg: `notification.ingest.${input.operation}`,
        organizationId: input.organizationId,
        action: input.operation,
        result: input.operation === 'ignored' ? 'ignored' : 'success',
        correlationId: input.correlationId,
        eventType: input.eventType,
        notificationId: input.notificationId,
        domain: input.domain,
        latencyMs: input.latencyMs,
      }),
    );
  }

  recordIngestFailure(input: {
    organizationId: string;
    eventType?: string;
    errorCode: string;
    correlationId?: string;
  }): void {
    recordNotificationIngestFailure(this.metrics, input.errorCode);
    this.logger.warn(
      buildNotificationLogFields({
        msg: 'notification.ingest.failure',
        organizationId: input.organizationId,
        action: 'ingest',
        result: 'error',
        correlationId: input.correlationId,
        eventType: input.eventType,
        errorCode: input.errorCode,
      }),
    );
  }

  recordApiRequest(input: {
    route: string;
    method: string;
    statusCode: number;
    durationMs: number;
    correlationId?: string;
  }): void {
    const statusClass =
      input.statusCode >= 500 ? '5xx' : input.statusCode >= 400 ? '4xx' : '2xx';
    const result = input.statusCode >= 400 ? 'error' : 'success';
    recordNotificationApiRequest(
      this.metrics,
      { route: input.route, method: input.method, statusClass, result },
      input.durationMs / 1000,
    );
    const level = result === 'error' ? 'warn' : 'log';
    this.logger[level]({
      msg: 'notification.api.request',
      correlationId: input.correlationId,
      action: input.route,
      result,
      latencyMs: input.durationMs,
      errorCode: statusClass,
    });
  }
}
