import type { ActionQueueItem } from '../dashboardTypes';
import type { NotificationPrimaryTab } from './notificationPanelTypes';
import { filterNotificationPanelItems } from './notificationPanelFilters';

function itemSeverity(item: ActionQueueItem): string {
  return item.queue?.severity ?? item.severity;
}

function isResolvedItem(item: ActionQueueItem): boolean {
  const status = item.queue?.lifecycleStatus;
  return status === 'resolved' || status === 'archived' || item.queue?.severity === 'success';
}

export function computeNotificationPrimaryTabCounts(
  items: ActionQueueItem[],
): Record<NotificationPrimaryTab, number> {
  const visible = items.filter((item) => {
    const eventType = (item.issueType ?? item.queue?.conditionCode ?? '').toUpperCase();
    return eventType !== 'HM_SERVICE_NO_TRACKING';
  });

  const active = visible.filter((item) => !isResolvedItem(item) && item.queue?.lifecycleStatus !== 'snoozed');

  return {
    all: active.length,
    critical: active.filter((item) => itemSeverity(item) === 'critical').length,
    warning: active.filter((item) => {
      const severity = itemSeverity(item);
      return severity === 'warning' || severity === 'attention' || severity === 'overdue';
    }).length,
    resolved: visible.filter((item) => isResolvedItem(item)).length,
  };
}

export function mergeNotificationPrimaryTabCounts(
  apiCounts: Record<NotificationPrimaryTab, number>,
  mergedItems: ActionQueueItem[],
): Record<NotificationPrimaryTab, number> {
  const mergedCounts = computeNotificationPrimaryTabCounts(mergedItems);
  return {
    all: Math.max(apiCounts.all, mergedCounts.all),
    critical: Math.max(apiCounts.critical, mergedCounts.critical),
    warning: Math.max(apiCounts.warning, mergedCounts.warning),
    resolved: Math.max(apiCounts.resolved, mergedCounts.resolved),
  };
}

export function countFilteredPanelItems(
  items: ActionQueueItem[],
  tab: NotificationPrimaryTab,
): number {
  return filterNotificationPanelItems(items, tab, null).length;
}
