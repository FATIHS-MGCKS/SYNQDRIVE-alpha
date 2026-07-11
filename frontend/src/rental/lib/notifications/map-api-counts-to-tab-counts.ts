import type { ActionQueueFilterTab } from '../../components/dashboard/dashboardTypes';
import { ACTION_QUEUE_FILTER_TABS } from '../../components/dashboard/dashboardTypes';
import type { ApiNotificationCountsResponse } from './notification-api.types';

function sumDomains(byDomain: Record<string, number>, keys: string[]): number {
  return keys.reduce((sum, key) => sum + (byDomain[key] ?? 0), 0);
}

/**
 * Maps canonical `/notifications/counts` response to ActionQueue tab badges.
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
