import type { ActionQueueItem, ActionQueueModuleTarget } from '../../components/dashboard/dashboardTypes';
import { formatNotificationTimeLabel } from '../../components/dashboard/notificationTimeSemantics';

const VEHICLE_HEALTH_EVENT_TYPES = new Set([
  'ACTIVE_DTC',
  'TIRE_CRITICAL',
  'BRAKE_CRITICAL',
  'BATTERY_CRITICAL',
  'SERVICE_OVERDUE',
  'SERVICE_WINDOW',
  'HM_SERVICE_NO_TRACKING',
  'TUV_OVERDUE',
  'BOKRAFT_OVERDUE',
  'COMPLIANCE_OPERATIONAL',
]);

function isVehicleHealthItem(item: ActionQueueItem): boolean {
  const domain = item.queue?.domain;
  const eventType = item.issueType ?? '';
  return (
    item.category === 'health'
    || domain === 'vehicle-health'
    || domain === 'driving-analysis'
    || VEHICLE_HEALTH_EVENT_TYPES.has(eventType)
  );
}

function eventTypeToModule(
  eventType: string,
  actionModule?: string,
): ActionQueueModuleTarget | undefined {
  if (actionModule) {
    if (actionModule === 'health') return 'error_codes';
    const normalized = actionModule as ActionQueueModuleTarget;
    if (
      [
        'battery',
        'tires',
        'brakes',
        'error_codes',
        'service_compliance',
        'complaints',
        'vehicle_alerts',
        'overview',
      ].includes(normalized)
    ) {
      return normalized;
    }
  }
  switch (eventType) {
    case 'ACTIVE_DTC':
      return 'error_codes';
    case 'TIRE_CRITICAL':
      return 'tires';
    case 'BRAKE_CRITICAL':
      return 'brakes';
    case 'BATTERY_CRITICAL':
      return 'battery';
    case 'SERVICE_OVERDUE':
    case 'SERVICE_WINDOW':
    case 'HM_SERVICE_NO_TRACKING':
    case 'TUV_OVERDUE':
    case 'BOKRAFT_OVERDUE':
      return 'service_compliance';
    case 'TECHNICAL_OBSERVATION_ACTIVE':
      return 'complaints';
    case 'DRIVING_ASSESSMENT_DEVICE_QUALITY':
      return 'overview';
    default:
      return undefined;
  }
}

function moduleLabel(module: ActionQueueModuleTarget | undefined, de: boolean): string | undefined {
  if (!module) return undefined;
  if (!de) {
    const en: Record<string, string> = {
      battery: 'Battery',
      tires: 'Tires',
      brakes: 'Brakes',
      service_compliance: 'Service & inspection',
      error_codes: 'Error codes',
      complaints: 'Complaints',
      vehicle_alerts: 'OEM warning lights',
      overview: 'Overview',
    };
    return en[module] ?? module;
  }
  switch (module) {
    case 'battery':
      return 'Batterie';
    case 'tires':
      return 'Reifen';
    case 'brakes':
      return 'Bremsen';
    case 'service_compliance':
      return 'Service & Inspektion';
    case 'error_codes':
      return 'Fehlercodes';
    case 'complaints':
      return 'Beschwerden';
    case 'vehicle_alerts':
      return 'OEM-Warnleuchten';
    default:
      return 'Übersicht';
  }
}

/**
 * Derives stable groupKey/groupType for V2 notification rows so the panel can
 * reuse ActionQueue grouping (vehicle, station, booking, customer).
 */
export function enrichNotificationGroupingMetadata(
  item: ActionQueueItem,
  locale: string,
  referenceNowMs = Date.now(),
): ActionQueueItem {
  if (item.groupKey) return item;

  const de = locale === 'de';
  const actionModule =
    item.queue?.actionTarget && 'module' in item.queue.actionTarget
      ? String((item.queue.actionTarget as { module?: string }).module ?? '')
      : undefined;
  const mod = eventTypeToModule(item.issueType ?? '', actionModule);
  const timeLabel = item.queue
    ? formatNotificationTimeLabel(item.queue, { locale, referenceNowMs })
    : item.timeLabel;

  const base = {
    ...item,
    module: mod ?? item.module,
    moduleLabel: moduleLabel(mod, de) ?? item.moduleLabel,
    timeLabel,
  };

  if (item.vehicleId) {
    return {
      ...base,
      groupKey: `vehicle:${item.vehicleId}`,
      groupType: isVehicleHealthItem(item) ? 'vehicle-health' : 'vehicle-ops',
    };
  }

  if (item.stationId) {
    return {
      ...base,
      groupKey: `station:${item.stationId}`,
      groupType: 'station-ops',
    };
  }

  if (item.bookingId) {
    return {
      ...base,
      groupKey: `booking:${item.bookingId}`,
      groupType: 'booking',
    };
  }

  if (item.customerId) {
    return {
      ...base,
      groupKey: `customer:${item.customerId}`,
      groupType: 'customer-docs',
    };
  }

  return base;
}

export function enrichNotificationGroupingList(
  items: ActionQueueItem[],
  locale: string,
  referenceNowMs = Date.now(),
): ActionQueueItem[] {
  return items.map((item) => enrichNotificationGroupingMetadata(item, locale, referenceNowMs));
}
