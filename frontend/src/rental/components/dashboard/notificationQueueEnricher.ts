import type { TranslationKey } from '../../i18n/translations/en';
import { en } from '../../i18n/translations/en';
import { de } from '../../i18n/translations/de';
import type { Locale } from '../../i18n/LanguageContext';
import type { ActionQueueItem } from './dashboardTypes';
import type {
  NotificationActionType,
  NotificationDomain,
  NotificationEntityType,
  NotificationLifecycleStatus,
  NotificationQueueModel,
  NotificationReadStatus,
  NotificationSeverity,
  NotificationSourceKind,
} from './notificationQueueModel';
import { mapLegacyInsightSource } from './notificationQueueModel';
import { resolveNotificationCta } from './notificationCtaResolver';
import { computeNotificationSortMs, formatNotificationTimeLabel } from './notificationTimeSemantics';

export interface NotificationQueueI18nInput {
  locale: Locale | string;
  entityLabel?: string;
  plate?: string;
}

function parseConditionCode(semanticKey?: string): string | undefined {
  if (!semanticKey) return undefined;
  const parts = semanticKey.split(':');
  return parts[parts.length - 1] || undefined;
}

function isRecoveringDrivingAssessment(item: ActionQueueItem, issueType?: string): boolean {
  if (issueType !== 'driving_assessment_device_quality') return false;
  const status = item.insight?.metrics?.vehicleStatus;
  if (status === 'RECOVERING') return true;
  const title = item.title.toLowerCase();
  return title.includes('normalis') || title.includes('wieder zuverlässig');
}

function resolveIssueType(item: ActionQueueItem): string | undefined {
  if (item.issueType) return item.issueType;
  if (item.insight?.type === 'SERVICE_OVERDUE') return 'service_overdue';
  if (item.insight?.type === 'STATION_SHORTAGE') return 'station_shortage';
  if (item.insight?.type === 'DRIVING_ASSESSMENT_DEVICE_QUALITY') return 'driving_assessment_device_quality';
  if (item.predictiveInsight?.type === 'STATION_SHORTAGE_24H') return 'station_shortage';
  const code = parseConditionCode(item.semanticKey);
  if (!code) return undefined;
  if (code === 'driving_assessment_device_quality') return code;
  if (code === 'technical_observation_active') return code;
  if (code === 'pickup_overdue') return 'pickup_overdue';
  if (code === 'overdue') return item.semanticKey?.includes(':return:') ? 'return_overdue' : 'pickup_overdue';
  if (code === 'overdue' && item.semanticKey?.includes('service_compliance')) return 'service_overdue';
  if (code === 'shortage') return 'station_shortage';
  if (code.includes('battery')) return 'battery_critical';
  if (code.includes('tires') || code.includes('tire')) return code.includes('monitor') ? 'tire_monitor' : 'tire_critical';
  if (code.includes('brakes') || code.includes('brake')) return 'brake_critical';
  if (code === 'error_codes_active') return 'error_codes_active';
  return code;
}

function resolveDomain(item: ActionQueueItem, issueType?: string): NotificationDomain {
  if (issueType === 'driving_assessment_device_quality') return 'driving-analysis';
  if (issueType === 'technical_observation_active') return 'vehicle-health';
  if (item.category === 'financial') return 'billing';
  if (item.category === 'handover' || item.pickupItem || item.returnItem) return 'handovers';
  if (item.category === 'booking') return 'bookings';
  if (item.category === 'health' || item.groupType === 'vehicle-health') return 'vehicle-health';
  if (item.category === 'notification') return 'system';
  if (item.category === 'operations' || issueType === 'station_shortage') return 'operations';
  return 'operations';
}

function resolveEntity(item: ActionQueueItem): { entityType: NotificationEntityType; entityId: string | null } {
  if (item.bookingId) return { entityType: 'booking', entityId: item.bookingId };
  if (item.vehicleId) return { entityType: 'vehicle', entityId: item.vehicleId };
  if (item.stationId) return { entityType: 'station', entityId: item.stationId };
  if (item.customerId) return { entityType: 'customer', entityId: item.customerId };
  if (item.semanticKey?.startsWith('fleet:')) return { entityType: 'fleet', entityId: 'fleet' };
  return { entityType: 'organization', entityId: null };
}

function mapOperationalSeverity(
  item: ActionQueueItem,
  recovering: boolean,
  issueType?: string,
): NotificationSeverity {
  if (recovering) return 'success';
  if (item.severity === 'critical' || item.isOverdue) return 'critical';
  if (item.severity === 'warning' || item.severity === 'attention') return 'warning';
  if (issueType === 'driving_assessment_device_quality') return recovering ? 'success' : 'warning';
  if (issueType === 'technical_observation_active') return item.severity === 'critical' ? 'critical' : 'warning';
  return 'info';
}

