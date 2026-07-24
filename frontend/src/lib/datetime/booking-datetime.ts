import { DEFAULT_ORG_TIMEZONE, resolveOrgLocale } from './org-timezone';
import {
  composeZonedDateTimeToUtc,
  formatOrgDateTimeLocalValue,
  parseOrgDateTimeLocalValue,
  todayDateOnlyInZone,
  zonedDateOnly,
  zonedPartsFromInstant,
  type HalfOpenUtcRange,
} from './zoned-instant';

export {
  DEFAULT_ORG_TIMEZONE,
  composeZonedDateTimeToUtc,
  formatOrgDateTimeLocalValue,
  parseOrgDateTimeLocalValue,
  todayDateOnlyInZone,
  zonedCalendarMonthRange,
  zonedDateOnly,
  zonedDayRange,
  zonedPartsFromInstant,
  zonedStartOfDayToUtc,
  overlapsHalfOpen,
  type HalfOpenUtcRange,
} from './zoned-instant';

export {
  zonedWeekRange,
  zonedWeekRangeForDateOnly,
  countHalfOpenZonedDays,
  iterHalfOpenZonedDays,
  resolveWeekStartsOn,
  weekdayLabelsForLocale,
  buildOrgCalendarGrid,
  shiftDateOnlyByWeeks,
  shiftDateOnlyByMonths,
} from './planner-range';

export { resolveOrgTimezone, resolveOrgLocale } from './org-timezone';

/** Compose booking pickup/return instants from org-local date + time strings. */
export function bookingLocalDateTimeToIso(
  dateOnly: string,
  time: string,
  timeZone: string = DEFAULT_ORG_TIMEZONE,
): string {
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  return composeZonedDateTimeToUtc(dateOnly, normalizedTime, timeZone).toISOString();
}

/** UTC ISO → org-local `YYYY-MM-DDTHH:mm` for datetime-local inputs. */
export function bookingInstantToDateTimeLocal(
  iso: string,
  timeZone: string = DEFAULT_ORG_TIMEZONE,
): string {
  return formatOrgDateTimeLocalValue(iso, timeZone);
}

/** Compare persisted ISO instant with org-local datetime-local value (minute precision). */
export function isSameOrgLocalInstant(
  iso: string,
  local: string,
  timeZone: string = DEFAULT_ORG_TIMEZONE,
): boolean {
  const next = parseOrgDateTimeLocalValue(local, timeZone);
  if (!next) return false;
  const a = new Date(iso).getTime();
  const b = new Date(next).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) < 60_000;
}

/** Format booking instant for display in org timezone + locale. */
export function formatBookingDateTime(
  iso: string | null | undefined,
  timeZone: string = DEFAULT_ORG_TIMEZONE,
  locale?: string | null,
): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(resolveOrgLocale(locale), {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** Org calendar month + year for "today" (0-indexed month). */
export function orgCalendarMonthYear(
  timeZone: string = DEFAULT_ORG_TIMEZONE,
  reference: Date = new Date(),
): { month: number; year: number; dateOnly: string } {
  const parts = zonedPartsFromInstant(reference, timeZone);
  return {
    month: parts.month - 1,
    year: parts.year,
    dateOnly: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
  };
}

/** Format date-only string for display using org locale (noon anchor avoids DST edge). */
export function formatOrgDateOnly(
  dateOnly: string,
  locale?: string | null,
  timeZone: string = DEFAULT_ORG_TIMEZONE,
): string {
  try {
    const instant = composeZonedDateTimeToUtc(dateOnly, '12:00:00', timeZone);
    return instant.toLocaleDateString(resolveOrgLocale(locale), {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateOnly;
  }
}
