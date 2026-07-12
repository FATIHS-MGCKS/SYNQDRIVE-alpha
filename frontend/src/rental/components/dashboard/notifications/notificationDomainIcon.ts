import type { ActionQueueGroupItem, ActionQueueItem } from '../dashboardTypes';
import { childSeverityRank } from '../actionQueueGrouping';
import type { NotificationDomain } from '../notificationQueueModel';

/** Consistent domain → icon mapping for notification cards. */
export function notificationDomainIcon(domain: NotificationDomain | undefined, eventType?: string): string {
  if (eventType === 'VEHICLES_WITHOUT_TARIFF' || eventType === 'vehicles_without_tariff') return 'tag';
  if (eventType === 'DRIVING_ASSESSMENT_DEVICE_QUALITY') return 'gauge';
  if (eventType === 'TECHNICAL_OBSERVATION_ACTIVE') return 'alert-triangle';
  if (domain === 'driving-analysis') return 'gauge';
  if (domain === 'vehicle-health') return 'heart';
  if (domain === 'bookings') return 'calendar';
  if (domain === 'handovers') return 'key';
  if (domain === 'documents') return 'file-text';
  if (domain === 'billing') return 'wallet';
  if (domain === 'security') return 'shield';
  if (domain === 'system') return 'bell';
  if (domain === 'operations') return 'calendar-clock';
  return 'bell';
}

function domainFromItem(item: ActionQueueItem): NotificationDomain | undefined {
  if (item.queue?.domain) return item.queue.domain;
  if (item.category === 'health') return 'vehicle-health';
  if (item.category === 'operations') return 'operations';
  if (item.category === 'financial') return 'billing';
  return undefined;
}

function domainFromChild(
  child: ActionQueueGroupItem['children'][number],
  item: ActionQueueItem | undefined,
): NotificationDomain | undefined {
  if (item) return domainFromItem(item);
  if (child.category === 'health') return 'vehicle-health';
  if (child.category === 'operations') return 'operations';
  if (child.category === 'financial') return 'billing';
  return undefined;
}

function dominantChildDomainIcon(
  group: ActionQueueGroupItem,
  itemsById: Map<string, ActionQueueItem>,
): string {
  let bestRank = -1;
  let icon = 'bell';

  for (const child of group.children) {
    const item = itemsById.get(child.itemId);
    const domain = domainFromChild(child, item);
    const eventType = item?.issueType;
    const rank = childSeverityRank(child.severity);
    if (rank >= bestRank) {
      bestRank = rank;
      icon = notificationDomainIcon(domain, eventType);
    }
  }

  return icon;
}

/** Domain-aware icon for grouped Meldungen headers (aligned with single cards). */
export function notificationGroupIcon(
  group: ActionQueueGroupItem,
  itemsById: Map<string, ActionQueueItem>,
): string {
  switch (group.groupType) {
    case 'station-ops':
      return 'map-pin';
    case 'booking': {
      for (const child of group.children) {
        const item = itemsById.get(child.itemId);
        if (item?.queue?.domain === 'handovers') return 'key';
      }
      return 'calendar';
    }
    case 'customer-docs':
      return 'file-text';
    case 'finance':
      return 'wallet';
    case 'notification-thread':
      return 'bell';
    case 'vehicle-health':
      return 'heart';
    case 'vehicle-ops':
    default:
      return dominantChildDomainIcon(group, itemsById);
  }
}
