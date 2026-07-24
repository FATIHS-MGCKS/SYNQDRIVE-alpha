import { pad2 } from './org-timezone';
import {
  type HalfOpenUtcRange,
  zonedDateOnly,
  zonedDayRange,
  zonedPartsFromInstant,
  zonedStartOfDayToUtc,
} from './zoned-instant';

/** Map Intl weekInfo.firstDay (1=Mon … 7=Sun) to JS weekday (0=Sun … 6=Sat). */
export function intlFirstDayToWeekday(firstDay: number): number {
  return firstDay === 7 ? 0 : firstDay;
}

/**
 * Resolve first day of week for calendar/timeline (0=Sun … 6=Sat).
 * Uses `Intl.Locale.weekInfo` when available; de-DE/en-GB → Monday, en-US → Sunday.
 */
export function resolveWeekStartsOn(locale: string): number {
  try {
    const LocaleCtor = Intl.Locale as typeof Intl.Locale & {
      prototype: { weekInfo?: { firstDay?: number } };
    };
    const weekInfo = new LocaleCtor(locale).weekInfo;
    if (weekInfo?.firstDay != null) {
      return intlFirstDayToWeekday(weekInfo.firstDay);
    }
  } catch {
    /* unsupported */
  }
  const normalized = locale.trim().toLowerCase();
  if (normalized === 'en-us' || normalized.endsWith('-us')) return 0;
  return 1;
}

const WEEKDAY_LABELS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const;

export function weekdayLabelsForLocale(
  locale: string,
  weekStartsOn: number = resolveWeekStartsOn(locale),
): string[] {
  const labels = [...WEEKDAY_LABELS_DE];
  return [...labels.slice(weekStartsOn), ...labels.slice(0, weekStartsOn)];
}

/** Gregorian days in month (0-indexed JS month). */
export function daysInGregorianMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export interface OrgCalendarGridCell {
  day: number | null;
  dateOnly: string | null;
}

/** Build month grid cells with org-timezone weekday alignment. */
export function buildOrgCalendarGrid(
  year: number,
  month: number,
  timeZone: string,
  weekStartsOn: number,
): OrgCalendarGridCell[] {
  const daysInMonth = daysInGregorianMonth(year, month);
  const firstDateOnly = `${year}-${pad2(month + 1)}-01`;
  const firstWeekday = zonedPartsFromInstant(
    zonedStartOfDayToUtc(firstDateOnly, timeZone),
    timeZone,
  ).weekday;
  const leading = (firstWeekday - weekStartsOn + 7) % 7;

  const cells: OrgCalendarGridCell[] = [];
  for (let i = 0; i < leading; i++) cells.push({ day: null, dateOnly: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      dateOnly: `${year}-${pad2(month + 1)}-${pad2(d)}`,
    });
  }
  return cells;
}

/** Shift a calendar date by signed day count in org timezone. */
export function shiftDateOnlyByDays(
  dateOnly: string,
  days: number,
  timeZone: string,
): string {
  if (days === 0) return dateOnly;
  let instant = zonedStartOfDayToUtc(dateOnly, timeZone);
  const steps = Math.abs(days);
  const offsetMs = days > 0 ? 36 * 60 * 60_000 : -12 * 60 * 60_000;
  for (let i = 0; i < steps; i++) {
    const next = zonedDateOnly(new Date(instant.getTime() + offsetMs), timeZone);
    instant = zonedStartOfDayToUtc(next, timeZone);
  }
  return zonedDateOnly(instant, timeZone);
}

/** Shift anchor by whole weeks (timeline week navigation). */
export function shiftDateOnlyByWeeks(
  dateOnly: string,
  weeks: number,
  timeZone: string,
): string {
  return shiftDateOnlyByDays(dateOnly, weeks * 7, timeZone);
}

/** Shift anchor month preserving day-of-month when possible. */
export function shiftDateOnlyByMonths(
  dateOnly: string,
  months: number,
  timeZone: string,
): string {
  if (months === 0) return dateOnly;
  const [year, month, day] = dateOnly.split('-').map(Number);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const maxDay = daysInGregorianMonth(targetYear, normalizedMonth);
  const clampedDay = Math.min(day, maxDay);
  const nextDateOnly = `${targetYear}-${pad2(normalizedMonth + 1)}-${pad2(clampedDay)}`;
  return zonedDateOnly(zonedStartOfDayToUtc(nextDateOnly, timeZone), timeZone);
}

export interface ZonedDaySlice {
  dateOnly: string;
  start: Date;
  end: Date;
}

/** Iterate org calendar days in half-open `[from, to)` without browser-local drift. */
export function iterHalfOpenZonedDays(
  fromIso: string,
  toIso: string,
  timeZone: string,
): ZonedDaySlice[] {
  const endMs = new Date(toIso).getTime();
  const out: ZonedDaySlice[] = [];
  let cursorMs = new Date(fromIso).getTime();

  while (cursorMs < endMs) {
    const dateOnly = zonedDateOnly(new Date(cursorMs), timeZone);
    const dayRange = zonedDayRange(dateOnly, timeZone);
    const start = new Date(dayRange.from);
    const end = new Date(dayRange.to);
    if (start.getTime() >= endMs) break;
    out.push({ dateOnly, start, end });
    cursorMs = end.getTime();
  }

  return out;
}

/** Count org calendar days in half-open `[from, to)`. */
export function countHalfOpenZonedDays(
  fromIso: string,
  toIso: string,
  timeZone: string,
): number {
  return iterHalfOpenZonedDays(fromIso, toIso, timeZone).length;
}

/** Half-open week containing `reference` with locale-aware week start (exactly 7 days). */
export function zonedWeekRange(
  reference: Date = new Date(),
  timeZone: string,
  weekStartsOn: number = 1,
): HalfOpenUtcRange {
  const today = zonedPartsFromInstant(reference, timeZone);
  const todayDateOnly = `${today.year}-${pad2(today.month)}-${pad2(today.day)}`;
  let weekStart = zonedStartOfDayToUtc(todayDateOnly, timeZone);

  const daysBack = (today.weekday - weekStartsOn + 7) % 7;
  for (let i = 0; i < daysBack; i++) {
    const prevDateOnly = zonedDateOnly(new Date(weekStart.getTime() - 12 * 60 * 60_000), timeZone);
    weekStart = zonedStartOfDayToUtc(prevDateOnly, timeZone);
  }

  let weekEnd = weekStart;
  for (let i = 0; i < 7; i++) {
    const nextDateOnly = zonedDateOnly(new Date(weekEnd.getTime() + 36 * 60 * 60_000), timeZone);
    weekEnd = zonedStartOfDayToUtc(nextDateOnly, timeZone);
  }

  return { from: weekStart.toISOString(), to: weekEnd.toISOString() };
}

/** Half-open week for an anchor date-only string. */
export function zonedWeekRangeForDateOnly(
  anchorDateOnly: string,
  timeZone: string,
  weekStartsOn: number = 1,
): HalfOpenUtcRange {
  return zonedWeekRange(zonedStartOfDayToUtc(anchorDateOnly, timeZone), timeZone, weekStartsOn);
}
