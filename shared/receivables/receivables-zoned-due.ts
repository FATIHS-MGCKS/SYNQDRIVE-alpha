import { zonedDateOnlyFromInstant } from '@synq/evaluations-periods/evaluations-zoned-date';

/** Calendar-day difference: endDateOnly − startDateOnly (YYYY-MM-DD), end after start → positive. */
export function calendarDaysBetweenDateOnly(startDateOnly: string, endDateOnly: string): number {
  const [y1, m1, d1] = startDateOnly.split('-').map(Number);
  const [y2, m2, d2] = endDateOnly.split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((utc2 - utc1) / 86_400_000);
}

export function zonedDateOnly(instant: Date, timeZone: string): string {
  return zonedDateOnlyFromInstant(instant, timeZone);
}

/**
 * Days overdue relative to reference instant in org timezone.
 * Returns 0 when due on reference day, positive when overdue, negative when not yet due.
 * Returns null when due date is missing or invalid.
 */
export function daysOverdueInTimezone(
  dueDate: Date,
  reference: Date,
  timeZone: string,
): number | null {
  if (Number.isNaN(dueDate.getTime())) return null;
  const dueDay = zonedDateOnly(dueDate, timeZone);
  const refDay = zonedDateOnly(reference, timeZone);
  return calendarDaysBetweenDateOnly(dueDay, refDay);
}

export function isOverdueInTimezone(
  dueDate: Date,
  reference: Date,
  timeZone: string,
): boolean {
  const days = daysOverdueInTimezone(dueDate, reference, timeZone);
  return days != null && days > 0;
}

export function isNotYetDueInTimezone(
  dueDate: Date,
  reference: Date,
  timeZone: string,
): boolean {
  const days = daysOverdueInTimezone(dueDate, reference, timeZone);
  return days != null && days <= 0;
}
