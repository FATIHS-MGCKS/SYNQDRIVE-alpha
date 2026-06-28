import type { ApiTaskEvent } from '../../lib/api';
import type { OrgMemberRef } from './task-list.utils';
import { resolveUserName } from './task-list.utils';

const EVENT_LABELS: Record<string, string> = {
  CREATED: 'Aufgabe erstellt',
  ASSIGNED: 'Zugewiesen',
  STATUS_CHANGED: 'Status geändert',
  STARTED: 'Aufgabe gestartet',
  WAITING: 'Auf Wartend gesetzt',
  COMPLETED: 'Aufgabe abgeschlossen',
  CANCELLED: 'Aufgabe storniert',
  COMMENT_ADDED: 'Notiz hinzugefügt',
  CHECKLIST_UPDATED: 'Checkliste aktualisiert',
  UPDATED: 'Aufgabe aktualisiert',
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Offen',
  IN_PROGRESS: 'In Arbeit',
  WAITING: 'Wartend',
  DONE: 'Erledigt',
  CANCELLED: 'Storniert',
};

function statusLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return STATUS_LABELS[value] ?? value.replace(/_/g, ' ');
}

export function formatTaskTimelineTitle(
  event: ApiTaskEvent,
  members: OrgMemberRef[] = [],
): string {
  const base = EVENT_LABELS[event.type] ?? event.type.replace(/_/g, ' ');

  if (event.type === 'ASSIGNED') {
    const name = event.newValue
      ? resolveUserName(event.newValue, members, 'Nutzer')
      : 'Niemand';
    return `${base}: ${name}`;
  }

  if (event.type === 'STATUS_CHANGED' || event.type === 'CREATED') {
    if (event.oldValue || event.newValue) {
      return `${base}: ${statusLabel(event.oldValue)} → ${statusLabel(event.newValue)}`;
    }
  }

  if (event.type === 'COMMENT_ADDED') {
    return base;
  }

  if (event.oldValue || event.newValue) {
    return `${base}: ${event.oldValue ?? '—'} → ${event.newValue ?? '—'}`;
  }

  return base;
}
