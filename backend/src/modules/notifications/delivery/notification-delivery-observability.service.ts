import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationDeliveryChannel,
  NotificationDeliveryTransition,
} from '@prisma/client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  recordNotificationDeadLetter,
  recordNotificationDeliveryAttempt,
  recordNotificationDuplicateConflict,
  setNotificationOutboxPending,
} from '../observability/notification-prometheus.metrics';
import { buildNotificationLogFields } from '../observability/notification-observability.util';

export interface NotificationDeliveryLogEvent {
  notificationId: string;
  organizationId: string;
  eventType: string;
  operation: string;
  statusBefore?: string;
  statusAfter?: string;
  correlationId?: string;
  deliveryId?: string;
  channel?: NotificationDeliveryChannel;
  attempts?: number;
  errorCode?: string;
  latencyMs?: number;
  result?: 'success' | 'error' | 'ignored' | 'skipped';
}

@Injectable()
export class NotificationDeliveryObservabilityService {
  private readonly logger = new Logger(NotificationDeliveryObservabilityService.name);

  constructor(private readonly metrics: TripMetricsService) {}

  log(event: NotificationDeliveryLogEvent): void {
    this.logger.log(
      buildNotificationLogFields({
        msg: `notification.delivery.${event.operation}`,
        organizationId: event.organizationId,
        action: event.operation,
        result: event.result ?? 'success',
        correlationId: event.correlationId,
        eventType: event.eventType,
        notificationId: event.notificationId,
        channel: event.channel,
        deliveryId: event.deliveryId,
        latencyMs: event.latencyMs,
        errorCode: event.errorCode,
      }),
    );
  }

  logWarn(event: NotificationDeliveryLogEvent): void {
    this.logger.warn(
      buildNotificationLogFields({
        msg: `notification.delivery.${event.operation}`,
        organizationId: event.organizationId,
        action: event.operation,
        result: event.result ?? 'error',
        correlationId: event.correlationId,
        eventType: event.eventType,
        notificationId: event.notificationId,
        channel: event.channel,
        deliveryId: event.deliveryId,
        latencyMs: event.latencyMs,
        errorCode: event.errorCode,
      }),
    );
  }

  recordEnqueued(
    channel: NotificationDeliveryChannel,
    transition: NotificationDeliveryTransition,
  ): void {
    this.metrics.notificationDeliveryEnqueued.inc({ channel, transition });
  }

  recordSent(channel: NotificationDeliveryChannel): void {
    this.metrics.notificationDeliverySent.inc({ channel });
  }

  recordFailed(channel: NotificationDeliveryChannel, errorCode: string): void {
    this.metrics.notificationDeliveryFailed.inc({ channel, error_code: errorCode });
  }

  recordRetry(channel: NotificationDeliveryChannel): void {
    this.metrics.notificationDeliveryRetry.inc({ channel });
  }

  recordAttempt(channel: NotificationDeliveryChannel): void {
    recordNotificationDeliveryAttempt(this.metrics, channel);
  }

  recordDeadLetter(channel: NotificationDeliveryChannel, errorCode: string): void {
    recordNotificationDeadLetter(this.metrics, channel, errorCode);
  }

  recordDuplicateConstraint(): void {
    recordNotificationDuplicateConflict(this.metrics);
  }

  setQueueBacklog(count: number): void {
    setNotificationOutboxPending(this.metrics, count);
  }

  observeProcessingDuration(seconds: number): void {
    this.metrics.notificationProcessingDuration.observe(seconds);
  }
}
