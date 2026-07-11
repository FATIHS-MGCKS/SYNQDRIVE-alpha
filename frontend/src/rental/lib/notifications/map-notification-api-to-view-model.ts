import type { ActionQueueCategory, ActionQueueItem, ActionQueueSeverity } from '../../components/dashboard/dashboardTypes';
import type { TranslationKey } from '../../i18n/translations/en';
import { createNotificationTranslator } from '../../components/dashboard/notificationQueueEnricher';
import type {
  NotificationDomain,
  NotificationEntityType,
  NotificationLifecycleStatus,
  NotificationQueueModel,
  NotificationSeverity,
} from '../../components/dashboard/notificationQueueModel';
import type { ApiNotificationResponse } from './notification-api.types';
import {
  isKnownApiActionType,
  mapApiActionTarget,
  mapApiActionToLegacyCta,
  mapApiActionType,
} from './notification-v2-action-router';

function extractEntityContext(params: Record<string, string | number | boolean | null>) {
  const plate = params.plate ?? params.label;
  const make = params.make;
  const model = params.model;
  const year = params.year;
  return {
    plate: plate != null ? String(plate) : undefined,
    make: make != null ? String(make) : undefined,
    model: model != null ? String(model) : undefined,
    year: typeof year === 'string' || typeof year === 'number' ? year : undefined,
    code: params.code != null ? String(params.code) : undefined,
    reason: params.reason != null ? String(params.reason) : undefined,
    idleDays: typeof params.idleDays === 'number' ? params.idleDays : undefined,
    lostRevenueEur: typeof params.lostRevenueEur === 'number' ? params.lostRevenueEur : undefined,
    available: typeof params.available === 'number' ? params.available : undefined,
    totalVehicles: typeof params.totalVehicles === 'number' ? params.totalVehicles : undefined,
    bookedOut: typeof params.bookedOut === 'number' ? params.bookedOut : undefined,
  };
}

const API_DOMAIN_MAP: Record<string, NotificationDomain> = {
  OPERATIONS: 'operations',
  VEHICLE_HEALTH: 'vehicle-health',
  DRIVING_ANALYSIS: 'driving-analysis',
  BOOKINGS: 'bookings',
  HANDOVERS: 'handovers',
  DOCUMENTS: 'documents',
  BILLING: 'billing',
  SECURITY: 'security',
  SYSTEM: 'system',
};

const API_ENTITY_MAP: Record<string, NotificationEntityType> = {
  VEHICLE: 'vehicle',
  BOOKING: 'booking',
  STATION: 'station',
  CUSTOMER: 'customer',
  INVOICE: 'invoice',
  TRIP: 'trip',
  FLEET: 'fleet',
  ORGANIZATION: 'organization',
};

function mapSeverity(severity: ApiNotificationResponse['severity']): NotificationSeverity {
  switch (severity) {
    case 'CRITICAL':
      return 'critical';
    case 'WARNING':
      return 'warning';
    case 'SUCCESS':
      return 'success';
    default:
      return 'info';
  }
}

function mapActionQueueSeverity(severity: NotificationSeverity): ActionQueueSeverity {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'warning';
  if (severity === 'success') return 'info';
  return 'info';
}

function mapLifecycle(status: ApiNotificationResponse['status']): NotificationLifecycleStatus {
  switch (status) {
    case 'ACKNOWLEDGED':
      return 'acknowledged';
    case 'SNOOZED':
      return 'snoozed';
    case 'RESOLVED':
      return 'resolved';
    case 'ARCHIVED':
      return 'archived';
    default:
      return 'open';
  }
}

function mapCategory(domain: NotificationDomain): ActionQueueCategory {
  if (domain === 'vehicle-health' || domain === 'driving-analysis') return 'health';
  if (domain === 'handovers') return 'handover';
  if (domain === 'bookings') return 'booking';
  if (domain === 'billing') return 'financial';
  if (domain === 'system' || domain === 'security' || domain === 'documents') return 'notification';
  return 'operations';
}

