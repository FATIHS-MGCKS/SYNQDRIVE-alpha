import type { ActionQueueItem } from '../dashboardTypes';
import type { NotificationDomain } from '../notificationQueueModel';
import { isResolvedLifecycle } from '../notificationTimeSemantics';
import type { NotificationDomainFilter, NotificationPrimaryTab } from './notificationPanelTypes';

function itemSeverity(item: ActionQueueItem): string {
  return item.queue?.severity ?? item.severity;
}

function itemDomain(item: ActionQueueItem): NotificationDomain | undefined {
  return item.queue?.domain;
}

function isSnoozed(item: ActionQueueItem): boolean {
  return item.queue?.lifecycleStatus === 'snoozed';
}

function isAcknowledged(item: ActionQueueItem): boolean {
  return item.queue?.lifecycleStatus === 'acknowledged';
}

export function filterNotificationsByPrimaryTab(
  items: ActionQueueItem[],
  tab: NotificationPrimaryTab,
): ActionQueueItem[] {
  if (tab === 'resolved') {
    return items.filter((item) => {
      const status = item.queue?.lifecycleStatus;
      return status === 'resolved' || status === 'archived' || item.queue?.severity === 'success';
    });
  }

  return items.filter((item) => {
    if (isSnoozed(item)) return false;
    const severity = itemSeverity(item);
    const resolved = item.queue?.lifecycleStatus && isResolvedLifecycle(item.queue.lifecycleStatus);
    if (resolved || severity === 'success') return false;

    if (tab === 'all') return true;
    if (tab === 'critical') return severity === 'critical';
    if (tab === 'warning') return severity === 'warning' || severity === 'attention' || severity === 'overdue';
    return true;
  });
}

export function filterNotificationsByDomain(
  items: ActionQueueItem[],
  domainFilter: NotificationDomainFilter | null,
): ActionQueueItem[] {
  if (!domainFilter) return items;
  return items.filter((item) => itemDomain(item) === domainFilter);
}

const PANEL_EXCLUDED_EVENT_TYPES = new Set(['HM_SERVICE_NO_TRACKING']);

function isPanelExcluded(item: ActionQueueItem): boolean {
  const eventType = (item.issueType ?? item.queue?.conditionCode ?? '').toUpperCase();
  return PANEL_EXCLUDED_EVENT_TYPES.has(eventType);
}

export function filterNotificationPanelItems(
  items: ActionQueueItem[],
  primaryTab: NotificationPrimaryTab,
  domainFilter: NotificationDomainFilter | null,
): ActionQueueItem[] {
  const visible = items.filter((item) => !isPanelExcluded(item));
  const byTab = filterNotificationsByPrimaryTab(visible, primaryTab);
  return filterNotificationsByDomain(byTab, domainFilter);
}

export function headerStatusTone(
  items: ActionQueueItem[],
  tabCounts: Record<NotificationPrimaryTab, number>,
): 'critical' | 'warning' | 'neutral' | 'success' {
  if ((tabCounts.critical ?? 0) > 0) return 'critical';
  if ((tabCounts.warning ?? 0) > 0) return 'warning';
  const hasUnreadCritical = items.some(
    (i) =>
      i.queue?.readStatus === 'unread' &&
      (i.queue?.severity === 'critical' || i.queue?.severity === 'warning'),
  );
  if (hasUnreadCritical) return 'warning';
  if ((tabCounts.all ?? 0) === 0 && (tabCounts.resolved ?? 0) > 0) return 'success';
  return 'neutral';
}

export function isAcknowledgedVisible(item: ActionQueueItem): boolean {
  return isAcknowledged(item) && !isSnoozed(item);
}
