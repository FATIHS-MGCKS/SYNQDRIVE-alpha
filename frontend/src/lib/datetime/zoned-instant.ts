import { BadRequestError } from './errors';
import { DEFAULT_ORG_TIMEZONE, pad2 } from './org-timezone';

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday in the org timezone. */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function zonedFormatter(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}

function weekdayFormatter(timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  });
}

function partsAt(instant: Date, timeZone: string): Omit<ZonedParts, 'weekday'> {
  const parts = zonedFormatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

/** Calendar date `YYYY-MM-DD` for an instant in an IANA timezone. */
export function zonedDateOnly(
  instant: Date,
  timeZone: string = DEFAULT_ORG_TIMEZONE,
): string {
  const parts = partsAt(instant, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/** Wall-clock parts for an instant in an IANA timezone. */
export function zonedPartsFromInstant(
  instant: Date,
  timeZone: string = DEFAULT_ORG_TIMEZONE,
): ZonedParts {
  const base = partsAt(instant, timeZone);
  const weekdayLabel = weekdayFormatter(timeZone).format(instant).slice(0, 3);
  return {
    ...base,
    weekday: WEEKDAY_INDEX[weekdayLabel] ?? 0,
  };
}

/** Start of calendar day in IANA timezone as UTC instant (handles DST). */
export function zonedStartOfDayToUtc(
  dateOnly: string,
  timeZone: string = DEFAULT_ORG_TIMEZONE,
): Date {
  const [year, month, day] = dateOnly.split('-').map(Number);
  if (!year || !month || !day) {
    throw new BadRequestError('INVALID_DATE', `Invalid date-only value: ${dateOnly}`);
  }

  const formatter = zonedFormatter(timeZone);
  const localAt = (ms: number) => {
    const parts = formatter.formatToParts(new Date(ms));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
    return {
      year: Number(get('year')),
      month: Number(get('month')),
      day: Number(get('day')),
      hour: Number(get('hour')),
      minute: Number(get('minute')),
      second: Number(get('second')),
    };
  };

  const lo = Date.UTC(year, month - 2, day, 0, 0, 0);
  const hi = Date.UTC(year, month, day + 1, 23, 59, 59);

  for (let ms = lo; ms <= hi; ms += 60_000) {
    const local = localAt(ms);
    if (
      local.year === year &&
      local.month === month &&
      local.day === day &&
      local.hour === 0 &&
      local.minute === 0 &&
      local.second === 0
    ) {
      return new Date(ms);
    }
  }

  throw new BadRequestError(
    'INVALID_ZONED_DAY',
    `Could not resolve start of day ${dateOnly} in ${timeZone}`,
  );
}

/**
 * Compose org-local calendar date + wall-clock time to a UTC instant.
 * - Ambiguous fall-back hour: first occurrence (earlier UTC, DST).
 * - Spring-forward gap: next valid local minute on the same calendar day.
 */
export function composeZonedDateTimeToUtc(
  dateOnly: string,
  time: string,
  timeZone: string = DEFAULT_ORG_TIMEZONE,
): Date {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const timeParts = time.split(':').map(Number);
  const hour = timeParts[0] ?? 0;
  const minute = timeParts[1] ?? 0;
  const second = timeParts[2] ?? 0;

  if (!year || !month || !day) {
    throw new BadRequestError('INVALID_DATE', `Invalid date-only value: ${dateOnly}`);
  }

  const formatter = zonedFormatter(timeZone);
  const localAt = (ms: number) => {
    const parts = formatter.formatToParts(new Date(ms));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
    return {
      year: Number(get('year')),
      month: Number(get('month')),
      day: Number(get('day')),
      hour: Number(get('hour')),
      minute: Number(get('minute')),
      second: Number(get('second')),
    };
  };

  const matches: number[] = [];
  const lo = Date.UTC(year, month - 2, day, hour - 12, minute);
  const hi = Date.UTC(year, month, day + 1, hour + 12, minute);

  for (let ms = lo; ms <= hi; ms += 60_000) {
    const local = localAt(ms);
    if (
      local.year === year &&
      local.month === month &&
      local.day === day &&
      local.hour === hour &&
      local.minute === minute &&
      local.second === second
    ) {
      matches.push(ms);
    }
  }

  if (matches.length > 0) {
    return new Date(matches[0]);
  }

  for (let ms = lo; ms <= hi + 3 * 60 * 60_000; ms += 60_000) {
    const local = localAt(ms);
    if (local.year !== year || local.month !== month || local.day !== day) continue;
    if (local.hour > hour || (local.hour === hour && local.minute > minute)) {
      return new Date(ms);
    }
  }

  throw new BadRequestError(
    'INVALID_ZONED_DATETIME',
    `Could not resolve ${dateOnly}T${time} in ${timeZone}`,
  );
}

/** Parse `YYYY-MM-DDTHH:mm` (datetime-local) as org wall clock → UTC ISO string. */
export function parseOrgDateTimeLocalValue(
  value: string,
  timeZone: string = DEFAULT_ORG_TIMEZONE,
): string | null {
  if (!value.trim()) return null;
  const [datePart, timePart] = value.split('T');
  if (!datePart || !timePart) return null;
  try {
    return composeZonedDateTimeToUtc(datePart, timePart.slice(0, 5), timeZone).toISOString();
  } catch {
    return null;
  }
}

/** Format UTC instant as `YYYY-MM-DDTHH:mm` org wall clock for datetime-local inputs. */
export function formatOrgDateTimeLocalValue(
  iso: string | Date,
  timeZone: string = DEFAULT_ORG_TIMEZONE,
): string {
  const instant = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(instant.getTime())) return '';
  const parts = zonedPartsFromInstant(instant, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

/** Today's calendar date in org timezone (`YYYY-MM-DD`). */
export function todayDateOnlyInZone(
  timeZone: string = DEFAULT_ORG_TIMEZONE,
  reference: Date = new Date(),
): string {
  return zonedDateOnly(reference, timeZone);
}

export interface HalfOpenUtcRange {
  /** Inclusive UTC start instant (ISO string). */
  from: string;
  /** Exclusive UTC end instant (ISO string) — half-open `[from, to)`. */
  to: string;
}

/** Half-open calendar month `[start, end)` in org timezone. `month` is 0-indexed (JS). */
export function zonedCalendarMonthRange(
  year: number,
  month: number,
  timeZone: string = DEFAULT_ORG_TIMEZONE,
): HalfOpenUtcRange {
  const startDateOnly = `${year}-${pad2(month + 1)}-01`;
  const nextMonth = month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
  const endDateOnly = `${nextMonth.year}-${pad2(nextMonth.month + 1)}-01`;
  const from = zonedStartOfDayToUtc(startDateOnly, timeZone);
  const to = zonedStartOfDayToUtc(endDateOnly, timeZone);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Half-open Sunday-based week `[start, end)` containing `reference` in org timezone. */
export function zonedWeekRange(
  reference: Date = new Date(),
  timeZone: string = DEFAULT_ORG_TIMEZONE,
): HalfOpenUtcRange {
  const today = zonedPartsFromInstant(reference, timeZone);
  const todayDateOnly = `${today.year}-${pad2(today.month)}-${pad2(today.day)}`;
  let weekStart = zonedStartOfDayToUtc(todayDateOnly, timeZone);
  for (let i = 0; i < today.weekday; i++) {
    const prevDateOnly = zonedDateOnly(new Date(weekStart.getTime() - 12 * 60 * 60_000), timeZone);
    weekStart = zonedStartOfDayToUtc(prevDateOnly, timeZone);
  }
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60_000);
  return { from: weekStart.toISOString(), to: weekEnd.toISOString() };
}

/** Half-open org calendar day `[start, end)` for a `YYYY-MM-DD` date. */
export function zonedDayRange(
  dateOnly: string,
  timeZone: string = DEFAULT_ORG_TIMEZONE,
): HalfOpenUtcRange {
  const from = zonedStartOfDayToUtc(dateOnly, timeZone);
  const nextDateOnly = zonedDateOnly(new Date(from.getTime() + 36 * 60 * 60_000), timeZone);
  const to = zonedStartOfDayToUtc(nextDateOnly, timeZone);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Half-open overlap: `[aStart, aEnd)` intersects `[bStart, bEnd)`. */
export function overlapsHalfOpen(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}
