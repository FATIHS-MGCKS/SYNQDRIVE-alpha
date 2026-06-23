import type { ApiTask } from '../../lib/api';
import { deriveTaskIsOverdue } from '../lib/task-display.utils';
import { isActiveTask } from '../components/service-center/service-center.utils';

const MS_DAY = 24 * 60 * 60 * 1000;

export type ScheduleBucket = 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'later' | 'no_due';

export const SCHEDULE_BUCKET_ORDER: ScheduleBucket[] = [
  'overdue',
  'today',
  'tomorrow',
  'this_week',
  'later',
  'no_due',
];

export const SCHEDULE_BUCKET_LABEL: Record<ScheduleBucket, string> = {
  overdue: 'Überfällig',
  today: 'Heute',
  tomorrow: 'Morgen',
  this_week: 'Diese Woche',
  later: 'Später',
  no_due: 'Ohne Fälligkeit',
};

export const SCHEDULE_BUCKET_TONE: Record<ScheduleBucket, 'critical' | 'warning' | 'info' | 'neutral'> = {
  overdue: 'critical',
  today: 'warning',
  tomorrow: 'info',
  this_week: 'neutral',
  later: 'neutral',
  no_due: 'neutral',
};

function startOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function endOfLocalWeek(d: Date): number {
  const start = startOfLocalDay(d);
  const day = new Date(start).getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  return start + (daysUntilSunday + 1) * MS_DAY;
}

/** Optional workshop appointment — only when explicitly stored in task metadata. */
export function taskScheduledAppointment(task: ApiTask): Date | null {
  const meta = task.metadata;
  if (!meta || typeof meta !== 'object') return null;
  const raw =
    (meta as Record<string, unknown>).scheduledAt ??
    (meta as Record<string, unknown>).appointmentAt ??
    (meta as Record<string, unknown>).scheduledAppointment;
  if (raw == null || raw === '') return null;
  const d = new Date(String(raw));
  return Number.isFinite(d.getTime()) ? d : null;
}

export function getScheduleBucket(task: ApiTask, now = new Date()): ScheduleBucket {
  if (!task.dueDate) return 'no_due';
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return 'no_due';

  const dueTs = due.getTime();
  const todayStart = startOfLocalDay(now);
  const tomorrowStart = todayStart + MS_DAY;
  const dayAfterTomorrow = tomorrowStart + MS_DAY;
  const weekEnd = endOfLocalWeek(now);

  if (deriveTaskIsOverdue(task) || dueTs < todayStart) return 'overdue';
  if (dueTs >= todayStart && dueTs < tomorrowStart) return 'today';
  if (dueTs >= tomorrowStart && dueTs < dayAfterTomorrow) return 'tomorrow';
  if (dueTs < weekEnd) return 'this_week';
  return 'later';
}

export function groupTasksByScheduleBucket(tasks: ApiTask[]): Map<ScheduleBucket, ApiTask[]> {
  const map = new Map<ScheduleBucket, ApiTask[]>();
  const sorted = [...tasks].sort((a, b) => {
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return ad - bd;
  });

  for (const task of sorted) {
    const bucket = getScheduleBucket(task);
    const list = map.get(bucket) ?? [];
    list.push(task);
    map.set(bucket, list);
  }
  return map;
}

export function selectScheduleTasks(tasks: ApiTask[]): ApiTask[] {
  return tasks.filter((t) => isActiveTask(t));
}

export function formatDueDateLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatAppointmentLabel(d: Date): string {
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  if (hasTime) {
    return d.toLocaleString('de-DE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}
