import {
  NotificationCategory,
  NotificationSeverity,
  type UserNotificationPreference,
} from '@prisma/client';
import { getEventTypeDefinition } from '../registry/notification-event-registry';
import { isMandatoryNotification } from './notification-mandatory.policy';
import type { PreferenceDeliveryDecision } from './notification-access.types';

export class NotificationPreferenceService {
  /**
   * Evaluate channel delivery for a notification row.
   * Quiet hours / digest are not yet persisted — reserved for future channels worker.
   */
  evaluateInAppDelivery(
    eventType: string,
    severity: NotificationSeverity,
    preferences: UserNotificationPreference[],
  ): PreferenceDeliveryDecision {
    const def = getEventTypeDefinition(eventType);
    const category = def?.preferenceCategory ?? NotificationCategory.TASKS;
    const pref = preferences.find((p) => p.category === category);
    const mandatory = isMandatoryNotification(eventType, severity);

    const inApp = pref?.inApp ?? true;
    const email = pref?.email ?? true;
    const push = pref?.push ?? false;
    const sms = pref?.sms ?? false;
    const criticalOnly = pref?.criticalOnly ?? false;

    if (mandatory) {
      return {
        inApp: true,
        email,
        push,
        sms,
        mandatory: true,
        suppressedByPreference: false,
      };
    }

    if (!inApp) {
      return {
        inApp: false,
        email,
        push,
        sms,
        mandatory: false,
        suppressedByPreference: true,
      };
    }

    if (criticalOnly && severity !== NotificationSeverity.CRITICAL) {
      return {
        inApp: false,
        email,
        push,
        sms,
        mandatory: false,
        suppressedByPreference: true,
      };
    }

    return {
      inApp: true,
      email,
      push,
      sms,
      mandatory: false,
      suppressedByPreference: false,
    };
  }
}
