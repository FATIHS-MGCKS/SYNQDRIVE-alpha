import {
  DEFAULT_TARIFF_TIMEZONE,
  zonedDateOnly,
  zonedStartOfDayToUtc,
} from '@modules/pricing/tariff-instant.util';

export interface ZonedCalendarDayWindow {
  /** Inclusive UTC instant for start of the org calendar day. */
  todayStart: Date;
  /** Inclusive UTC instant for end of the org calendar day. */
  todayEnd: Date;
  /** `YYYY-MM-DD` in the org timezone for the reference instant. */
  dateOnly: string;
}

/** Resolve [start, end] of the org's current calendar day as UTC instants. */
export function resolveZonedCalendarDayWindow(
  reference: Date = new Date(),
  timeZone: string = DEFAULT_TARIFF_TIMEZONE,
): ZonedCalendarDayWindow {
  const tz = timeZone.trim() || DEFAULT_TARIFF_TIMEZONE;
  const dateOnly = zonedDateOnly(reference, tz);
  const todayStart = zonedStartOfDayToUtc(dateOnly, tz);
  const nextDateOnly = zonedDateOnly(
    new Date(todayStart.getTime() + 36 * 60 * 60 * 1000),
    tz,
  );
  const tomorrowStart = zonedStartOfDayToUtc(nextDateOnly, tz);
  const todayEnd = new Date(tomorrowStart.getTime() - 1);

  return { todayStart, todayEnd, dateOnly };
}

/** Start of the calendar day `daysBack` before `dateOnly` in the same timezone. */
export function zonedLookbackStart(
  dateOnly: string,
  daysBack: number,
  timeZone: string = DEFAULT_TARIFF_TIMEZONE,
): Date {
  const tz = timeZone.trim() || DEFAULT_TARIFF_TIMEZONE;
  const anchor = zonedStartOfDayToUtc(dateOnly, tz);
  const lookbackDateOnly = zonedDateOnly(
    new Date(anchor.getTime() - daysBack * 24 * 60 * 60 * 1000),
    tz,
  );
  return zonedStartOfDayToUtc(lookbackDateOnly, tz);
}
