import type { ActionQueueItem, ActionQueueModuleTarget } from './dashboardTypes';
import type { NotificationActionTarget, NotificationActionType } from './notificationQueueModel';
import { isOverdueHandoverNotification } from './notifications/notification-handover-copy';

export interface ResolvedNotificationCta {
  actionType: NotificationActionType;
  actionTarget: NotificationActionTarget;
  /** Legacy ActionQueueCta for existing navigation handlers. */
  legacyCta: ActionQueueItem['cta'];
  module?: ActionQueueModuleTarget;
}

function moduleFromIssueType(issueType?: string, module?: ActionQueueModuleTarget): ActionQueueModuleTarget | undefined {
  if (module) return module;
  if (issueType === 'technical_observation_active') return 'complaints';
  if (issueType === 'driving_assessment_device_quality') return 'overview';
  return undefined;
}

export function resolveNotificationCta(item: ActionQueueItem, issueType?: string): ResolvedNotificationCta {
  const vehicleId = item.vehicleId;
  const bookingId = item.bookingId;
  const stationId = item.stationId;
  const module = moduleFromIssueType(issueType, item.module);

  if (issueType === 'technical_observation_active' && vehicleId) {
    return {
      actionType: 'open-vehicle-module',
      actionTarget: { type: 'open-vehicle-module', vehicleId, module: 'complaints' },
      legacyCta: 'open-vehicle',
      module: 'complaints',
    };
  }

  if (issueType === 'driving_assessment_device_quality' && vehicleId) {
    return {
      actionType: 'open-vehicle',
      actionTarget: { type: 'open-vehicle', vehicleId, module: 'overview' },
      legacyCta: 'open-vehicle',
      module: 'overview',
    };
  }

  if (
    (issueType?.includes('battery') ||
      issueType?.includes('tire') ||
      issueType?.includes('brake') ||
      issueType?.includes('error_code') ||
      issueType === 'health_review_required') &&
    vehicleId
  ) {
    return {
      actionType: 'open-vehicle-module',
      actionTarget: { type: 'open-vehicle-module', vehicleId, module: module ?? 'overview' },
      legacyCta: 'open-vehicle',
      module: module ?? 'overview',
    };
  }

  if (isOverdueHandoverNotification(item) && bookingId) {
    return {
      actionType: 'open-booking',
      actionTarget: { type: 'open-booking', bookingId, vehicleId },
      legacyCta: 'open-booking',
    };
  }

  if (item.pickupItem || item.cta === 'start-handover-pickup') {
    return {
      actionType: 'open-handover-pickup',
      actionTarget: { type: 'open-handover-pickup', bookingId, vehicleId },
      legacyCta: 'start-handover-pickup',
    };
  }

  if (item.returnItem || item.cta === 'start-handover-return') {
    return {
      actionType: 'open-handover-return',
      actionTarget: { type: 'open-handover-return', bookingId, vehicleId },
      legacyCta: 'start-handover-return',
    };
  }

  if (bookingId && (item.category === 'handover' || item.category === 'booking' || item.cta === 'open-booking')) {
    return {
      actionType: 'open-booking',
      actionTarget: { type: 'open-booking', bookingId, vehicleId },
      legacyCta: 'open-booking',
    };
  }

  if (stationId || item.cta === 'open-stations' || issueType === 'station_shortage') {
    return {
      actionType: 'open-station',
      actionTarget: { type: 'open-station', stationId },
      legacyCta: 'open-stations',
    };
  }

  if (item.category === 'financial' && item.customerId) {
    return {
      actionType: 'open-billing',
      actionTarget: { type: 'open-billing', customerId: item.customerId },
      legacyCta: 'open-rental',
    };
  }

  if (item.cta === 'open-price-tariffs' || item.id === 'derived-vehicles-without-tariff') {
    return {
      actionType: 'open-rental',
      actionTarget: { type: 'open-rental' },
      legacyCta: 'open-price-tariffs',
    };
  }

  if (vehicleId) {
    return {
      actionType: module ? 'open-vehicle-module' : 'open-vehicle',
      actionTarget: { type: module ? 'open-vehicle-module' : 'open-vehicle', vehicleId, module },
      legacyCta: 'open-vehicle',
      module,
    };
  }

  return {
    actionType: 'open-rental',
    actionTarget: { type: 'open-rental' },
    legacyCta: item.cta ?? 'open-rental',
  };
}
