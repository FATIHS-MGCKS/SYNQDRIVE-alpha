import {
  NotificationCategory,
  NotificationSeverity,
  type UserNotificationPreference,
} from '@prisma/client';
import { NOTIFICATION_CATEGORY_META } from '@modules/account/account-notification.defaults';
import { getEventTypeDefinition } from '../registry/notification-event-registry';
import { isMandatoryNotification } from './notification-mandatory.policy';
import type { PreferenceDeliveryDecision } from './notification-access.types';

export interface EffectiveNotificationPreferences {
  category: NotificationCategory;
  /** Platform/org-wide defaults — not user-editable per tenant yet. */
  orgDefaults: {
    inApp: boolean;
    email: boolean;
    push: boolean;
    sms: boolean;
    criticalOnly: boolean;
  };
  /** User overrides stored in user_notification_preferences. */
  userOverrides: {
    inApp: boolean;
    email: boolean;
    push: boolean;
    sms: boolean;
    criticalOnly: boolean;
  };
}

export class NotificationPreferenceService {
  resolveEffectivePreferences(
    category: NotificationCategory,
    preferences: UserNotificationPreference[],
  ): EffectiveNotificationPreferences {
    const orgDefaults = NOTIFICATION_CATEGORY_META[category];
    const pref = preferences.find((p) => p.category === category);

    return {
      category,
      orgDefaults: {
        inApp: orgDefaults.inApp,
        email: orgDefaults.email,
        push: orgDefaults.push,
        sms: orgDefaults.sms,
        criticalOnly: orgDefaults.criticalOnly,
      },
      userOverrides: {
        inApp: pref?.inApp ?? orgDefaults.inApp,
        email: pref?.email ?? orgDefaults.email,
        push: pref?.push ?? orgDefaults.push,
        sms: pref?.sms ?? orgDefaults.sms,
        criticalOnly: pref?.criticalOnly ?? orgDefaults.criticalOnly,
      },
    };
  }

  /**
   * Evaluate channel delivery for a notification row.
   * Org defaults seed first-time prefs; user overrides win for non-mandatory paths.
   */
  evaluateInAppDelivery(
    eventType: string,
    severity: NotificationSeverity,
    preferences: UserNotificationPreference[],
  ): PreferenceDeliveryDecision {
    const def = getEventTypeDefinition(eventType);
    const category = def?.preferenceCategory ?? NotificationCategory.TASKS;
    const effective = this.resolveEffectivePreferences(category, preferences);
    const mandatory = isMandatoryNotification(eventType, severity);

    const inApp = effective.userOverrides.inApp;
    const email = effective.userOverrides.email;
    const push = effective.userOverrides.push;
    const sms = effective.userOverrides.sms;
    const criticalOnly = effective.userOverrides.criticalOnly;

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
