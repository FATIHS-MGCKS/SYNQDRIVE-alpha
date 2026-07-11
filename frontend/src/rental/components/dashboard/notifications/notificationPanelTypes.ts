import type { NotificationDomain } from '../notificationQueueModel';

/** Severity-oriented primary tabs — separate from domain filters. */
export type NotificationPrimaryTab = 'all' | 'critical' | 'warning' | 'resolved';

export const NOTIFICATION_PRIMARY_TABS: NotificationPrimaryTab[] = [
  'all',
  'critical',
  'warning',
  'resolved',
];

export type NotificationDomainFilter =
  | 'operations'
  | 'vehicle-health'
  | 'driving-analysis'
  | 'bookings'
  | 'handovers'
  | 'documents'
  | 'billing'
  | 'system';

export const NOTIFICATION_DOMAIN_FILTERS: NotificationDomainFilter[] = [
  'operations',
  'vehicle-health',
  'driving-analysis',
  'bookings',
  'handovers',
  'documents',
  'billing',
  'system',
];

export function isNotificationDomainFilter(value: string): value is NotificationDomainFilter {
  return (NOTIFICATION_DOMAIN_FILTERS as string[]).includes(value);
}

export function domainFilterMatchesQueueDomain(
  filter: NotificationDomainFilter,
  domain: NotificationDomain,
): boolean {
  if (filter === domain) return true;
  if (filter === 'vehicle-health' && domain === 'vehicle-health') return true;
  return false;
}

export type NotificationEmptyVariant =
  | 'none-active'
  | 'none-critical'
  | 'none-warning'
  | 'none-resolved'
  | 'filter-empty'
  | 'api-error';
