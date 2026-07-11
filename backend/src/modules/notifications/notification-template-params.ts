import type { NotificationTemplateParams } from './notification.types';

/** Shallow merge — incoming keys win when merge is authorized. */
export function mergeTemplateParams(
  existing: NotificationTemplateParams,
  incoming: NotificationTemplateParams,
): NotificationTemplateParams {
  return { ...existing, ...incoming };
}

export function shouldRefreshTemplateParams(
  lastSeenAt: Date,
  incomingOccurredAt: Date,
): boolean {
  return incomingOccurredAt.getTime() >= lastSeenAt.getTime();
}