function extractTimestamps(
  item: ActionQueueItem,
  recovering: boolean,
): Pick<
  NotificationQueueModel,
  'occurredAt' | 'firstSeenAt' | 'lastSeenAt' | 'resolvedAt' | 'createdAt'
> {
  const degradedSince = item.insight?.metrics?.degradedSince;
  const insightCreated = item.insight?.createdAt ?? null;
  const timeSortIso = item.timeSortMs > 0 ? new Date(item.timeSortMs).toISOString() : null;
  const occurredAt =
    (typeof degradedSince === 'string' ? degradedSince : null)
    ?? item.pickupItem?.startDate
    ?? item.returnItem?.endDate
    ?? timeSortIso
    ?? insightCreated;

  const lastSeenAt = insightCreated ?? occurredAt;
  const resolvedAt = recovering ? insightCreated ?? lastSeenAt : null;
  const firstSeenAt = occurredAt ?? lastSeenAt;
  const createdAt = insightCreated ?? occurredAt;

  return { occurredAt, firstSeenAt, lastSeenAt, resolvedAt, createdAt };
}

function resolveReadStatus(item: ActionQueueItem, recovering: boolean): NotificationReadStatus {
  if (recovering) return 'read';
  return 'unread';
}

function resolveLifecycle(item: ActionQueueItem, recovering: boolean): NotificationLifecycleStatus {
  if (recovering) return 'resolved';
  return 'open';
}

function resolveSourceKind(item: ActionQueueItem): NotificationSourceKind {
  if (item.id.startsWith('issue-')) return 'operational-issue';
  if (item.insight) return 'dashboard-insight';
  if (item.predictiveInsight) return 'predictive-insight';
  if (item.pickupItem || item.returnItem) return 'booking-tile';
  if (item.id.startsWith('notif-')) return 'adapter';
  if (item.source === 'derived-operations') return 'derived-insight';
  return mapLegacyInsightSource(item.source);
}

export function notificationDomainLabel(
  domain: NotificationDomain,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
  const keyMap: Record<NotificationDomain, TranslationKey> = {
    operations: 'notification.domain.operations',
    'vehicle-health': 'notification.domain.vehicleHealth',
    'driving-analysis': 'notification.domain.drivingAnalysis',
    bookings: 'notification.domain.bookings',
    handovers: 'notification.domain.handovers',
    documents: 'notification.domain.documents',
    billing: 'notification.domain.billing',
    security: 'notification.domain.security',
    system: 'notification.domain.system',
  };
  return t(keyMap[domain]);
}

export function notificationCtaLabelKey(actionType: NotificationActionType): TranslationKey {
  switch (actionType) {
    case 'open-vehicle':
    case 'open-vehicle-module':
      return 'notification.cta.openVehicle';
    case 'open-booking':
      return 'notification.cta.openBooking';
    case 'open-handover-pickup':
      return 'notification.cta.startPickup';
    case 'open-handover-return':
      return 'notification.cta.startReturn';
    case 'open-station':
      return 'notification.cta.openStation';
    default:
      return 'notification.cta.openRental';
  }
}

export function createNotificationTranslator(locale: Locale | string) {
  const dict = locale === 'de' ? de : en;
  return (key: TranslationKey, vars?: Record<string, string | number>): string => {
    let text = dict[key] ?? en[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replace(`{${name}}`, String(value));
      }
    }
    return text;
  };
}

export function buildNotificationQueueModel(item: ActionQueueItem): NotificationQueueModel {
  const issueType = resolveIssueType(item);
  const recovering = isRecoveringDrivingAssessment(item, issueType);
  const timestamps = extractTimestamps(item, recovering);
  const cta = resolveNotificationCta(item, issueType);
  const semanticKey = item.semanticKey ?? item.id;
  const entity = resolveEntity(item);

  const model: NotificationQueueModel = {
    severity: mapOperationalSeverity(item, recovering, issueType),
    lifecycleStatus: resolveLifecycle(item, recovering),
    readStatus: resolveReadStatus(item, recovering),
    domain: resolveDomain(item, issueType),
    source: resolveSourceKind(item),
    legacySource: item.source,
    ...timestamps,
    entityType: entity.entityType,
    entityId: entity.entityId,
    actionType: cta.actionType,
    actionTarget: cta.actionTarget,
    semanticKey,
    sortMs: 0,
    issueType,
    conditionCode: parseConditionCode(semanticKey),
  };

  model.sortMs = computeNotificationSortMs(model);
  return model;
}

