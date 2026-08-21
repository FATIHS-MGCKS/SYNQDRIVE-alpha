/**
 * Canonical task timeline presentation adapter (P2.2.16B.1).
 * Machine event codes and metadata stay unchanged; presentation uses TranslationKey maps.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  getFormattingLocale,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { ApiTaskStatus } from '../api';
import type { NormalizedTaskTimelineEvent, TaskCompletionMode } from './types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTechnicalUserLabel(label: string | null | undefined): boolean {
  if (!label?.trim()) return true;
  return UUID_RE.test(label.trim());
}

export interface TaskTimelineEventPresentation {
  eventCode: string;
  titleKey: TranslationKey;
  titleParams?: Record<string, string | number>;
  descriptionKey?: TranslationKey;
  descriptionParams?: Record<string, string | number>;
  /** User/API content — never translated */
  descriptionText?: string;
}

const RESOLUTION_CODE_KEYS: Record<string, TranslationKey> = {
  INVOICE_PAID: 'tasks.timeline.resolution.INVOICE_PAID',
  BOOKING_CANCELLED: 'tasks.timeline.resolution.BOOKING_CANCELLED',
  BOOKING_PHASE_SUPERSEDED: 'tasks.timeline.resolution.BOOKING_PHASE_SUPERSEDED',
  INVOICE_TASK_SUPERSEDED: 'tasks.timeline.resolution.INVOICE_TASK_SUPERSEDED',
  DOCUMENT_TASK_SUPERSEDED: 'tasks.timeline.resolution.DOCUMENT_TASK_SUPERSEDED',
  CLEANING_TASK_SUPERSEDED: 'tasks.timeline.resolution.CLEANING_TASK_SUPERSEDED',
  DOCUMENT_PHASE_SUPERSEDED: 'tasks.timeline.resolution.DOCUMENT_PHASE_SUPERSEDED',
};

const TASK_STATUS_KEYS: Record<ApiTaskStatus, TranslationKey> = {
  OPEN: 'tasks.filter.status.OPEN',
  IN_PROGRESS: 'tasks.filter.status.IN_PROGRESS',
  WAITING: 'tasks.filter.status.WAITING',
  DONE: 'tasks.filter.status.DONE',
  CANCELLED: 'tasks.filter.status.CANCELLED',
};

export function resolveTaskTimelinePresentationLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function ttp(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveTaskTimelinePresentationLocale(locale), key, vars).text;
}

function readMeta(event: NormalizedTaskTimelineEvent): Record<string, unknown> {
  return event.metadata ?? {};
}

function taskStatusPresentation(locale: string, status: string): string {
  const key = TASK_STATUS_KEYS[status as ApiTaskStatus];
  return key ? ttp(locale, key) : status.replace(/_/g, ' ');
}

function resolveResolutionPresentation(
  locale: string,
  meta: Record<string, unknown>,
): string | null {
  if (typeof meta.resolutionCode === 'string' && meta.resolutionCode.trim()) {
    const code = meta.resolutionCode.trim();
    const key = RESOLUTION_CODE_KEYS[code];
    if (key) return ttp(locale, key);
    return code.replace(/_/g, ' ').toLowerCase();
  }
  if (typeof meta.reason === 'string' && meta.reason.trim()) {
    return humanizeTaskTimelineResolutionReason(locale, meta.reason.trim());
  }
  return null;
}

