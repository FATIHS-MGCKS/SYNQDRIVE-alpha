/**
 * Zoned calendar date helpers for Auswertungen UI bucketing.
 * Period boundaries must come from the server — these only format/group instants
 * using the server-provided IANA timezone.
 */

export interface ZonedDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function zonedDateParts(instant: Date, timeZone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day') };
}

export function zonedDateOnlyFromInstant(instant: Date, timeZone: string): string {
  const { year, month, day } = zonedDateParts(instant, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Day-of-month (1-based) in the reporting timezone — for MTD chart buckets. */
export function zonedDayOfMonth(instant: Date, timeZone: string): number {
  return zonedDateParts(instant, timeZone).day;
}

export function daysInZonedMonth(year: number, month: number, timeZone: string): number {
  const probe = zonedDateOnlyFromInstant(new Date(Date.UTC(year, month, 0)), timeZone);
  const parts = probe.split('-').map(Number);
  if (parts[0] === year && parts[1] === month) {
    return parts[2] ?? 28;
  }
  return new Date(year, month, 0).getDate();
}