export type NotificationTitleKey =
  | 'notification.title.drivingAssessmentDegraded'
  | 'notification.title.drivingAssessmentRecovering'
  | 'notification.title.technicalObservation'
  | 'notification.title.pickupOverdue'
  | 'notification.title.pickupScheduled'
  | 'notification.title.returnOverdue'
  | 'notification.title.returnInspection'
  | 'notification.title.returnScheduled'
  | 'notification.title.stationShortage'
  | 'notification.title.batteryCritical'
  | 'notification.title.tireCritical'
  | 'notification.title.serviceOverdue'
  | 'notification.title.fleetTelemetry'
  | 'notification.title.handoverBacklog'
  | 'notification.fallback';

export function resolveNotificationTitleKey(
  item: ActionQueueItem,
  issueType?: string,
): NotificationTitleKey {
  const type = issueType ?? resolveIssueType(item);
  if (type === 'driving_assessment_device_quality') {
    return isRecoveringDrivingAssessment(item, type)
      ? 'notification.title.drivingAssessmentRecovering'
      : 'notification.title.drivingAssessmentDegraded';
  }
  if (type === 'technical_observation_active') return 'notification.title.technicalObservation';
  if (type === 'pickup_overdue') return 'notification.title.pickupOverdue';
  if (type === 'return_overdue') return 'notification.title.returnOverdue';
  if (type === 'return_inspection_required') return 'notification.title.returnInspection';
  if (type === 'station_shortage') return 'notification.title.stationShortage';
  if (type === 'battery_critical') return 'notification.title.batteryCritical';
  if (type === 'tire_monitor' || type === 'tire_critical') return 'notification.title.tireCritical';
  if (type === 'service_overdue') return 'notification.title.serviceOverdue';
  if (item.id === 'derived-fleet-soft-offline-telemetry') return 'notification.title.fleetTelemetry';
  if (item.id === 'derived-handover-backlog') return 'notification.title.handoverBacklog';
  if (item.pickupItem && !item.pickupItem.isOverdue) return 'notification.title.pickupScheduled';
  if (item.returnItem && !item.returnItem.isOverdue) return 'notification.title.returnScheduled';
  return 'notification.fallback';
}

export function localizeNotificationTitle(
  item: ActionQueueItem,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
  locale: Locale | string,
): string {
  const issueType = resolveIssueType(item);
  const key = resolveNotificationTitleKey(item, issueType);
  if (key === 'notification.fallback') {
    return item.title;
  }
  const label =
    item.entityLabel?.split(' · ')[0]?.trim() ||
    item.entityLabel ||
    item.vehicleId ||
    '';
  return t(key as TranslationKey, { label, plate: label });
}

export interface EnrichedActionQueueItem extends ActionQueueItem {
  queue: NotificationQueueModel;
  displayTitle: string;
  displayTimeLabel: string;
}

export function enrichNotificationQueueItem(
  item: ActionQueueItem,
  options: {
    locale: Locale | string;
    referenceNowMs: number;
    t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  },
): EnrichedActionQueueItem {
  const queue = buildNotificationQueueModel(item);
  const displayTitle = localizeNotificationTitle(item, options.t, options.locale);
  const displayTimeLabel = formatNotificationTimeLabel(queue, {
    locale: options.locale,
    referenceNowMs: options.referenceNowMs,
  });

  const displaySeverity = queue.severity;
  const legacySeverity =
    displaySeverity === 'success'
      ? 'info'
      : displaySeverity === 'critical'
        ? 'critical'
        : displaySeverity === 'warning'
          ? 'warning'
          : 'info';

  const cta = resolveNotificationCta(item, queue.issueType);

  return {
    ...item,
    queue,
    displayTitle,
    displayTimeLabel,
    title: displayTitle,
    timeLabel: displayTimeLabel,
    timeSortMs: queue.sortMs,
    severity: legacySeverity,
    tone:
      displaySeverity === 'success'
        ? 'success'
        : displaySeverity === 'critical'
          ? 'critical'
          : displaySeverity === 'warning'
            ? 'watch'
            : 'neutral',
    cta: cta.legacyCta,
    module: cta.module ?? item.module,
  };
}

export function enrichNotificationQueueItems(
  items: ActionQueueItem[],
  options: {
    locale: Locale | string;
    referenceNowMs: number;
    t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  },
): EnrichedActionQueueItem[] {
  return items.map((item) => enrichNotificationQueueItem(item, options));
}
