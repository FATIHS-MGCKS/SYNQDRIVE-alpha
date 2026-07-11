import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationDeliveryChannel,
  NotificationDeliveryTransition,
} from '@prisma/client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

export interface NotificationDeliveryLogEvent {
  notificationId: string;
  organizationId: string;
  eventType: string;
  operation: string;
  statusBefore?: string;
  statusAfter?: string;
  runId?: string;
  deliveryId?: string;
  channel?: NotificationDeliveryChannel;
  attempts?: number;
  errorCode?: string;
}

@Injectable()
export class NotificationDeliveryObservabilityService {
  private readonly logger = new Logger(NotificationDeliveryObservabilityService.name);

  constructor(private readonly metrics: TripMetricsService) {}

  log(event: NotificationDeliveryLogEvent): void {
    this.logger.log({
      msg: `notification.delivery.${event.operation}`,
      ...event,
    });
  }

  logWarn(event: NotificationDeliveryLogEvent): void {
    this.logger.warn({
      msg: `notification.delivery.${event.operation}`,
      ...event,
    });
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

  recordDuplicateConstraint(): void {
    this.metrics.notificationDuplicateConstraintViolation.inc();
  }

  setQueueBacklog(count: number): void {
    this.metrics.notificationQueueBacklog.set(count);
  }

  observeProcessingDuration(seconds: number): void {
    this.metrics.notificationProcessingDuration.observe(seconds);
  }
}
