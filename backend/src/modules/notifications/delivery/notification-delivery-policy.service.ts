import { Injectable } from '@nestjs/common';
import {
  NotificationEventKind,
  NotificationSeverity,
  NotificationStatus,
  type Notification,
} from '@prisma/client';
import { getEventTypeDefinition } from '../registry/notification-event-registry';
import type { NotificationDeliveryPolicy } from '../notification.types';
import { DEFAULT_IN_APP_DELIVERY } from '../registry/notification-event-registry.policies';

export type DeliveryEnqueueTransition =
  | 'OPEN_CREATED'
  | 'SEVERITY_ESCALATED'
  | 'ACKNOWLEDGED'
  | 'RESOLVED'
  | 'REOPENED';

const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  SUCCESS: 0,
  INFO: 1,
  WARNING: 2,
  CRITICAL: 3,
};

@Injectable()
export class NotificationDeliveryPolicyService {
  shouldEnqueueForIngestOperation(
    operation: 'created' | 'updated' | 'reopened' | 'resolved',
    notification: Notification,
    severityBefore?: NotificationSeverity,
  ): DeliveryEnqueueTransition | null {
    if (operation === 'created') {
      return 'OPEN_CREATED';
    }
    if (operation === 'reopened') {
      return 'REOPENED';
    }
    if (operation === 'resolved') {
      return this.shouldNotifyOnResolved(notification) ? 'RESOLVED' : null;
    }
    if (operation === 'updated' && severityBefore) {
      if (this.didSeverityEscalate(severityBefore, notification.severity)) {
        return 'SEVERITY_ESCALATED';
      }
    }
    return null;
  }

  shouldEnqueueForLifecycleTransition(
    from: NotificationStatus,
    to: NotificationStatus,
    notification: Notification,
  ): DeliveryEnqueueTransition | null {
    if (to === NotificationStatus.ACKNOWLEDGED) {
      const policy = this.resolveDeliveryPolicy(notification.eventType);
      return policy.notifyOnAcknowledged ? 'ACKNOWLEDGED' : null;
    }
    if (to === NotificationStatus.RESOLVED && from !== NotificationStatus.RESOLVED) {
      return this.shouldNotifyOnResolved(notification) ? 'RESOLVED' : null;
    }
    if (to === NotificationStatus.OPEN && from === NotificationStatus.RESOLVED) {
      return 'REOPENED';
    }
    return null;
  }

  resolveChannels(eventType: string): Array<'EMAIL' | 'PUSH'> {
    const policy = this.resolveDeliveryPolicy(eventType);
    return policy.channels.filter(
      (channel): channel is 'EMAIL' | 'PUSH' => channel === 'EMAIL' || channel === 'PUSH',
    );
  }

  private resolveDeliveryPolicy(eventType: string): NotificationDeliveryPolicy {
    const def = getEventTypeDefinition(eventType);
    return def?.deliveryPolicy ?? DEFAULT_IN_APP_DELIVERY;
  }

  private shouldNotifyOnResolved(notification: Notification): boolean {
    const def = getEventTypeDefinition(notification.eventType);
    const policy = def?.deliveryPolicy ?? DEFAULT_IN_APP_DELIVERY;
    if (policy.notifyOnResolved === true) return true;
    if (policy.notifyOnResolved === false) return false;
    const hasOutboundChannel = policy.channels.some((c) => c === 'EMAIL' || c === 'PUSH');
    return hasOutboundChannel && def?.eventKind === NotificationEventKind.STATE;
  }

  private didSeverityEscalate(
    before: NotificationSeverity,
    after: NotificationSeverity,
  ): boolean {
    return SEVERITY_RANK[after] > SEVERITY_RANK[before];
  }
}
