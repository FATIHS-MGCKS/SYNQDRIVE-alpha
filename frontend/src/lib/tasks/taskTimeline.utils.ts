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

/**
 * B.1 bridge locale for hosts that do not pass active locale yet (P2.2.16B.2).
 * Preserves baseline German timeline copy until task detail hosts thread locale.
 */
const TASK_TIMELINE_BRIDGE_LOCALE = 'de' as const;

export { humanizeResolutionReason, isTechnicalUserLabel } from './task-timeline-presentation-i18n';
export type { TaskTimelineEventPresentation } from './task-timeline-presentation-i18n';
export {
  formatTaskTimelineActorLocalized,
  resolveTaskTimelineActorKind,
  resolveTaskTimelineEventPresentation,
  renderTaskTimelineEventPresentation,
} from './task-timeline-presentation-i18n';

export interface TaskTimelineFormatOptions {
  locale?: string;
  timeZone?: string;
  formatDateTime?: (iso: string) => string;
}

export function formatTaskTimelineSentence(
  event: NormalizedTaskTimelineEvent,
  locale?: string,
): { title: string; description?: string } {
  return formatTaskTimelineSentenceLocalized(
    locale ?? TASK_TIMELINE_BRIDGE_LOCALE,
    event,
  );
}

export function formatTaskTimelineActor(
  event: NormalizedTaskTimelineEvent,
  _fallback?: string,
): string {
  return formatTaskTimelineActorLocalized(
    TASK_TIMELINE_BRIDGE_LOCALE,
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
  options: TaskTimelineFormatOptions = {},
): TimelineItem[] {
  const locale = resolveTaskTimelinePresentationLocale(
    options.locale ?? TASK_TIMELINE_BRIDGE_LOCALE,
  );
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
  actorDisplayName?: string | null,
  locale?: string,
): string {
  return buildTaskCommentAuthorLabelLocalized(
    locale ?? TASK_TIMELINE_BRIDGE_LOCALE,
    userId,
    members,
    actorDisplayName,
  );
}
