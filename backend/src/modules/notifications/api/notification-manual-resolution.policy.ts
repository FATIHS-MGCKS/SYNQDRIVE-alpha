import { NotificationEventKind } from '@prisma/client';
import { getEventTypeDefinition } from '../registry/notification-event-registry';

/**
 * Whether a user may manually resolve a notification (org-wide lifecycle).
 * Auto-cleared STATE telemetry warnings must not be manually resolved.
 */
export function isManualResolutionAllowed(
  eventType: string,
  eventKind: NotificationEventKind,
): boolean {
  if (eventKind === NotificationEventKind.EVENT) {
    return true;
  }

  if (eventType === 'TECHNICAL_OBSERVATION_ACTIVE') {
    return true;
  }

  if (eventType.endsWith('_CREATED') || eventType.endsWith('_RETURNED')) {
    return true;
  }

  const def = getEventTypeDefinition(eventType);
  if (!def) {
    return false;
  }

  if (def.resolutionPolicy.autoResolveWhenConditionClears) {
    return false;
  }

  return false;
}
