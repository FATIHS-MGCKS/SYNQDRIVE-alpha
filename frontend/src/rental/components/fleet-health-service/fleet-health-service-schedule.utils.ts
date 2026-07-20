import type { ApiServiceCase, ApiTask } from '../../../lib/api';
import { DEFAULT_FLEET_DISPLAY_TIMEZONE } from '../../lib/vehicle-operational-booking-display';
import { isActiveTask } from '../service-center/service-center.utils';
import { isActiveServiceCase } from './fleet-health-service-case.view-model';

const TERMINAL_TASK_STATUSES = new Set(['DONE', 'CANCELLED']);

function isTaskInstantOverdue(task: ApiTask, now: Date): boolean {
  if (TERMINAL_TASK_STATUSES.has(task.status)) return false;
  if (!task.dueDate) return false;
  const due = parseInstant(task.dueDate);
  return due ? due.getTime() < now.getTime() : false;
}

const MS_DAY = 24 * 60 * 60 * 1000;
const LOCALE = 'de-DE';

export type FleetScheduleBucket = 'overdue' | 'today' | 'next_7_days' | 'later' | 'no_date';

export type FleetScheduleDateKind = 'task_due' | 'case_workshop' | 'case_expected_ready';

export const FLEET_SCHEDULE_BUCKET_ORDER: FleetScheduleBucket[] = [
  'overdue',
  'today',
  'next_7_days',
  'later',
  'no_date',
];

export const FLEET_SCHEDULE_BUCKET_LABEL: Record<FleetScheduleBucket, string> = {
  overdue: 'Überfällig',
  today: 'Heute',
  next_7_days: 'Nächste 7 Tage',
  later: 'Später',
  'no_date': 'Ohne Termin',
};

export const FLEET_SCHEDULE_BUCKET_TONE: Record<
  FleetScheduleBucket,
  'critical' | 'warning' | 'info' | 'neutral'
> = {
  overdue: 'critical',
  today: 'warning',
  next_7_days: 'info',
  later: 'neutral',
  no_date: 'neutral',
};

export const FLEET_SCHEDULE_DATE_KIND_LABEL: Record<FleetScheduleDateKind, string> = {
  task_due: 'Aufgabe fällig',
  case_workshop: 'Werkstatttermin',
  case_expected_ready: 'Erwartete Fertigstellung',
};

type ZonedDayParts = { year: number; month: number; day: number };

export interface FleetScheduleItem {
  id: string;
  bucket: FleetScheduleBucket;
  dateKind: FleetScheduleDateKind;
  entityKind: 'task' | 'service_case';
  entityId: string;
  sortMs: number;
  dateIso: string | null;
  task?: ApiTask;
  serviceCase?: ApiServiceCase;
}

export interface FleetScheduleBuildInput {
  tasks: ApiTask[];
  serviceCases: ApiServiceCase[];
  now?: Date;
  timeZone?: string;
}

function resolveTimeZone(timeZone?: string): string {
  const tz = timeZone?.trim();
  return tz && tz.length > 0 ? tz : DEFAULT_FLEET_DISPLAY_TIMEZONE;
}

function zonedDayParts(date: Date, timeZone: string): ZonedDayParts | null {
  try {
    const formatter = new Intl.DateTimeFormat(LOCALE, {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return { year, month, day };
  } catch {
    return null;
  }
}

function dayKey(parts: ZonedDayParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
}

function zonedDayStartMs(parts: ZonedDayParts, timeZone: string): number {
  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  const zoned = zonedDayParts(probe, timeZone);
  if (!zoned) return probe.getTime();
  return Date.UTC(zoned.year, zoned.month - 1, zoned.day, 0, 0, 0, 0);
}

function diffCalendarDays(from: ZonedDayParts, to: ZonedDayParts): number {
  const fromMs = Date.UTC(from.year, from.month - 1, from.day);
  const toMs = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toMs - fromMs) / MS_DAY);
}

export function getFleetScheduleBucket(
  dateIso: string | null | undefined,
  input: {
    now?: Date;
    timeZone?: string;
    task?: ApiTask;
    dateKind?: FleetScheduleDateKind;
  } = {},
): FleetScheduleBucket {
  const now = input.now ?? new Date();
  const timeZone = resolveTimeZone(input.timeZone);
  const instant = parseInstant(dateIso);

  if (!instant) return 'no_date';

  if (input.dateKind === 'task_due' && input.task && isTaskInstantOverdue(input.task, now)) {
    return 'overdue';
  }

  const todayParts = zonedDayParts(now, timeZone);
  const dateParts = zonedDayParts(instant, timeZone);
  if (!todayParts || !dateParts) return 'later';

  const dayDelta = diffCalendarDays(todayParts, dateParts);
  if (dayDelta < 0) return 'overdue';
  if (dayDelta === 0) {
    if (input.dateKind === 'task_due' && instant.getTime() < now.getTime()) return 'overdue';
    return 'today';
  }
  if (dayDelta <= 7) return 'next_7_days';
  return 'later';
}

