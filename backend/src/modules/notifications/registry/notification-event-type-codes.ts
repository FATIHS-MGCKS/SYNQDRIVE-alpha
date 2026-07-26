import { NOTIFICATION_EVENT_TYPE_DEFINITIONS } from './notification-event-registry.definitions';

/** Union of all canonical registry eventType codes — compile-time producer guard. */
export type NotificationEventTypeCode =
  (typeof NOTIFICATION_EVENT_TYPE_DEFINITIONS)[number]['eventType'];

export const NOTIFICATION_EVENT_TYPE_CODES = NOTIFICATION_EVENT_TYPE_DEFINITIONS.map(
  (def) => def.eventType,
) as readonly NotificationEventTypeCode[];
