import type { Locale } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { createNotificationTranslator } from './notificationQueueEnricher';
import type { NotificationLifecycleStatus, NotificationQueueModel } from './notificationQueueModel';

export interface NotificationTimeContext {
  locale: Locale | string;
  referenceNowMs: number;
}

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Sort priority: lastSeenAt (open) → resolvedAt (resolved) → occurredAt → createdAt.
 * Never uses render-time Date.now() as event time.
 */
export function computeNotificationSortMs(model: Pick<
  NotificationQueueModel,
  'lifecycleStatus' | 'lastSeenAt' | 'resolvedAt' | 'occurredAt' | 'createdAt'
>): number {
  const isResolved = model.lifecycleStatus === 'resolved' || model.lifecycleStatus === 'archived';
  if (isResolved) {
    const resolved = parseIsoMs(model.resolvedAt);
    if (resolved != null) return resolved;
  }
  const lastSeen = parseIsoMs(model.lastSeenAt);
  if (lastSeen != null) return lastSeen;
  const occurred = parseIsoMs(model.occurredAt);
  if (occurred != null) return occurred;
  const created = parseIsoMs(model.createdAt);
  if (created != null) return created;
  return 0;
}

function formatClockTime(iso: string, locale: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(locale === 'de' ? 'de-DE' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(iso: string, locale: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
  });
}

function formatRelativePast(
  ms: number,
  referenceNowMs: number,
  t: ReturnType<typeof createNotificationTranslator>,
): string {
  const diffMs = referenceNowMs - ms;
  if (diffMs < 0) return t('notification.time.now');
  const absMin = Math.round(diffMs / 60_000);
  if (absMin < 1) return t('notification.time.now');
  if (absMin < 60) return t('notification.time.minutesAgo', { count: absMin });
  const hours = Math.floor(absMin / 60);
  if (hours < 24) return t('notification.time.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  return t('notification.time.daysAgo', { count: days });
}

function translatorFor(context: NotificationTimeContext) {
  return createNotificationTranslator(context.locale);
}

/**
 * Long-form time label for detail surfaces — distinguishes last seen vs resolved.
 */
export function formatNotificationTimeLabel(
  model: Pick<
    NotificationQueueModel,
    'lifecycleStatus' | 'lastSeenAt' | 'resolvedAt' | 'occurredAt' | 'createdAt'
  >,
  context: NotificationTimeContext,
): string {
  const t = translatorFor(context);

  if (model.lifecycleStatus === 'resolved' || model.lifecycleStatus === 'archived') {
    const resolvedMs = parseIsoMs(model.resolvedAt) ?? parseIsoMs(model.lastSeenAt);
    if (resolvedMs != null) {
      return t('notification.time.resolvedAt', {
        time: formatClockTime(new Date(resolvedMs).toISOString(), context.locale),
      });
    }
  }

  const lastSeenMs = parseIsoMs(model.lastSeenAt) ?? parseIsoMs(model.occurredAt);
  if (lastSeenMs != null) {
    const diffMs = context.referenceNowMs - lastSeenMs;
    if (diffMs >= 0 && diffMs < 24 * 60 * 60_000) {
      return t('notification.time.lastSeenRelative', {
        relative: formatRelativePast(lastSeenMs, context.referenceNowMs, t),
      });
    }
    return t('notification.time.sinceDate', {
      date: formatShortDate(new Date(lastSeenMs).toISOString(), context.locale),
    });
  }

  const occurredMs = parseIsoMs(model.occurredAt) ?? parseIsoMs(model.createdAt);
  if (occurredMs != null) {
    return formatRelativePast(occurredMs, context.referenceNowMs, t);
  }

  return '';
}

/** Compact top-right label for notification panel summary rows. */
export function formatNotificationLastSeenShort(
  model: Pick<
    NotificationQueueModel,
    'lifecycleStatus' | 'lastSeenAt' | 'resolvedAt' | 'occurredAt' | 'createdAt'
  >,
  context: NotificationTimeContext,
): string {
  const t = translatorFor(context);

  if (model.lifecycleStatus === 'resolved' || model.lifecycleStatus === 'archived') {
    const resolvedMs = parseIsoMs(model.resolvedAt) ?? parseIsoMs(model.lastSeenAt);
    if (resolvedMs != null) {
      const rel = formatRelativePast(resolvedMs, context.referenceNowMs, t);
      return t('notification.time.resolvedShort', { relative: rel });
    }
  }

  const lastSeenMs = parseIsoMs(model.lastSeenAt) ?? parseIsoMs(model.occurredAt);
  if (lastSeenMs != null) {
    const rel = formatRelativePast(lastSeenMs, context.referenceNowMs, t);
    return t('notification.time.lastShort', { relative: rel });
  }

  const occurredMs = parseIsoMs(model.occurredAt) ?? parseIsoMs(model.createdAt);
  if (occurredMs != null) {
    const rel = formatRelativePast(occurredMs, context.referenceNowMs, t);
    return t('notification.time.lastShort', { relative: rel });
  }

  return '';
}

export function lifecycleStatusLabelKey(
  status: NotificationLifecycleStatus,
): TranslationKey | null {
  if (status === 'acknowledged') return 'notification.status.acknowledged';
  if (status === 'snoozed') return 'notification.status.snoozed';
  return null;
}

export function isResolvedLifecycle(status: NotificationLifecycleStatus): boolean {
  return status === 'resolved' || status === 'archived';
}