export function buildFleetScheduleItems(input: FleetScheduleBuildInput): FleetScheduleItem[] {
  const now = input.now ?? new Date();
  const timeZone = resolveTimeZone(input.timeZone);
  const items: FleetScheduleItem[] = [];

  for (const task of input.tasks) {
    if (!isActiveTask(task)) continue;
    if (task.dueDate) {
      const bucket = getFleetScheduleBucket(task.dueDate, {
        now,
        timeZone,
        task,
        dateKind: 'task_due',
      });
      items.push({
        id: `task-due:${task.id}`,
        bucket,
        dateKind: 'task_due',
        entityKind: 'task',
        entityId: task.id,
        sortMs: parseInstant(task.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER,
        dateIso: task.dueDate,
        task,
      });
    } else {
      items.push({
        id: `task-no-date:${task.id}`,
        bucket: 'no_date',
        dateKind: 'task_due',
        entityKind: 'task',
        entityId: task.id,
        sortMs: Number.MAX_SAFE_INTEGER,
        dateIso: null,
        task,
      });
    }
  }

  for (const serviceCase of input.serviceCases) {
    if (!isActiveServiceCase(serviceCase)) continue;

    let hasDate = false;

    if (serviceCase.scheduledAt) {
      hasDate = true;
      const bucket = getFleetScheduleBucket(serviceCase.scheduledAt, {
        now,
        timeZone,
        dateKind: 'case_workshop',
      });
      items.push({
        id: `case-workshop:${serviceCase.id}`,
        bucket,
        dateKind: 'case_workshop',
        entityKind: 'service_case',
        entityId: serviceCase.id,
        sortMs: parseInstant(serviceCase.scheduledAt)?.getTime() ?? Number.MAX_SAFE_INTEGER,
        dateIso: serviceCase.scheduledAt,
        serviceCase,
      });
    }

    if (serviceCase.expectedReadyAt) {
      hasDate = true;
      const bucket = getFleetScheduleBucket(serviceCase.expectedReadyAt, {
        now,
        timeZone,
        dateKind: 'case_expected_ready',
      });
      items.push({
        id: `case-ready:${serviceCase.id}`,
        bucket,
        dateKind: 'case_expected_ready',
        entityKind: 'service_case',
        entityId: serviceCase.id,
        sortMs: parseInstant(serviceCase.expectedReadyAt)?.getTime() ?? Number.MAX_SAFE_INTEGER,
        dateIso: serviceCase.expectedReadyAt,
        serviceCase,
      });
    }

    if (!hasDate) {
      items.push({
        id: `case-no-date:${serviceCase.id}`,
        bucket: 'no_date',
        dateKind: 'case_workshop',
        entityKind: 'service_case',
        entityId: serviceCase.id,
        sortMs: Number.MAX_SAFE_INTEGER,
        dateIso: null,
        serviceCase,
      });
    }
  }

  return items.sort((a, b) => a.sortMs - b.sortMs);
}

export function groupFleetScheduleItems(
  items: FleetScheduleItem[],
): Map<FleetScheduleBucket, FleetScheduleItem[]> {
  const map = new Map<FleetScheduleBucket, FleetScheduleItem[]>();
  for (const item of items) {
    const list = map.get(item.bucket) ?? [];
    list.push(item);
    map.set(item.bucket, list);
  }
  for (const [bucket, list] of map.entries()) {
    map.set(
      bucket,
      [...list].sort((a, b) => a.sortMs - b.sortMs),
    );
  }
  return map;
}

export function formatFleetScheduleDateTime(
  iso: string | null | undefined,
  timeZone?: string,
): string {
  const instant = parseInstant(iso);
  if (!instant) return '—';
  const tz = resolveTimeZone(timeZone);
  const hasTime =
    instant.getUTCHours() !== 0 ||
    instant.getUTCMinutes() !== 0 ||
    iso?.includes('T');
  if (hasTime) {
    return instant.toLocaleString(LOCALE, {
      timeZone: tz,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return instant.toLocaleDateString(LOCALE, {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