function safeTitleKey(key: string): TranslationKey {
  return key as TranslationKey;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidLike(value: string): boolean {
  return UUID_RE.test(value.trim());
}

const LEGACY_FALLBACK_TITLE_KEYS: Record<string, TranslationKey> = {
  LOW_UTILIZATION: 'notification.title.lowUtilization',
  HM_SERVICE_NO_TRACKING: 'notification.title.hmServiceNoTracking',
  STATION_SHORTAGE: 'notification.title.stationShortage',
  BATTERY_CRITICAL: 'notification.title.batteryCritical',
  TIRE_CRITICAL: 'notification.title.tireCritical',
  SERVICE_OVERDUE: 'notification.title.serviceOverdue',
  ACTIVE_DTC: 'notification.title.activeDtc',
};

const LEGACY_FALLBACK_BODY_KEYS: Record<string, TranslationKey> = {
  LOW_UTILIZATION: 'notification.body.lowUtilization',
  HM_SERVICE_NO_TRACKING: 'notification.body.hmServiceNoTracking',
  STATION_SHORTAGE: 'notification.body.stationShortage',
  ACTIVE_DTC: 'notification.body.activeDtc',
};

function resolveTitleKey(
  row: ApiNotificationResponse,
  params: Record<string, string | number | boolean | null>,
): string {
  const { titleKey } = resolveTemplateKeys(row);
  if (row.eventType === 'STATION_SHORTAGE') {
    const available = typeof params.available === 'number' ? params.available : -1;
    if (available <= 0) return 'notification.title.stationShortageCritical';
    return titleKey === 'notification.fallback'
      ? 'notification.title.stationShortage'
      : titleKey;
  }
  return titleKey;
}

function resolveTemplateKeys(row: ApiNotificationResponse): { titleKey: string; bodyKey: string } {
  const titleKey =
    row.titleKey === 'notification.fallback'
      ? (LEGACY_FALLBACK_TITLE_KEYS[row.eventType] ?? row.titleKey)
      : row.titleKey;
  const bodyKey =
    row.bodyKey === 'notification.body.insightDefault'
      ? (LEGACY_FALLBACK_BODY_KEYS[row.eventType] ?? row.bodyKey)
      : row.bodyKey;
  return { titleKey, bodyKey };
}

function resolveDisplayLabel(
  row: ApiNotificationResponse,
  params: Record<string, string | number | boolean | null>,
): string | undefined {
  const candidates = [
    row.entity.displayLabel,
    params.label,
    params.plate,
    params.stationName,
    params.bookingRef,
  ];
  for (const candidate of candidates) {
    if (candidate == null || candidate === '') continue;
    const value = String(candidate);
    if (isUuidLike(value)) continue;
    return value;
  }
  return undefined;
}

function interpolateTemplate(
  locale: string,
  titleKey: string,
  bodyKey: string,
  params: Record<string, string | number | boolean | null>,
  displayLabel?: string,
): { title: string; reason: string } {
  const t = createNotificationTranslator(locale);
  const title = t(safeTitleKey(titleKey), params as Record<string, string | number>);
  const body = t(safeTitleKey(bodyKey), params as Record<string, string | number>);
  const reasonFromParams =
    params.reason != null && String(params.reason).trim() ? String(params.reason).trim() : '';
  if (title === titleKey) {
    const label =
      displayLabel
      ?? (params.label != null && !isUuidLike(String(params.label)) ? String(params.label) : undefined)
      ?? (params.plate != null && !isUuidLike(String(params.plate)) ? String(params.plate) : undefined)
      ?? (params.stationName != null ? String(params.stationName) : undefined)
      ?? (params.bookingRef != null ? String(params.bookingRef) : undefined);
    return {
      title: label ?? titleKey,
      reason: body === bodyKey ? reasonFromParams : body,
    };
  }
  return {
    title,
    reason: body === bodyKey ? reasonFromParams : body,
  };
}

function buildSemanticKey(row: ApiNotificationResponse): string {
  return `${row.entity.type}:${row.entity.id}:${row.domain}:${row.eventType}`;
}

export function mapNotificationApiToActionQueueItem(
  row: ApiNotificationResponse,
  locale: string,
): ActionQueueItem {
  const domain = API_DOMAIN_MAP[row.domain] ?? 'operations';
  const entityType = API_ENTITY_MAP[row.entity.type] ?? 'organization';
  const severity = mapSeverity(row.severity);
  const actionType = row.action?.type ?? 'OPEN_RENTAL';
  const knownAction = isKnownApiActionType(actionType);
  const queueActionType = knownAction ? mapApiActionType(actionType) : 'open-rental';
  const actionTarget = mapApiActionTarget(actionType, row.action?.target ?? {});
  const sortMs = Date.parse(row.lastSeenAt) || Date.parse(row.firstSeenAt) || 0;
  const templateParams = row.templateParams ?? {};
  const entityContextParams = extractEntityContext(templateParams);
  const { bodyKey } = resolveTemplateKeys(row);
  const titleKey = resolveTitleKey(row, templateParams);
  const displayLabel = resolveDisplayLabel(row, templateParams);
  const interpolationParams = displayLabel && (isUuidLike(String(templateParams.label ?? '')) || !templateParams.label)
    ? { ...templateParams, label: displayLabel, plate: templateParams.plate && !isUuidLike(String(templateParams.plate)) ? templateParams.plate : displayLabel }
    : templateParams;
  const { title, reason } = interpolateTemplate(
    locale,
    titleKey,
    bodyKey,
    interpolationParams,
    displayLabel,
  );

  const queue: NotificationQueueModel = {
    severity,
    lifecycleStatus: mapLifecycle(row.status),
    readStatus: row.userReceipt?.readAt ? 'read' : 'unread',
    domain,
    source: 'runtime',
    legacySource: 'notifications-v2',
    occurredAt: row.firstSeenAt,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
    entityType,
    entityId: row.entity.id,
    actionType: queueActionType,
    actionTarget,
    semanticKey: buildSemanticKey(row),
    sortMs,
    issueType: row.eventType.toLowerCase(),
    conditionCode: row.eventType,
  };

  const legacyCta = knownAction ? mapApiActionToLegacyCta(actionType) : 'open-rental';

  return {
    id: row.id,
    semanticKey: queue.semanticKey,
    issueType: row.eventType,
    queue,
    source: 'notifications-v2',
    severity: mapActionQueueSeverity(severity),
    category: mapCategory(domain),
    title,
    reason,
    entityLabel: displayLabel ?? (row.entity.displayLabel && !isUuidLike(row.entity.displayLabel) ? row.entity.displayLabel : undefined),
    timeSortMs: sortMs,
    priority: severity === 'critical' ? 100 : severity === 'warning' ? 50 : 10,
    tone: severity === 'critical' ? 'critical' : severity === 'warning' ? 'warning' : 'info',
    cta: legacyCta,
    occurrenceCount: row.occurrenceCount,
    availableActions: row.availableActions,
    entityContextParams,
    vehicleId: row.action?.target?.vehicleId ?? (row.entity.type === 'VEHICLE' ? row.entity.id : undefined),
    bookingId: row.action?.target?.bookingId ?? (row.entity.type === 'BOOKING' ? row.entity.id : undefined),
    stationId: row.action?.target?.stationId ?? (row.entity.type === 'STATION' ? row.entity.id : undefined),
    customerId: row.action?.target?.customerId ?? (row.entity.type === 'CUSTOMER' ? row.entity.id : undefined),
    isOverdue: row.eventType.includes('OVERDUE'),
    pinned: row.severity === 'CRITICAL' && row.status === 'OPEN',
  };
}

/** Defensive dedupe by notification id only — not fachliche Hauptlogik. */
export function dedupeNotificationsById(items: ActionQueueItem[]): ActionQueueItem[] {
  const seen = new Set<string>();
  const out: ActionQueueItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out.sort((a, b) => b.timeSortMs - a.timeSortMs);
}

export function mapNotificationApiList(
  rows: ApiNotificationResponse[],
  locale: string,
): ActionQueueItem[] {
  return dedupeNotificationsById(rows.map((row) => mapNotificationApiToActionQueueItem(row, locale)));
}
