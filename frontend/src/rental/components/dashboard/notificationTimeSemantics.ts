import { dt, dashboardFormattingLocale } from './dashboard-i18n';
import type { Locale } from '../../../i18n/LanguageContext';
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
  return date.toLocaleTimeString(dashboardFormattingLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(iso: string, locale: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(dashboardFormattingLocale(locale), {
    day: '2-digit',
    month: '2-digit',
  });
}

function formatRelativePast(ms: number, referenceNowMs: number, locale: string): string {
  const diffMs = referenceNowMs - ms;
  if (diffMs < 0) return dt(locale, 'dashboard.time.now');
  const absMin = Math.round(diffMs / 60_000);
  if (absMin < 1) return dt(locale, 'dashboard.time.now');
  if (absMin < 60) return dt(locale, 'dashboard.time.agoMinutes', { count: absMin });
  const hours = Math.floor(absMin / 60);
  if (hours < 24) return dt(locale, 'dashboard.time.agoHours', { count: hours });
  const days = Math.floor(hours / 24);
  return dt(locale, 'dashboard.time.agoDays', { count: days });
}

export function formatNotificationTimeLabel(
  model: Pick<
    NotificationQueueModel,
    'lifecycleStatus' | 'lastSeenAt' | 'resolvedAt' | 'occurredAt' | 'createdAt'
  >,
  context: NotificationTimeContext,
): string {
  const locale = context.locale;

  if (model.lifecycleStatus === 'resolved' || model.lifecycleStatus === 'archived') {
    const resolvedMs = parseIsoMs(model.resolvedAt) ?? parseIsoMs(model.lastSeenAt);
    if (resolvedMs != null) {
      return dt(locale, 'notification.time.resolvedAt', {
        time: formatClockTime(new Date(resolvedMs).toISOString(), locale),
      });
    }
  }

  const lastSeenMs = parseIsoMs(model.lastSeenAt) ?? parseIsoMs(model.occurredAt);
  if (lastSeenMs != null) {
    const diffMs = context.referenceNowMs - lastSeenMs;
    if (diffMs >= 0 && diffMs < 24 * 60 * 60_000) {
      return dt(locale, 'notification.time.lastSeen', {
        relative: formatRelativePast(lastSeenMs, context.referenceNowMs, locale),
      });
    }
    return dt(locale, 'notification.time.sinceDate', {
      date: formatShortDate(new Date(lastSeenMs).toISOString(), locale),
    });
  }

  const occurredMs = parseIsoMs(model.occurredAt) ?? parseIsoMs(model.createdAt);
  if (occurredMs != null) {
    return formatRelativePast(occurredMs, context.referenceNowMs, locale);
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
  const locale = context.locale;

  if (model.lifecycleStatus === 'resolved' || model.lifecycleStatus === 'archived') {
    const resolvedMs = parseIsoMs(model.resolvedAt) ?? parseIsoMs(model.lastSeenAt);
    if (resolvedMs != null) {
      const rel = formatRelativePast(resolvedMs, context.referenceNowMs, locale);
      return dt(locale, 'notification.time.resolvedShort', { relative: rel });
    }
  }

  const lastSeenMs = parseIsoMs(model.lastSeenAt) ?? parseIsoMs(model.occurredAt);
  if (lastSeenMs != null) {
    const rel = formatRelativePast(lastSeenMs, context.referenceNowMs, locale);
    return dt(locale, 'notification.time.lastShort', { relative: rel });
  }

  const occurredMs = parseIsoMs(model.occurredAt) ?? parseIsoMs(model.createdAt);
  if (occurredMs != null) {
    const rel = formatRelativePast(occurredMs, context.referenceNowMs, locale);
    return dt(locale, 'notification.time.lastShort', { relative: rel });
  }

  return '';
}

export function isResolvedLifecycle(status: NotificationLifecycleStatus): boolean {
  return status === 'resolved' || status === 'archived';
}
