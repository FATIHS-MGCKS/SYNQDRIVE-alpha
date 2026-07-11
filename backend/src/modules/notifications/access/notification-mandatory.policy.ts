import { NotificationCategory, NotificationSeverity } from '@prisma/client';
import { getEventTypeDefinition } from '../registry/notification-event-registry';

/** Confirmed product-critical events — integration/compliance blockers. */
export const ORG_MANDATORY_EVENT_TYPES = new Set([
  'INTEGRATION_DISCONNECTED',
  'WEBHOOK_FAILURE',
  'BLOCKED_VEHICLE',
]);

/**
 * Pflichtmeldungen — cannot be fully suppressed by user preferences.
 * Grounded in existing account SECURITY channel rule + registry deliveryPolicy.
 */
export function isMandatoryNotification(eventType: string, severity: NotificationSeverity): boolean {
  const def = getEventTypeDefinition(eventType);
  if (!def) return severity === NotificationSeverity.CRITICAL;

  if (def.preferenceCategory === NotificationCategory.SECURITY) {
    return true;
  }

  if (
    def.deliveryPolicy.criticalOverridesPreferences
    && severity === NotificationSeverity.CRITICAL
  ) {
    return true;
  }

  if (ORG_MANDATORY_EVENT_TYPES.has(eventType)) {
    return true;
  }

  return false;
}
