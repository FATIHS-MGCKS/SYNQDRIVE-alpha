import type { ActionQueueItem, ActionQueueModuleTarget } from '../dashboardTypes';
import type { RentalHealthModule, RentalHealthState, Vendor } from '../../../../lib/api';
import type { HealthActionModule, HealthTaskPrefill } from '../../../lib/health-task-bridge.utils';
import { buildHealthTaskPrefill } from '../../../lib/health-task-bridge.utils';
import {
  notificationCtaLabelKey,
  createNotificationTranslator,
} from '../notificationQueueEnricher';
import type { NotificationDetailViewModel } from './notification-detail-view-model';
import { resolveNotificationIssueCopy } from './notification-issue-copy';
import { affectedVehiclesSectionLabel } from './notification-affected-vehicles';

const MODULE_MAP: Partial<Record<ActionQueueModuleTarget, HealthActionModule>> = {
  battery: 'battery',
  tires: 'tires',
  brakes: 'brakes',
  error_codes: 'error_codes',
  service_compliance: 'service_compliance',
  vehicle_alerts: 'vehicle_alerts',
  complaints: 'complaints',
};

function healthModuleFromItem(item: ActionQueueItem): HealthActionModule | null {
  if (item.module && MODULE_MAP[item.module]) return MODULE_MAP[item.module]!;
  const eventType = (item.issueType ?? '').toUpperCase();
  if (eventType.includes('TIRE')) return 'tires';
  if (eventType.includes('BRAKE')) return 'brakes';
  if (eventType.includes('BATTERY')) return 'battery';
  if (eventType.includes('DTC') || eventType.includes('ACTIVE_DTC')) return 'error_codes';
  if (eventType.includes('SERVICE') || eventType.includes('TUV') || eventType.includes('BOKRAFT')) {
    return 'service_compliance';
  }
  if (item.queue?.domain === 'vehicle-health' || item.category === 'health') return 'error_codes';
  return null;
}

function priorityFromSeverity(severity: string | undefined): 'CRITICAL' | 'HIGH' | 'NORMAL' {
  if (severity === 'critical') return 'CRITICAL';
  if (severity === 'warning') return 'HIGH';
  return 'NORMAL';
}

export function canCreateTaskFromNotification(item: ActionQueueItem): boolean {
  if (!item.vehicleId) return false;
  if (item.queue?.lifecycleStatus === 'resolved' || item.queue?.lifecycleStatus === 'archived') {
    return false;
  }
  const domain = item.queue?.domain;
  return (
    domain === 'vehicle-health'
    || domain === 'driving-analysis'
    || domain === 'operations'
    || item.category === 'health'
    || item.category === 'operations'
  );
}

export function buildNotificationTaskPrefill(
  item: ActionQueueItem,
  vendors: Vendor[] = [],
): HealthTaskPrefill | null {
  if (!item.vehicleId || !canCreateTaskFromNotification(item)) return null;

  const module = healthModuleFromItem(item) ?? 'error_codes';
  const severity = item.queue?.severity ?? item.severity;
  const state: RentalHealthState =
    severity === 'critical' ? 'critical' : severity === 'warning' ? 'warning' : 'warning';

  const rentalModule: RentalHealthModule = {
    state,
    reason: item.reason || item.title,
    last_updated_at: null,
    data_stale: false,
  };

  const prefill = buildHealthTaskPrefill({
    module,
    vehicleId: item.vehicleId,
    rentalModule,
    contextLines: [
      item.title,
      item.reason,
      `Quelle: Meldungen (${item.issueType ?? 'notification'})`,
    ].filter(Boolean),
    vendors,
    blocksRental: severity === 'critical',
  });

  return {
    ...prefill,
    title: item.title || prefill.title,
    description: [item.reason, prefill.description].filter(Boolean).join('\n'),
    metadata: {
      ...prefill.metadata,
      notificationId: item.id,
      notificationEventType: item.issueType,
      origin: 'NOTIFICATION_PANEL',
    },
  };
}

export function resolveNotificationPrimaryCtaLabel(
  item: ActionQueueItem,
  locale: string,
): string {
  const de = locale === 'de';
  const t = createNotificationTranslator(locale);
  const eventType = item.issueType ?? item.queue?.conditionCode;
  const domain = item.queue?.domain;
  const actionType = item.queue?.actionType;

  if (eventType === 'TECHNICAL_OBSERVATION_ACTIVE') {
    return t('notification.cta.openObservation');
  }
  if (eventType === 'DRIVING_ASSESSMENT_DEVICE_QUALITY' || domain === 'driving-analysis') {
    if (actionType === 'open-vehicle-module' || actionType === 'open-vehicle') {
      return t('notification.cta.checkVehicle');
    }
    return t('notification.cta.openDrivingAnalysis');
  }
  if (item.stationId || domain === 'operations' && item.queue?.entityType === 'station') {
    return t('notification.cta.openStation');
  }
  if (item.bookingId || domain === 'bookings' || domain === 'handovers') {
    return t('notification.cta.openBooking');
  }
  if (item.cta === 'open-price-tariffs' || item.id === 'derived-vehicles-without-tariff') {
    return t('notification.cta.openPriceTariffs');
  }
  if (actionType) {
    const key = notificationCtaLabelKey(actionType);
    if (key === 'notification.cta.openVehicle') return t('notification.cta.checkVehicle');
    return t(key);
  }
  if (item.vehicleId || item.cta === 'open-vehicle') {
    return de ? 'Zum Fahrzeug' : 'Open vehicle';
  }
  if (item.cta === 'open-booking') return t('notification.cta.openBooking');
  return t('notification.cta.openRental');
}

export function buildNotificationDetailViewModel(
  item: ActionQueueItem,
  locale: string,
): NotificationDetailViewModel {
  const t = createNotificationTranslator(locale);
  const copy = resolveNotificationIssueCopy(item, locale);
  const affectedVehicles = item.affectedVehicles;
  return {
    issueTitle: copy.headline,
    issueDescription: copy.detail,
    ctaPrimaryLabel: resolveNotificationPrimaryCtaLabel(item, locale),
    showCreateTask: canCreateTaskFromNotification(item),
    createTaskLabel: t('notification.cta.createTask'),
    availableActions: item.availableActions ?? [],
    affectedVehicles,
    affectedVehiclesLabel: affectedVehicles?.length
      ? affectedVehiclesSectionLabel(affectedVehicles.length, locale)
      : undefined,
  };
}
