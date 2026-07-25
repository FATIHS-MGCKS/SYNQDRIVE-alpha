export const DEFAULT_ORG_TIMEZONE = 'Europe/Berlin';

/** Calendar date `YYYY-MM-DD` for an instant in an IANA timezone. */
export function zonedDateOnly(
  instant: Date,
  timeZone: string = DEFAULT_ORG_TIMEZONE,
): string {
  const tz = timeZone.trim() || DEFAULT_ORG_TIMEZONE;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Whether `iso` falls on the same org calendar day as `reference`. */
export function isScheduledOnOrgCalendarDay(
  iso: string | undefined,
  reference: Date,
  timeZone: string = DEFAULT_ORG_TIMEZONE,
): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  const tz = timeZone.trim() || DEFAULT_ORG_TIMEZONE;
  return zonedDateOnly(new Date(ms), tz) === zonedDateOnly(reference, tz);
}

/** Start of calendar day in IANA timezone as UTC instant (handles DST). */
export function zonedStartOfDayToUtc(dateOnly: string, timeZone: string): Date {
  const tz = timeZone.trim() || DEFAULT_ORG_TIMEZONE;
  const [year, month, day] = dateOnly.split('-').map(Number);
  if (!year || !month || !day) {
    throw new Error(`Invalid calendar date: ${dateOnly}`);
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

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

  throw new Error(`Could not resolve start of day ${dateOnly} in ${tz}`);
}
