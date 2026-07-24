import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { NotificationDeliveryChannel } from '@prisma/client';
import notificationDeliveryConfig from '@config/notification-delivery.config';
import { NotificationDeliveryOutboxRepository } from './notification-delivery-outbox.repository';
import { NotificationChannelDispatcher } from './notification-delivery-channels.service';
import { NotificationDeliveryObservabilityService } from './notification-delivery-observability.service';
import { NotificationEnforcementService } from '@modules/data-authorizations/notification-enforcement/notification-enforcement.service';
import { NOTIFICATION_AUTH_DENY_REASON } from '@modules/data-authorizations/notification-enforcement/notification-enforcement.constants';

@Injectable()
export class NotificationDeliveryProcessorService {
  constructor(
    @Inject(notificationDeliveryConfig.KEY)
    private readonly config: ConfigType<typeof notificationDeliveryConfig>,
    private readonly outboxRepo: NotificationDeliveryOutboxRepository,
    private readonly dispatcher: NotificationChannelDispatcher,
    private readonly observability: NotificationDeliveryObservabilityService,
    @Optional() private readonly notificationEnforcement?: NotificationEnforcementService,
  ) {}

  async processOutboxId(outboxId: string): Promise<'completed' | 'retry' | 'dead_letter' | 'skipped'> {
    const started = Date.now();
    const claimed = await this.outboxRepo.claimForProcessing(outboxId);
    if (!claimed) return 'skipped';

    this.observability.log({
      notificationId: claimed.notificationId,
      organizationId: claimed.organizationId,
      eventType: claimed.eventType,
      operation: 'process_started',
      deliveryId: claimed.id,
      channel: claimed.channel,
      attempts: claimed.attempts,
    });

    if (claimed.channel === NotificationDeliveryChannel.PUSH) {
      await this.outboxRepo.markSuppressed(claimed.id, 'PUSH_NOT_IMPLEMENTED');
      this.observability.logWarn({
        notificationId: claimed.notificationId,
        organizationId: claimed.organizationId,
        eventType: claimed.eventType,
        operation: 'push_deferred',
        deliveryId: claimed.id,
        channel: claimed.channel,
        errorCode: 'PUSH_NOT_IMPLEMENTED',
      });
      return 'skipped';
    }

    if (this.notificationEnforcement) {
      const notification = await this.outboxRepo.findNotificationForDelivery(claimed.notificationId);
      if (notification) {
        const vehicleId =
          notification.entityType === 'VEHICLE'
            ? notification.entityId
            : (notification.actionTarget as Record<string, unknown> | null)?.vehicleId as string | undefined;
        const auth = await this.notificationEnforcement.checkDelivery({
          organizationId: claimed.organizationId,
          eventType: claimed.eventType,
          vehicleId: vehicleId ?? null,
          entityType: notification.entityType,
          entityId: notification.entityId,
          correlationId: `notification-delivery-process:${claimed.id}`,
        });
        if (!auth.mayProceed) {
          const reason =
            auth.reasonCode === NOTIFICATION_AUTH_DENY_REASON.REVOKED
              ? NOTIFICATION_AUTH_DENY_REASON.REVOKED
              : auth.reasonCode;
          await this.outboxRepo.markSuppressed(claimed.id, reason);
          this.observability.logWarn({
            notificationId: claimed.notificationId,
            organizationId: claimed.organizationId,
            eventType: claimed.eventType,
            operation: 'delivery_suppressed_auth',
            deliveryId: claimed.id,
            channel: claimed.channel,
            errorCode: reason,
          });
          return 'skipped';
        }
      }
    }

    const result = await this.dispatcher.deliver(claimed);
    const durationSec = (Date.now() - started) / 1000;
    this.observability.observeProcessingDuration(durationSec);

    if (result.success) {
      await this.outboxRepo.markCompleted(claimed.id, result.outboundEmailId);
      this.observability.recordSent(claimed.channel);
      this.observability.log({
        notificationId: claimed.notificationId,
        organizationId: claimed.organizationId,
        eventType: claimed.eventType,
        operation: 'sent',
        deliveryId: claimed.id,
        channel: claimed.channel,
        attempts: claimed.attempts,
      });
      return 'completed';
    }

    const errorCode = result.errorCode ?? 'UNKNOWN';
    if (!result.retryable || claimed.attempts >= this.config.maxAttempts) {
      await this.outboxRepo.markDeadLetter(
        claimed.id,
        result.errorMessage ?? errorCode,
      );
      this.observability.recordFailed(claimed.channel, errorCode);
      this.observability.logWarn({
        notificationId: claimed.notificationId,
        organizationId: claimed.organizationId,
        eventType: claimed.eventType,
        operation: 'dead_letter',
        deliveryId: claimed.id,
        channel: claimed.channel,
        attempts: claimed.attempts,
        errorCode,
      });
      return 'dead_letter';
    }

    const retryAt = new Date(
      Date.now() + this.config.backoffMs * Math.pow(2, Math.max(0, claimed.attempts - 1)),
    );
    await this.outboxRepo.markRetry(claimed.id, result.errorMessage ?? errorCode, retryAt);
    this.observability.recordRetry(claimed.channel);
    this.observability.recordFailed(claimed.channel, errorCode);
    this.observability.logWarn({
      notificationId: claimed.notificationId,
      organizationId: claimed.organizationId,
      eventType: claimed.eventType,
      operation: 'retry_scheduled',
      deliveryId: claimed.id,
      channel: claimed.channel,
      attempts: claimed.attempts,
      errorCode,
    });
    return 'retry';
  }
}
