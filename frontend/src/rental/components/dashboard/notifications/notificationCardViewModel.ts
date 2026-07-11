import type { TranslationKey } from '../../../i18n/translations/en';
import type { ActionQueueItem } from '../dashboardTypes';
import type { NotificationDomain, NotificationLifecycleStatus, NotificationSeverity } from '../notificationQueueModel';
import {
  notificationCtaLabelKey,
  notificationDomainLabel,
  createNotificationTranslator,
} from '../notificationQueueEnricher';
import { formatNotificationTimeLabel } from '../notificationTimeSemantics';
import type { ApiNotificationAvailableAction } from '../../../lib/notifications/notification-api.types';

export interface NotificationCardViewModel {
  id: string;
  severity: NotificationSeverity;
  severityLabelKey: TranslationKey;
  lifecycleStatus: NotificationLifecycleStatus;
  readStatus: 'read' | 'unread';
  domain: NotificationDomain;
  domainLabel: string;
  timeLabel: string;
  occurrenceLabel: string | null;
  title: string;
  entityLine: string | null;
  description: string;
  ctaLabel: string;
  eventType?: string;
  acknowledged: boolean;
  snoozed: boolean;
  resolved: boolean;
  availableActions: ApiNotificationAvailableAction[];
}

function buildEntityLine(item: ActionQueueItem): string | null {
  const params = item.entityContextParams;
  if (params?.entityLine) return params.entityLine;

  const plate = params?.plate ?? item.entityLabel;
  const make = params?.make;
  const model = params?.model;
  const year = params?.year;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuid = (value: string) => UUID_RE.test(value.trim());

  if (plate && isUuid(plate)) return make && model ? `${make} ${model}` : null;
  if (item.entityLabel && isUuid(item.entityLabel)) return null;

  if (plate && make && model) {
    const yearSuffix = year ? ` ${year}` : '';
    return `${plate} · ${make} ${model}${yearSuffix}`;
  }
  if (plate && !isUuid(plate)) return plate;
  if (item.entityLabel && !isUuid(item.entityLabel)) return item.entityLabel;
  return null;
}

function resolveCtaLabel(
  item: ActionQueueItem,
  t: ReturnType<typeof createNotificationTranslator>,
  de: boolean,
): string {
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
  if (actionType) {
    const key = notificationCtaLabelKey(actionType);
    if (key === 'notification.cta.openVehicle') return t('notification.cta.checkVehicle');
    return t(key);
  }

  if (item.cta === 'open-vehicle') return de ? 'Fahrzeug prüfen' : 'Check vehicle';
  if (item.cta === 'open-booking') return t('notification.cta.openBooking');
  return t('notification.cta.openRental');
}

function severityLabelKey(
  severity: NotificationSeverity,
  lifecycle: NotificationLifecycleStatus,
): TranslationKey {
  if (lifecycle === 'resolved' || lifecycle === 'archived' || severity === 'success') {
    return 'notification.severity.success';
  }
  if (lifecycle === 'acknowledged') return 'notification.status.acknowledged';
  if (lifecycle === 'snoozed') return 'notification.status.snoozed';
  if (severity === 'critical') return 'notification.severity.critical';
  if (severity === 'warning') return 'notification.severity.warning';
  return 'notification.severity.info';
}

function occurrenceLabel(
  count: number | undefined,
  locale: string,
  t: ReturnType<typeof createNotificationTranslator>,
): string | null {
  if (!count || count <= 1) return null;
  return t('notification.meta.occurrences', { count });
}

export function buildNotificationCardViewModel(
  item: ActionQueueItem,
  locale: string,
  referenceNowMs: number,
): NotificationCardViewModel | null {
  const queue = item.queue;
  if (!queue) return null;

  const de = locale === 'de';
  const t = createNotificationTranslator(locale);

  const severity: NotificationSeverity =
    queue.lifecycleStatus === 'resolved' || queue.lifecycleStatus === 'archived'
      ? 'success'
      : queue.severity;

  const timeLabel = formatNotificationTimeLabel(queue, { locale, referenceNowMs });

  return {
    id: item.id,
    severity,
    lifecycleStatus: queue.lifecycleStatus,
    readStatus: queue.readStatus,
    domain: queue.domain,
    domainLabel: notificationDomainLabel(queue.domain, t),
    timeLabel,
    occurrenceLabel: occurrenceLabel(item.occurrenceCount, locale, t),
    title: item.title,
    entityLine: buildEntityLine(item),
    description: item.reason,
    ctaLabel: resolveCtaLabel(item, t, de),
    eventType: item.issueType,
    acknowledged: queue.lifecycleStatus === 'acknowledged',
    snoozed: queue.lifecycleStatus === 'snoozed',
    resolved: queue.lifecycleStatus === 'resolved' || queue.lifecycleStatus === 'archived',
    availableActions: item.availableActions ?? [],
    severityLabelKey: severityLabelKey(severity, queue.lifecycleStatus),
  };
}

export function getNotificationCardSeverityLabel(
  card: NotificationCardViewModel,
  t: ReturnType<typeof createNotificationTranslator>,
): string {
  return t(card.severityLabelKey);
}
