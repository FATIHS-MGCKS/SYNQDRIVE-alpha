import { DEFAULT_QUIET_HOURS } from './workflow-communication-policy.config';

export interface QuietHoursWindow {
  inWindow: boolean;
  nextAllowedAt: Date | null;
}

/** Evaluate org-local quiet hours (Mon–Fri 08:00–20:00 by default). */
export function evaluateQuietHours(
  timeZone: string,
  now: Date,
  options?: {
    startHour?: number;
    endHour?: number;
    allowWeekends?: boolean;
  },
): QuietHoursWindow {
  const startHour = options?.startHour ?? DEFAULT_QUIET_HOURS.weekdayStartHour;
  const endHour = options?.endHour ?? DEFAULT_QUIET_HOURS.weekdayEndHour;
  const allowWeekends = options?.allowWeekends ?? DEFAULT_QUIET_HOURS.allowWeekends;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');

  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  if (isWeekend && !allowWeekends) {
    return { inWindow: false, nextAllowedAt: computeNextWeekdayStart(timeZone, now, startHour) };
  }

  if (hour >= startHour && hour < endHour) {
    return { inWindow: true, nextAllowedAt: null };
  }

  if (hour < startHour) {
    return {
      inWindow: false,
      nextAllowedAt: setLocalHour(timeZone, now, startHour, 0),
    };
  }

  return {
    inWindow: false,
    nextAllowedAt: computeNextWeekdayStart(timeZone, now, startHour),
  };
}

function setLocalHour(timeZone: string, base: Date, hour: number, minute: number): Date {
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);

  const candidate = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
  const offset = getTimezoneOffsetMs(timeZone, candidate);
  return new Date(candidate.getTime() - offset);
}

function computeNextWeekdayStart(timeZone: string, now: Date, startHour: number): Date {
  let probe = new Date(now.getTime() + 60 * 60 * 1000);
  for (let i = 0; i < 96; i += 1) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(probe);
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    if (weekday !== 'Sat' && weekday !== 'Sun' && hour >= startHour) {
      return setLocalHour(timeZone, probe, startHour, 0);
    }
    probe = new Date(probe.getTime() + 60 * 60 * 1000);
  }
  return new Date(now.getTime() + 12 * 60 * 60 * 1000);
}

function getTimezoneOffsetMs(timeZone: string, date: Date): number {
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const local = new Date(date.toLocaleString('en-US', { timeZone }));
  return local.getTime() - utc.getTime();
}
