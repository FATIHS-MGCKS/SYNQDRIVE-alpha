import type { ActionQueueFilterTab } from '../../components/dashboard/dashboardTypes';
import { ACTION_QUEUE_FILTER_TABS } from '../../components/dashboard/dashboardTypes';
import type { NotificationPrimaryTab } from '../../components/dashboard/notifications/notificationPanelTypes';
import { NOTIFICATION_PRIMARY_TABS } from '../../components/dashboard/notifications/notificationPanelTypes';
import type { ApiNotificationCountsResponse } from './notification-api.types';

function sumDomains(byDomain: Record<string, number>, keys: string[]): number {
  return keys.reduce((sum, key) => sum + (byDomain[key] ?? 0), 0);
}

export function mapApiCountsToPrimaryTabCounts(
  counts: ApiNotificationCountsResponse,
): Record<NotificationPrimaryTab, number> {
  return {
    all: counts.totalActive,
    critical: counts.critical,
    warning: counts.warning,
    resolved: counts.resolvedRecent,
  };
}

export function emptyPrimaryTabCounts(): Record<NotificationPrimaryTab, number> {
  const out = {} as Record<NotificationPrimaryTab, number>;
  for (const tab of NOTIFICATION_PRIMARY_TABS) out[tab] = 0;
  return out;
}

/**
 * Maps canonical `/notifications/counts` response to legacy ActionQueue tab badges.
 * Does not estimate from the first loaded page.
 */
export function mapApiCountsToTabCounts(
  counts: ApiNotificationCountsResponse,
): Record<ActionQueueFilterTab, number> {
  const byDomain = counts.byDomain ?? {};

  const operations = sumDomains(byDomain, [
    'OPERATIONS',
    'BOOKINGS',
    'HANDOVERS',
    'BILLING',
  ]);
  const vehicle = sumDomains(byDomain, ['VEHICLE_HEALTH', 'DRIVING_ANALYSIS']);
  const notifications = sumDomains(byDomain, ['DOCUMENTS', 'SYSTEM', 'SECURITY']);

  return {
    all: counts.totalActive,
    critical: counts.critical,
    operations,
    vehicle,
    notifications,
  };
}

export function emptyTabCounts(): Record<ActionQueueFilterTab, number> {
  const counts = {} as Record<ActionQueueFilterTab, number>;
  for (const tab of ACTION_QUEUE_FILTER_TABS) {
    counts[tab] = 0;
  }
  return counts;
}
