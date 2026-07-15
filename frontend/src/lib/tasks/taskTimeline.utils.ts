import type { StatusTone } from '../../components/patterns/status-utils';
import type { TimelineItem } from '../../components/patterns';
import { taskStatusLabelDe } from '../../rental/lib/task-detail.utils';
import type { NormalizedTaskTimelineEvent, TaskCompletionMode } from './types';

export interface TaskTimelineFormatOptions {
  locale?: string;
  timeZone?: string;
  formatDateTime?: (iso: string) => string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RESOLUTION_CODE_LABELS: Record<string, string> = {
  INVOICE_PAID: 'Rechnung wurde bezahlt',
  BOOKING_CANCELLED: 'Buchung wurde storniert',
  BOOKING_PHASE_SUPERSEDED: 'Buchungsphase wurde ersetzt',
  INVOICE_TASK_SUPERSEDED: 'Rechnungsaufgabe wurde ersetzt',
  DOCUMENT_TASK_SUPERSEDED: 'Dokumentenaufgabe wurde ersetzt',
  CLEANING_TASK_SUPERSEDED: 'Reinigungsaufgabe wurde ersetzt',
  DOCUMENT_PHASE_SUPERSEDED: 'Dokumentenphase wurde ersetzt',
};

export function isTechnicalUserLabel(label: string | null | undefined): boolean {
  if (!label?.trim()) return true;
  return UUID_RE.test(label.trim());
}

export function formatTaskTimelineActor(
  event: NormalizedTaskTimelineEvent,
  fallback: 'SynqDrive' | 'Automatisch' | 'Unbekannter Nutzer' = 'Unbekannter Nutzer',
): string {
  const actorName = event.actor?.displayName?.trim();
  if (actorName && !isTechnicalUserLabel(actorName)) return actorName;
  if (!event.actorUserId) {
    if (event.metadata?.auto === true) return 'SynqDrive';
    if (
      event.type === 'AUTO_RESOLVED' ||
      event.type === 'SUPERSEDED' ||
      event.metadata?.resolutionKind === 'AUTO_RESOLVED' ||
      event.metadata?.resolutionKind === 'SUPERSEDED' ||
      event.type === 'TIMING_CHANGED' ||
      event.type === 'CREATED' && !event.actorUserId
    ) {
      return 'Automatisch';
    }
    return 'SynqDrive';
  }
  return fallback;
}

function formatDateTimeDefault(iso: string, options: TaskTimelineFormatOptions): string {
  if (options.formatDateTime) return options.formatDateTime(iso);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(options.locale ?? 'de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: options.timeZone,
  });
}

function readMeta(event: NormalizedTaskTimelineEvent): Record<string, unknown> {
  return event.metadata ?? {};
}

function resolveReasonLabel(meta: Record<string, unknown>): string | null {
  if (typeof meta.resolutionCode === 'string' && meta.resolutionCode.trim()) {
    const mapped = RESOLUTION_CODE_LABELS[meta.resolutionCode.trim()];
    if (mapped) return mapped;
  }
  if (typeof meta.reason === 'string' && meta.reason.trim()) {
    return humanizeResolutionReason(meta.reason.trim());
  }
  if (typeof meta.resolutionCode === 'string' && meta.resolutionCode.trim()) {
    return humanizeResolutionCode(meta.resolutionCode.trim());
  }
  return null;
}

