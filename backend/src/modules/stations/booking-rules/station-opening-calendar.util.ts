import { Station } from '@prisma/client';

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

type DaySlot = { open?: string; close?: string; closed?: boolean };

export function resolveStationTimezone(station: Pick<Station, 'timezone'>): string {
  return station.timezone?.trim() || 'Europe/Berlin';
}

/** Calendar day bounds in station timezone (CAL-04). */
export function stationDayBounds(
  station: Pick<Station, 'timezone'>,
  ref: Date = new Date(),
): { start: Date; end: Date } {
  const tz = resolveStationTimezone(station);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ref);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  const start = new Date(`${y}-${m}-${d}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function parseHours(openingHours: unknown): Record<string, DaySlot> {
  if (!openingHours || typeof openingHours !== 'object') return {};
  return openingHours as Record<string, DaySlot>;
}

function localTimeInTz(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function localWeekday(date: Date, tz: string): string {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' })
    .format(date)
    .toLowerCase();
  return day;
}

function localDateKey(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);
}

export function isHolidayClosed(station: Pick<Station, 'holidayRules' | 'timezone'>, at: Date): boolean {
  const key = localDateKey(at, resolveStationTimezone(station));
  const rules = station.holidayRules;
  if (!rules || typeof rules !== 'object') return false;
  const obj = rules as Record<string, unknown>;
  if (Array.isArray(obj.closedDates)) {
    return (obj.closedDates as unknown[]).some((d) => d === key);
  }
  if (Array.isArray(rules)) {
    return (rules as Array<{ date?: string; closed?: boolean }>).some(
      (e) => e.date === key && e.closed !== false,
    );
  }
  const entry = obj[key];
  if (entry && typeof entry === 'object' && (entry as { closed?: boolean }).closed) {
    return true;
  }
  return false;
}

export function isOpenAt(
  station: Pick<Station, 'openingHours' | 'holidayRules' | 'timezone' | 'afterHoursReturnEnabled'>,
  at: Date,
  purpose: 'pickup' | 'return',
): { open: boolean; reason?: 'HOLIDAY_CLOSED' | 'OUTSIDE_OPENING_HOURS' | 'AFTER_HOURS_RETURN' } {
  if (isHolidayClosed(station, at)) {
    return { open: false, reason: 'HOLIDAY_CLOSED' };
  }

  const hours = parseHours(station.openingHours);
  const tz = resolveStationTimezone(station);
  const weekday = localWeekday(at, tz);
  const slot = hours[weekday];
  if (!slot || slot.closed) {
    if (purpose === 'return' && station.afterHoursReturnEnabled) {
      return { open: true, reason: 'AFTER_HOURS_RETURN' };
    }
    return { open: false, reason: 'OUTSIDE_OPENING_HOURS' };
  }

  const time = localTimeInTz(at, tz);
  const open = slot.open ?? '00:00';
  const close = slot.close ?? '23:59';
  if (time >= open && time <= close) return { open: true };

  if (purpose === 'return' && station.afterHoursReturnEnabled) {
    return { open: true, reason: 'AFTER_HOURS_RETURN' };
  }
  return { open: false, reason: 'OUTSIDE_OPENING_HOURS' };
}
