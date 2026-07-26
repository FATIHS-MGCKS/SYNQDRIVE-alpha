import type { ApiNotificationListParams } from './notification-api.types';
import { resolvedRecentFromIso } from './notification-resolved-window';

export const DEFAULT_NOTIFICATION_PAGE_SIZE = 50;

export type NotificationInboxListMode = 'active' | 'resolved';

/** Shared list/count filters — counts endpoint accepts the same scope as list. */
export function buildNotificationInboxScopeParams(
  listMode: NotificationInboxListMode,
  referenceNowMs = Date.now(),
): ApiNotificationListParams {
  const base: ApiNotificationListParams = {
    limit: DEFAULT_NOTIFICATION_PAGE_SIZE,
    sortBy: 'lastSeenAt',
    sortOrder: 'desc',
  };

  if (listMode === 'resolved') {
    return {
      ...base,
      resolvedOnly: true,
      from: resolvedRecentFromIso(referenceNowMs),
      timeField: 'resolvedAt',
    };
  }

  return {
    ...base,
    activeOnly: true,
  };
}

export const notificationInboxQueryKeys = {
  all: ['notifications-inbox'] as const,
  org: (orgId: string) => [...notificationInboxQueryKeys.all, orgId] as const,
  list: (orgId: string, listMode: NotificationInboxListMode) =>
    [...notificationInboxQueryKeys.org(orgId), 'list', listMode] as const,
  counts: (orgId: string, listMode: NotificationInboxListMode) =>
    [...notificationInboxQueryKeys.org(orgId), 'counts', listMode] as const,
};