export function humanizeResolutionReason(reason: string): string {
  const cleaned = reason
    .replace(/^\[(Auto-resolved|Superseded)\]\s*/i, '')
    .replace(/^Booking\s+/i, 'Buchung ')
    .replace(/^Invoice\s+/i, 'Rechnung ')
    .trim();
  if (!cleaned) return reason;
  if (/[äöüß]/i.test(cleaned) || /\b(wurde|wurden|ist|sind)\b/i.test(cleaned)) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

function humanizeResolutionCode(code: string): string {
  return RESOLUTION_CODE_LABELS[code] ?? code.replace(/_/g, ' ').toLowerCase();
}

function withActorPrefix(actor: string, sentence: string): string {
  if (actor === 'Automatisch' || actor === 'SynqDrive') return sentence;
  return `Von ${actor} ${sentence}`;
}

function resolveTimelineTone(event: NormalizedTaskTimelineEvent): StatusTone {
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

export function formatTaskTimelineSentence(
  event: NormalizedTaskTimelineEvent,
): { title: string; description?: string } {
  const actor = formatTaskTimelineActor(event);
  const meta = readMeta(event);
  const resolutionKind = meta.resolutionKind as TaskCompletionMode | undefined;

  switch (event.type) {
    case 'CREATED':
      return {
        title:
          actor === 'Automatisch' || actor === 'SynqDrive'
            ? `${actor} hat die Aufgabe erstellt`
            : withActorPrefix(actor, 'hat die Aufgabe erstellt'),
      };

    case 'ASSIGNED':
      return { title: withActorPrefix(actor, 'hat die Zuweisung geändert') };

    case 'STATUS_CHANGED': {
      const status = event.newValue ?? '';
      if (status === 'DONE' && resolutionKind !== 'AUTO_RESOLVED' && resolutionKind !== 'SUPERSEDED') {
        return { title: withActorPrefix(actor, 'als erledigt markiert') };
      }
      if (status === 'CANCELLED') {
        return { title: withActorPrefix(actor, 'hat die Aufgabe storniert') };
      }
      if (status === 'IN_PROGRESS') {
        return { title: withActorPrefix(actor, 'hat die Bearbeitung gestartet') };
      }
      if (status === 'WAITING') {
        return { title: withActorPrefix(actor, 'hat die Aufgabe auf Wartend gesetzt') };
      }
      if (status === 'OPEN' && event.oldValue === 'WAITING') {
        return { title: withActorPrefix(actor, 'hat die Aufgabe fortgesetzt') };
      }
      const statusLabel = taskStatusLabelDe(status as never);
      return {
        title: withActorPrefix(actor, 'hat den Status geändert'),
        description: statusLabel ? `Neuer Status: ${statusLabel}` : undefined,
      };
    }

    case 'CHECKLIST_ITEM_ADDED': {
      const title = typeof meta.title === 'string' ? meta.title : event.newValue ?? 'Checklistenpunkt';
      return { title: withActorPrefix(actor, `hat „${title}" hinzugefügt`) };
    }

    case 'CHECKLIST_ITEM_UPDATED': {
      const title = typeof meta.title === 'string' ? meta.title : 'Checklistenpunkt';
      if (meta.field === 'isDone' || event.oldValue === 'true' || event.oldValue === 'false') {
        if (event.newValue === 'true') {
          return { title: withActorPrefix(actor, `hat „${title}" erledigt`) };
        }
        if (event.newValue === 'false') {
          return { title: withActorPrefix(actor, `hat „${title}" wieder geöffnet`) };
        }
      }
      return { title: withActorPrefix(actor, `hat „${title}" aktualisiert`) };
    }

    case 'COMMENT_ADDED': {
      const preview =
        typeof meta.bodyPreview === 'string' ? meta.bodyPreview : undefined;
      return {
        title: withActorPrefix(actor, 'hat eine Notiz hinzugefügt'),
        description: preview,
      };
    }

    case 'ATTACHMENT_ADDED':
      return { title: withActorPrefix(actor, 'hat einen Anhang hinzugefügt') };

    case 'AUTO_RESOLVED': {
      const reason = resolveReasonLabel(meta);
      return {
        title: reason ? `Automatisch aufgelöst: ${reason}` : 'Automatisch aufgelöst',
      };
    }

    case 'SUPERSEDED': {
      const reason = resolveReasonLabel(meta);
      return {
        title: reason ? `Automatisch beendet: ${reason}` : 'Automatisch beendet',
      };
    }

    case 'CHECKLIST_COMPLETION_OVERRIDDEN': {
      const reason = typeof meta.reason === 'string' ? meta.reason.trim() : null;
      return {
        title: withActorPrefix(actor, 'hat trotz offener Pflichtpunkte abgeschlossen'),
        description: reason ? `Begründung: ${reason}` : undefined,
      };
    }

    case 'TIMING_CHANGED':
      return {
        title: 'Zeitplan automatisch angepasst',
        description: describeTimingChange(event.oldValue, event.newValue),
      };

    case 'LINKS_UPDATED':
      return { title: withActorPrefix(actor, 'hat Verknüpfungen geändert') };

    case 'UPDATED':
      return { title: withActorPrefix(actor, 'hat die Aufgabe aktualisiert') };

    default:
      return { title: event.label || event.type.replace(/_/g, ' ') };
  }
}

function describeTimingChange(oldValue: string | null, newValue: string | null): string | undefined {
  try {
    const oldTiming = oldValue ? (JSON.parse(oldValue) as Record<string, string | null>) : null;
    const newTiming = newValue ? (JSON.parse(newValue) as Record<string, string | null>) : null;
    if (!oldTiming || !newTiming) return undefined;
    const parts: string[] = [];
    if (oldTiming.dueDate !== newTiming.dueDate) {
      parts.push('Fälligkeit aktualisiert');
    }
    if (oldTiming.activatesAt !== newTiming.activatesAt) {
      parts.push('Aktivierungszeit aktualisiert');
    }
    return parts.length > 0 ? parts.join(' · ') : undefined;
  } catch {
    return undefined;
  }
}

export function buildTaskTimelineItems(
  events: NormalizedTaskTimelineEvent[],
  options: TaskTimelineFormatOptions = {},
): TimelineItem[] {
  return [...events]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((event) => {
      const formatted = formatTaskTimelineSentence(event);
      return {
        id: event.id,
        title: formatted.title,
        description: formatted.description,
        time: formatDateTimeDefault(event.createdAt, options),
        tone: resolveTimelineTone(event),
      };
    });
}

export function buildTaskCommentAuthorLabel(
  userId: string | null | undefined,
  members: Array<{ id: string; name: string }>,
  actorDisplayName?: string | null,
): string {
  if (actorDisplayName?.trim() && !isTechnicalUserLabel(actorDisplayName)) {
    return actorDisplayName.trim();
  }
  if (!userId) return 'Unbekannter Nutzer';
  const member = members.find((row) => row.id === userId);
  if (member?.name?.trim() && !isTechnicalUserLabel(member.name)) return member.name.trim();
  return 'Unbekannter Nutzer';
}
