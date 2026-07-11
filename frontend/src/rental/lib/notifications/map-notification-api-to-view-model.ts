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

function formatTimeLabel(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function safeTitleKey(key: string): TranslationKey {
  return key as TranslationKey;
}

function interpolateTemplate(
  locale: string,
  titleKey: string,
  bodyKey: string,
  params: Record<string, string | number | boolean | null>,
): { title: string; reason: string } {
  const t = createNotificationTranslator(locale);
  const title = t(safeTitleKey(titleKey), params as Record<string, string | number>);
  const body = t(safeTitleKey(bodyKey), params as Record<string, string | number>);
  if (title === titleKey) {
    const label = params.label ?? params.plate ?? params.stationName ?? params.bookingRef;
    return {
      title: label ? String(label) : titleKey,
      reason: body === bodyKey ? '' : body,
    };
  }
  return { title, reason: body === bodyKey ? '' : body };
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
  const { title, reason } = interpolateTemplate(
    locale,
    row.titleKey,
    row.bodyKey,
    row.templateParams ?? {},
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
    entityLabel: row.entity.displayLabel,
    timeLabel: formatTimeLabel(row.lastSeenAt, locale),
    timeSortMs: sortMs,
    priority: severity === 'critical' ? 100 : severity === 'warning' ? 50 : 10,
    tone: severity === 'critical' ? 'critical' : severity === 'warning' ? 'warning' : 'info',
    cta: legacyCta,
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
