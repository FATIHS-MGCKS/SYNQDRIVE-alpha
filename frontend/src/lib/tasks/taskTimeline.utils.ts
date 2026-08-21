import type { SupportedLocale } from '../../i18n/locales';
import type { StatusTone } from '../../components/patterns/status-utils';
import type { TimelineItem } from '../../components/patterns';
import type { NormalizedTaskTimelineEvent } from './types';
import {
  buildTaskCommentAuthorLabel as buildTaskCommentAuthorLabelLocalized,
  formatTaskTimelineActorLocalized,
  formatTaskTimelineDateTime,
  formatTaskTimelineSentence as formatTaskTimelineSentenceLocalized,
  humanizeResolutionReason,
  isTechnicalUserLabel,
  resolveTaskTimelinePresentationLocale,
} from './task-timeline-presentation-i18n';

export { humanizeResolutionReason, isTechnicalUserLabel } from './task-timeline-presentation-i18n';
export type { TaskTimelineEventPresentation } from './task-timeline-presentation-i18n';
export {
  formatTaskTimelineActorLocalized,
  resolveTaskTimelineActorKind,
  resolveTaskTimelineEventPresentation,
  renderTaskTimelineEventPresentation,
} from './task-timeline-presentation-i18n';

export interface TaskTimelineFormatOptions {
  locale: SupportedLocale;
  timeZone?: string;
  formatDateTime?: (iso: string) => string;
}

export function formatTaskTimelineSentence(
  event: NormalizedTaskTimelineEvent,
  locale: SupportedLocale,
): { title: string; description?: string } {
  return formatTaskTimelineSentenceLocalized(
    resolveTaskTimelinePresentationLocale(locale),
    event,
  );
}

export function formatTaskTimelineActor(
  event: NormalizedTaskTimelineEvent,
  locale: SupportedLocale,
): string {
  return formatTaskTimelineActorLocalized(
    resolveTaskTimelinePresentationLocale(locale),
    event,
  );
}

export function resolveTimelineTone(event: NormalizedTaskTimelineEvent): StatusTone {
  switch (event.type) {
    case 'AUTO_RESOLVED':
    case 'CHECKLIST_COMPLETION_OVERRIDDEN':
      return 'success';
    case 'SUPERSEDED':
    case 'CANCELLED':
      return 'neutral';
    case 'STATUS_CHANGED':
      if (event.newValue === 'DONE') return 'success';
      if (event.newValue === 'CANCELLED') return 'critical';
      return 'info';
    default:
      return 'neutral';
  }
}

export function buildTaskTimelineItems(
  events: NormalizedTaskTimelineEvent[],
  options: TaskTimelineFormatOptions,
): TimelineItem[] {
  const locale = resolveTaskTimelinePresentationLocale(options.locale);
  return [...events]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((event) => {
      const formatted = formatTaskTimelineSentenceLocalized(locale, event);
      return {
        id: event.id,
        title: formatted.title,
        description: formatted.description,
        time: formatTaskTimelineDateTime(locale, event.createdAt, options),
        tone: resolveTimelineTone(event),
      };
    });
}

export function buildTaskCommentAuthorLabel(
  userId: string | null | undefined,
  members: Array<{ id: string; name: string }>,
  actorDisplayName: string | null | undefined,
  locale: SupportedLocale,
): string {
  return buildTaskCommentAuthorLabelLocalized(
    resolveTaskTimelinePresentationLocale(locale),
    userId,
    members,
    actorDisplayName,
  );
}
