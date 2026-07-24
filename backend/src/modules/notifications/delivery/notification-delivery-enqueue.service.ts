import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  NotificationDeliveryChannel,
  NotificationDeliveryTransition,
  type Notification,
} from '@prisma/client';
import notificationDeliveryConfig from '@config/notification-delivery.config';
import { NotificationEngineConfig } from '../notification-engine.config';
import { NotificationPreferenceService } from '../access/notification-preference.service';
import { NotificationStationScopeService } from '../access/notification-station-scope.service';
import { getEventTypeDefinition } from '../registry/notification-event-registry';
import type { NotificationTx } from '../notification.repository';
import { NotificationDeliveryOutboxRepository } from './notification-delivery-outbox.repository';
import { NotificationDeliveryPolicyService } from './notification-delivery-policy.service';
import { buildDeliveryIdempotencyKey } from './notification-delivery-idempotency.util';
import {
  criticalOverridesQuietHours,
  isWithinQuietHours,
  nextDigestAvailableAt,
} from './notification-delivery-quiet-hours.util';
import { NotificationDeliveryObservabilityService } from './notification-delivery-observability.service';
import { NotificationEnforcementService } from '@modules/data-authorizations/notification-enforcement/notification-enforcement.service';
import { getActiveNotificationAuthCache } from '../runtime/notification-run-context';

export interface EnqueueDeliveryInput {
  notification: Notification;
  transition: NotificationDeliveryTransition;
  severityBefore?: Notification['severity'];
  referenceNow?: Date;
}

@Injectable()
export class NotificationDeliveryEnqueueService {
  constructor(
    private readonly engineConfig: NotificationEngineConfig,
    @Inject(notificationDeliveryConfig.KEY)
    private readonly config: ConfigType<typeof notificationDeliveryConfig>,
    private readonly policyService: NotificationDeliveryPolicyService,
    private readonly preferenceService: NotificationPreferenceService,
    private readonly stationScope: NotificationStationScopeService,
    private readonly outboxRepo: NotificationDeliveryOutboxRepository,
    private readonly observability: NotificationDeliveryObservabilityService,
    @Optional() private readonly notificationEnforcement?: NotificationEnforcementService,
  ) {}

  isDeliveryEnabled(): boolean {
    return this.engineConfig.isV2Enabled() && this.config.enabled;
  }

