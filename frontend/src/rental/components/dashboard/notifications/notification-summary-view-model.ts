import type { TranslationKey } from '../../../i18n/translations/en';
import type { ActionQueueGroupItem, ActionQueueItem } from '../dashboardTypes';
import type { NotificationDomain, NotificationLifecycleStatus, NotificationSeverity } from '../notificationQueueModel';
import {
  notificationDomainLabel,
  createNotificationTranslator,
} from '../notificationQueueEnricher';
import { formatNotificationLastSeenShort } from '../notificationTimeSemantics';
import { notificationDomainIcon, notificationGroupIcon } from './notificationDomainIcon';
import { formatAffectedVehiclesPreview } from './notification-affected-vehicles';
import {
  isOverdueHandoverNotification,
  resolveOverdueHandoverEyebrow,
} from './notification-handover-copy';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** Canonical headline: Kennzeichen · Make Model Year (or station/booking label). */
export function buildNotificationHeadlineTitle(item: ActionQueueItem): string | null {
  const params = item.entityContextParams;
  if (params?.entityLine) return params.entityLine;

  const plate = params?.plate ?? item.entityLabel;
  const make = params?.make;
  const model = params?.model;
  const year = params?.year;

  if (plate && isUuid(plate)) return make && model ? `${make} ${model}` : null;
  if (item.entityLabel && isUuid(item.entityLabel)) return null;

  if (plate && make && model) {
    const yearSuffix = year ? ` ${year}` : '';
    return `${plate} · ${make} ${model}${yearSuffix}`;
  }
  if (plate && !isUuid(plate)) return plate;
  if (item.entityLabel && !isUuid(item.entityLabel)) return item.entityLabel;
  return item.title?.trim() || null;
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

function resolveSeverity(
  item: ActionQueueItem,
): NotificationSeverity {
  const queue = item.queue;
  if (!queue) return 'info';
  if (queue.lifecycleStatus === 'resolved' || queue.lifecycleStatus === 'archived') {
    return 'success';
  }
  return queue.severity;
}

export interface NotificationSummaryViewModel {
  id: string;
  severity: NotificationSeverity;
  severityLabelKey: TranslationKey;
  eyebrowLabel: string;
  headlineTitle: string;
  subtitle?: string;
  lastSeenLabel: string;
  iconName: string;
  iconCount: number;
  showIconCount: boolean;
  resolved: boolean;
  unread: boolean;
  expandable: boolean;
}

function summaryFromItem(
  item: ActionQueueItem,
  locale: string,
  referenceNowMs: number,
  overrides: Partial<Pick<NotificationSummaryViewModel, 'iconCount' | 'expandable' | 'id'>> = {},
): NotificationSummaryViewModel | null {
  const queue = item.queue;
  if (!queue) return null;

  const t = createNotificationTranslator(locale);
  const severity = resolveSeverity(item);

  const isTariffFleetAlert =
    item.id === 'derived-vehicles-without-tariff' || item.issueType === 'vehicles_without_tariff';
  const affectedVehicleCount = item.affectedVehicles?.length ?? 0;
  const subtitle =
    !isTariffFleetAlert && affectedVehicleCount > 0
      ? formatAffectedVehiclesPreview(item.affectedVehicles!, locale)
      : undefined;

  return {
    id: overrides.id ?? item.id,
    severity,
    severityLabelKey: severityLabelKey(severity, queue.lifecycleStatus),
    eyebrowLabel: isOverdueHandoverNotification(item)
      ? resolveOverdueHandoverEyebrow(locale)
      : notificationDomainLabel(queue.domain, t),
    headlineTitle: buildNotificationHeadlineTitle(item) ?? item.title,
    subtitle,
    lastSeenLabel: formatNotificationLastSeenShort(queue, { locale, referenceNowMs }),
    iconName: notificationDomainIcon(queue.domain, item.issueType),
    iconCount:
      isTariffFleetAlert && affectedVehicleCount > 0
        ? affectedVehicleCount
        : (overrides.iconCount ?? 1),
    showIconCount: isTariffFleetAlert && affectedVehicleCount > 0,
    resolved: queue.lifecycleStatus === 'resolved' || queue.lifecycleStatus === 'archived',
    unread: queue.readStatus === 'unread',
    expandable: overrides.expandable ?? true,
  };
}

export function buildNotificationSummaryFromItem(
  item: ActionQueueItem,
  locale: string,
  referenceNowMs: number,
): NotificationSummaryViewModel | null {
  return summaryFromItem(item, locale, referenceNowMs);
}

export function buildNotificationSummaryFromGroup(
  group: ActionQueueGroupItem,
  itemsById: Map<string, ActionQueueItem>,
  locale: string,
  referenceNowMs: number,
): NotificationSummaryViewModel | null {
  const head = itemsById.get(group.children[0]?.itemId ?? '');
  if (!head?.queue) return null;

  const t = createNotificationTranslator(locale);
  const childItems = group.children
    .map((c) => itemsById.get(c.itemId))
    .filter((item): item is ActionQueueItem => Boolean(item?.queue));

  let worstSeverity: NotificationSeverity = 'info';
  let worstLifecycle: NotificationLifecycleStatus = head.queue.lifecycleStatus;
  for (const item of childItems) {
    const sev = resolveSeverity(item);
    const rank = sev === 'critical' ? 3 : sev === 'warning' ? 2 : sev === 'success' ? 0 : 1;
    const worstRank =
      worstSeverity === 'critical' ? 3 : worstSeverity === 'warning' ? 2 : worstSeverity === 'success' ? 0 : 1;
    if (rank > worstRank) {
      worstSeverity = sev;
      worstLifecycle = item.queue!.lifecycleStatus;
    }
  }

  const headlineTitle =
    buildNotificationHeadlineTitle(head) ?? group.title ?? group.entityLabel ?? '';

  const eyebrowChild = childItems.find((item) => item.queue?.domain) ?? head;
  const eyebrowLabel = eyebrowChild.queue
    ? notificationDomainLabel(eyebrowChild.queue.domain, t)
    : notificationDomainLabel('operations' as NotificationDomain, t);

  const lastSeenLabel = childItems.reduce((best, item) => {
    const label = formatNotificationLastSeenShort(item.queue!, { locale, referenceNowMs });
    return label.length > best.length ? label : best;
  }, formatNotificationLastSeenShort(head.queue, { locale, referenceNowMs }));

  return {
    id: group.id,
    severity: worstSeverity,
    severityLabelKey: severityLabelKey(worstSeverity, worstLifecycle),
    eyebrowLabel,
    headlineTitle,
    lastSeenLabel,
    iconName: notificationGroupIcon(group, itemsById),
    iconCount: group.children.length,
    showIconCount: true,
    resolved: childItems.every(
      (item) =>
        item.queue?.lifecycleStatus === 'resolved' || item.queue?.lifecycleStatus === 'archived',
    ),
    unread: childItems.some((item) => item.queue?.readStatus === 'unread'),
    expandable: true,
  };
}
