import type { Locale } from '../../i18n/LanguageContext';
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

function formatRelativePast(ms: number, referenceNowMs: number, de: boolean): string {
  const diffMs = referenceNowMs - ms;
  if (diffMs < 0) return de ? 'jetzt' : 'now';
  const absMin = Math.round(diffMs / 60_000);
  if (absMin < 1) return de ? 'jetzt' : 'now';
  if (absMin < 60) return de ? `vor ${absMin} Min.` : `${absMin}m ago`;
  const hours = Math.floor(absMin / 60);
  if (hours < 24) return de ? `vor ${hours} Std.` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return de ? `vor ${days} T.` : `${days}d ago`;
}

export function formatNotificationTimeLabel(
  model: Pick<
    NotificationQueueModel,
    'lifecycleStatus' | 'lastSeenAt' | 'resolvedAt' | 'occurredAt' | 'createdAt'
  >,
  context: NotificationTimeContext,
): string {
  const de = context.locale === 'de';
  const intlLocale = de ? 'de-DE' : 'en-US';

  if (model.lifecycleStatus === 'resolved' || model.lifecycleStatus === 'archived') {
    const resolvedMs = parseIsoMs(model.resolvedAt) ?? parseIsoMs(model.lastSeenAt);
    if (resolvedMs != null) {
      return de
        ? `behoben um ${formatClockTime(new Date(resolvedMs).toISOString(), context.locale)}`
        : `resolved at ${formatClockTime(new Date(resolvedMs).toISOString(), context.locale)}`;
    }
  }

  const lastSeenMs = parseIsoMs(model.lastSeenAt) ?? parseIsoMs(model.occurredAt);
  if (lastSeenMs != null) {
    const diffMs = context.referenceNowMs - lastSeenMs;
    if (diffMs >= 0 && diffMs < 24 * 60 * 60_000) {
      return de
        ? `zuletzt erkannt ${formatRelativePast(lastSeenMs, context.referenceNowMs, true)}`
        : `last seen ${formatRelativePast(lastSeenMs, context.referenceNowMs, false)}`;
    }
    return de ? `seit ${formatShortDate(new Date(lastSeenMs).toISOString(), context.locale)}` : `since ${formatShortDate(new Date(lastSeenMs).toISOString(), context.locale)}`;
  }

  const occurredMs = parseIsoMs(model.occurredAt) ?? parseIsoMs(model.createdAt);
  if (occurredMs != null) {
    return formatRelativePast(occurredMs, context.referenceNowMs, de);
  }

  return '';
}

export function isResolvedLifecycle(status: NotificationLifecycleStatus): boolean {
  return status === 'resolved' || status === 'archived';
}