  async enqueueInTransaction(
    input: EnqueueDeliveryInput,
    tx: NotificationTx,
  ): Promise<string[]> {
    if (!this.isDeliveryEnabled()) return [];

    if (this.notificationEnforcement) {
      const vehicleId = this.extractVehicleId(input.notification);
      const auth = await this.notificationEnforcement.checkDelivery(
        {
          organizationId: input.notification.organizationId,
          eventType: input.notification.eventType,
          vehicleId,
          entityType: input.notification.entityType,
          entityId: input.notification.entityId,
          correlationId: `notification-delivery:${input.notification.id}:${input.transition}`,
        },
        getActiveNotificationAuthCache() ?? undefined,
      );
      if (!auth.mayProceed) {
        this.observability.logWarn({
          notificationId: input.notification.id,
          organizationId: input.notification.organizationId,
          eventType: input.notification.eventType,
          operation: 'delivery_suppressed_auth',
          errorCode: auth.reasonCode,
        });
        return [];
      }
    }

    const channels = this.policyService.resolveChannels(input.notification.eventType);
    if (channels.length === 0) return [];

    const def = getEventTypeDefinition(input.notification.eventType);
    if (!def) return [];

    const memberships = await this.outboxRepo.listEligibleMemberships(
      input.notification.organizationId,
      def.supportedRoles,
    );

    const orgTz =
      (await this.outboxRepo.getOrganizationTimezone(input.notification.organizationId))
        ?.timezone ?? 'Europe/Berlin';

    const createdIds: string[] = [];
    const referenceNow = input.referenceNow ?? new Date();
    const payloadRef = {
      notificationId: input.notification.id,
      titleKey: input.notification.titleKey,
      bodyKey: input.notification.bodyKey,
      severity: input.notification.severity,
      status: input.notification.status,
      transition: input.transition,
    };

    for (const membership of memberships) {
      const prefs = membership.user.notificationPreferences;
      const scopeCtx = await this.stationScope.buildScopeContext(
        input.notification.organizationId,
        membership.role,
        membership.stationScope,
      );
      const inScope = this.stationScope.isNotificationInScope(
        {
          id: input.notification.id,
          eventType: input.notification.eventType,
          domain: input.notification.domain,
          severity: input.notification.severity,
          entityType: input.notification.entityType,
          entityId: input.notification.entityId,
          actionTarget: input.notification.actionTarget,
          status: input.notification.status,
        },
        {
          userId: membership.userId,
          organizationId: input.notification.organizationId,
          membershipRole: membership.role,
          stationScope: membership.stationScope,
          preferences: prefs,
          ...scopeCtx,
        },
      );
      if (!inScope) continue;

      const decision = this.preferenceService.evaluateInAppDelivery(
        input.notification.eventType,
        input.notification.severity,
        prefs,
      );

      for (const channel of channels) {
        if (channel === NotificationDeliveryChannel.EMAIL && !decision.email) {
          if (!decision.mandatory) continue;
        }
        if (channel === NotificationDeliveryChannel.PUSH && !decision.push) {
          if (!decision.mandatory) continue;
        }

        let availableAt = referenceNow;
        const userTz = membership.user.timezone ?? orgTz;
        const quietConfig = {
          startLocal: this.config.quietHoursStart,
          endLocal: this.config.quietHoursEnd,
        };
        if (
          isWithinQuietHours(referenceNow, userTz, quietConfig) &&
          !criticalOverridesQuietHours(input.notification.severity) &&
          !decision.mandatory
        ) {
          const [endH, endM] = this.config.quietHoursEnd.split(':').map(Number);
          const defer = new Date(referenceNow);
          defer.setHours(endH, endM, 0, 0);
          availableAt = defer > referenceNow ? defer : referenceNow;
        }

        if (
          def.preferenceCategory &&
          this.outboxRepo.isDigestCategory(def.preferenceCategory) &&
          channel === NotificationDeliveryChannel.EMAIL
        ) {
          availableAt = nextDigestAvailableAt(
            referenceNow,
            userTz,
            this.config.digestHourLocal,
          );
        }

        const idempotencyKey = buildDeliveryIdempotencyKey({
          notificationId: input.notification.id,
          lifecycleGeneration: input.notification.lifecycleGeneration,
          deliveryTransition: input.transition,
          channel,
          recipientId: membership.userId,
        });

        const row = await this.outboxRepo.createEntryIdempotent(
          {
            organizationId: input.notification.organizationId,
            notificationId: input.notification.id,
            lifecycleGeneration: input.notification.lifecycleGeneration,
            eventType: input.notification.eventType,
            deliveryTransition: input.transition,
            channel,
            recipientId: membership.userId,
            audienceKey: `user:${membership.userId}`,
            payloadRef,
            idempotencyKey,
            availableAt,
          },
          tx,
        );

        if (row) {
          createdIds.push(row.id);
          this.observability.recordEnqueued(channel, input.transition);
        } else {
          this.observability.recordDuplicateConstraint();
        }
      }
    }

    return createdIds;
  }

  private extractVehicleId(notification: EnqueueDeliveryInput['notification']): string | null {
    if (notification.entityType === 'VEHICLE') return notification.entityId;
    const target = notification.actionTarget as Record<string, unknown> | null;
    if (target && typeof target.vehicleId === 'string') return target.vehicleId;
    const params = notification.templateParams as Record<string, unknown> | null;
    if (params && typeof params.vehicleId === 'string') return params.vehicleId;
    return null;
  }
}