export function humanizeTaskTimelineResolutionReason(
  locale: string,
  reason: string,
): string {
  const cleaned = reason.replace(/^\[(Auto-resolved|Superseded)\]\s*/i, '').trim();
  if (!cleaned) return reason;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export type TaskTimelineActorKind = 'user' | 'system' | 'automatic';

export function resolveTaskTimelineActorKind(
  event: NormalizedTaskTimelineEvent,
): TaskTimelineActorKind {
  const actorName = event.actor?.displayName?.trim();
  if (actorName && !isTechnicalUserLabel(actorName)) return 'user';
  if (!event.actorUserId) {
    if (event.metadata?.auto === true) return 'system';
    if (
      event.type === 'AUTO_RESOLVED' ||
      event.type === 'SUPERSEDED' ||
      event.metadata?.resolutionKind === 'AUTO_RESOLVED' ||
      event.metadata?.resolutionKind === 'SUPERSEDED' ||
      event.type === 'TIMING_CHANGED' ||
      (event.type === 'CREATED' && !event.actorUserId)
    ) {
      return 'automatic';
    }
    return 'system';
  }
  return 'user';
}

export function formatTaskTimelineActorLocalized(
  locale: string,
  event: NormalizedTaskTimelineEvent,
): string {
  const actorName = event.actor?.displayName?.trim();
  if (actorName && !isTechnicalUserLabel(actorName)) return actorName;
  const kind = resolveTaskTimelineActorKind(event);
  if (kind === 'automatic') return ttp(locale, 'tasks.timeline.actor.automatic');
  if (kind === 'system') return ttp(locale, 'tasks.timeline.actor.system');
  return ttp(locale, 'tasks.timeline.actor.unknownUser');
}

function actorParam(locale: string, event: NormalizedTaskTimelineEvent): string {
  return formatTaskTimelineActorLocalized(locale, event);
}

function userEventPresentation(
  event: NormalizedTaskTimelineEvent,
  titleKey: TranslationKey,
  locale: string,
  extraParams: Record<string, string | number> = {},
): TaskTimelineEventPresentation {
  return {
    eventCode: event.type,
    titleKey,
    titleParams: { actor: actorParam(locale, event), ...extraParams },
  };
}

function systemEventPresentation(
  event: NormalizedTaskTimelineEvent,
  titleKey: TranslationKey,
  locale: string,
  extraParams: Record<string, string | number> = {},
): TaskTimelineEventPresentation {
  return {
    eventCode: event.type,
    titleKey,
    titleParams: { actor: actorParam(locale, event), ...extraParams },
  };
}

export function resolveTaskTimelineEventPresentation(
  event: NormalizedTaskTimelineEvent,
  locale: string = DEFAULT_PRODUCT_LOCALE,
): TaskTimelineEventPresentation {
  const meta = readMeta(event);
  const resolutionKind = meta.resolutionKind as TaskCompletionMode | undefined;
  const actorKind = resolveTaskTimelineActorKind(event);

  switch (event.type) {
    case 'CREATED':
      return actorKind === 'user'
        ? userEventPresentation(event, 'tasks.timeline.event.created.user', locale)
        : systemEventPresentation(event, 'tasks.timeline.event.created.system', locale);

    case 'ASSIGNED':
      return userEventPresentation(event, 'tasks.timeline.event.assigned.user', locale);

    case 'STATUS_CHANGED': {
      const status = event.newValue ?? '';
      if (status === 'DONE' && resolutionKind !== 'AUTO_RESOLVED' && resolutionKind !== 'SUPERSEDED') {
        return userEventPresentation(event, 'tasks.timeline.event.statusDone.user', locale);
      }
      if (status === 'CANCELLED') {
        return userEventPresentation(event, 'tasks.timeline.event.statusCancelled.user', locale);
      }
      if (status === 'IN_PROGRESS') {
        return userEventPresentation(event, 'tasks.timeline.event.statusInProgress.user', locale);
      }
      if (status === 'WAITING') {
        return userEventPresentation(event, 'tasks.timeline.event.statusWaiting.user', locale);
      }
      if (status === 'OPEN' && event.oldValue === 'WAITING') {
        return userEventPresentation(event, 'tasks.timeline.event.statusResumed.user', locale);
      }
      const statusLabel = status ? taskStatusPresentation(locale, status) : '';
      return {
        eventCode: event.type,
        titleKey: 'tasks.timeline.event.statusChanged.user',
        titleParams: { actor: actorParam(locale, event) },
        descriptionKey: statusLabel ? 'tasks.timeline.description.newStatus' : undefined,
        descriptionParams: statusLabel ? { status: statusLabel } : undefined,
      };
    }

    case 'CHECKLIST_ITEM_ADDED': {
      const title =
        typeof meta.title === 'string'
          ? meta.title
          : event.newValue ?? ttp(locale, 'tasks.timeline.fallback.checklistItem');
      return userEventPresentation(event, 'tasks.timeline.event.checklistAdded.user', locale, {
        title,
      });
    }

    case 'CHECKLIST_ITEM_UPDATED': {
      const title =
        typeof meta.title === 'string'
          ? meta.title
          : ttp(locale, 'tasks.timeline.fallback.checklistItem');
      if (meta.field === 'isDone' || event.oldValue === 'true' || event.oldValue === 'false') {
        if (event.newValue === 'true') {
          return userEventPresentation(event, 'tasks.timeline.event.checklistDone.user', locale, {
            title,
          });
        }
        if (event.newValue === 'false') {
          return userEventPresentation(
            event,
            'tasks.timeline.event.checklistReopened.user',
            locale,
            { title },
          );
        }
      }
      return userEventPresentation(event, 'tasks.timeline.event.checklistUpdated.user', locale, {
        title,
      });
    }

    case 'COMMENT_ADDED': {
      const preview = typeof meta.bodyPreview === 'string' ? meta.bodyPreview : undefined;
      return {
        ...userEventPresentation(event, 'tasks.timeline.event.commentAdded.user', locale),
        descriptionText: preview,
      };
    }

    case 'ATTACHMENT_ADDED':
      return userEventPresentation(event, 'tasks.timeline.event.attachmentAdded.user', locale);

    case 'AUTO_RESOLVED': {
      const reason = resolveResolutionPresentation(locale, meta);
      return reason
        ? {
            eventCode: event.type,
            titleKey: 'tasks.timeline.event.autoResolvedWithReason',
            titleParams: { reason },
          }
        : { eventCode: event.type, titleKey: 'tasks.timeline.event.autoResolved' };
    }

    case 'SUPERSEDED': {
      const reason = resolveResolutionPresentation(locale, meta);
      return reason
        ? {
            eventCode: event.type,
            titleKey: 'tasks.timeline.event.supersededWithReason',
            titleParams: { reason },
          }
        : { eventCode: event.type, titleKey: 'tasks.timeline.event.superseded' };
    }

    case 'CHECKLIST_COMPLETION_OVERRIDDEN': {
      const reason = typeof meta.reason === 'string' ? meta.reason.trim() : null;
      return {
        ...userEventPresentation(event, 'tasks.timeline.event.checklistOverride.user', locale),
        descriptionKey: reason ? 'tasks.timeline.description.reason' : undefined,
        descriptionParams: reason ? { reason } : undefined,
      };
    }

    case 'TIMING_CHANGED': {
      const timingDescription = describeTimingChangePresentation(locale, event.oldValue, event.newValue);
      return {
        eventCode: event.type,
        titleKey: 'tasks.timeline.event.timingChanged',
        descriptionKey: timingDescription?.key,
        descriptionParams: timingDescription?.params,
      };
    }

    case 'LINKS_UPDATED':
      return userEventPresentation(event, 'tasks.timeline.event.linksUpdated.user', locale);

    case 'UPDATED':
      return userEventPresentation(event, 'tasks.timeline.event.updated.user', locale);

    default:
      return {
        eventCode: event.type,
        titleKey: 'tasks.timeline.fallback.unknown',
        titleParams: { label: event.label || event.type.replace(/_/g, ' ') },
      };
  }
}

function describeTimingChangePresentation(
  locale: string,
  oldValue: string | null,
  newValue: string | null,
): { key: TranslationKey; params: Record<string, string> } | undefined {
  try {
    const oldTiming = oldValue ? (JSON.parse(oldValue) as Record<string, string | null>) : null;
    const newTiming = newValue ? (JSON.parse(newValue) as Record<string, string | null>) : null;
    if (!oldTiming || !newTiming) return undefined;
    const parts: string[] = [];
    if (oldTiming.dueDate !== newTiming.dueDate) {
      parts.push(ttp(locale, 'tasks.timeline.timing.dueDateUpdated'));
    }
    if (oldTiming.activatesAt !== newTiming.activatesAt) {
      parts.push(ttp(locale, 'tasks.timeline.timing.activatesAtUpdated'));
    }
    if (parts.length === 0) return undefined;
    return {
      key: 'tasks.timeline.description.timingChanges',
      params: { changes: parts.join(' · ') },
    };
  } catch {
    return undefined;
  }
}

export function renderTaskTimelineEventPresentation(
  locale: string,
  presentation: TaskTimelineEventPresentation,
): { title: string; description?: string } {
  const title = ttp(locale, presentation.titleKey, presentation.titleParams);
  let description: string | undefined;
  if (presentation.descriptionText) {
    description = presentation.descriptionText;
  } else if (presentation.descriptionKey) {
    description = ttp(locale, presentation.descriptionKey, presentation.descriptionParams);
  }
  return { title, description };
}

export function formatTaskTimelineSentence(
  locale: string,
  event: NormalizedTaskTimelineEvent,
): { title: string; description?: string } {
  return renderTaskTimelineEventPresentation(
    locale,
    resolveTaskTimelineEventPresentation(event, locale),
  );
}

export function formatTaskTimelineDateTime(
  locale: string,
  iso: string,
  options?: { timeZone?: string; formatDateTime?: (iso: string) => string },
): string {
  if (options?.formatDateTime) return options.formatDateTime(iso);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const resolved = resolveTaskTimelinePresentationLocale(locale);
  return date.toLocaleString(getFormattingLocale(resolved), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: options?.timeZone,
  });
}

export function buildTaskCommentAuthorLabel(
  locale: string,
  userId: string | null | undefined,
  members: Array<{ id: string; name: string }>,
  actorDisplayName?: string | null,
): string {
  if (actorDisplayName?.trim() && !isTechnicalUserLabel(actorDisplayName)) {
    return actorDisplayName.trim();
  }
  if (!userId) return ttp(locale, 'tasks.timeline.actor.unknownUser');
  const member = members.find((row) => row.id === userId);
  if (member?.name?.trim() && !isTechnicalUserLabel(member.name)) return member.name.trim();
  return ttp(locale, 'tasks.timeline.actor.unknownUser');
}

/** @deprecated Use humanizeTaskTimelineResolutionReason. B.1 bridge keeps de until B.2 locale threading. */
export function humanizeResolutionReason(reason: string): string {
  return humanizeTaskTimelineResolutionReason('de', reason);
}
