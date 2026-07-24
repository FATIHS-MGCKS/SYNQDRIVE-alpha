/**
 * Timezone-safe observation windows for point-in-time feature extraction.
 */

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_FEATURE_TIMEZONE = 'Europe/Berlin';

export function zonedDateOnly(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export function zonedStartOfDayToUtc(dateOnly: string, timeZone: string): Date {
  if (!DATE_ONLY_RE.test(dateOnly)) {
    throw new Error(`Invalid date-only: ${dateOnly}`);
  }
  const [year, month, day] = dateOnly.split('-').map(Number);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
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

  throw new Error(`Could not resolve start of day for ${dateOnly} in ${timeZone}`);
}

export function zonedEndOfDayToUtc(dateOnly: string, timeZone: string): Date {
  const nextDateOnly = zonedDateOnly(
    new Date(zonedStartOfDayToUtc(dateOnly, timeZone).getTime() + 36 * 60 * 60 * 1000),
    timeZone,
  );
  const nextStart = zonedStartOfDayToUtc(nextDateOnly, timeZone);
  return new Date(nextStart.getTime() - 1);
}

export function resolveObservationWindow(
  observationDate: string,
  timeZone: string,
): { periodStartUtc: string; periodEndUtc: string; asOfUtc: string } {
  const tz = timeZone.trim() || DEFAULT_FEATURE_TIMEZONE;
  const periodStart = zonedStartOfDayToUtc(observationDate, tz);
  const periodEnd = zonedEndOfDayToUtc(observationDate, tz);
  return {
    periodStartUtc: periodStart.toISOString(),
    periodEndUtc: periodEnd.toISOString(),
    asOfUtc: periodEnd.toISOString(),
  };
}

export function isInstantInZonedDay(
  instantIso: string,
  observationDate: string,
  timeZone: string,
): boolean {
  const local = zonedDateOnly(new Date(instantIso), timeZone);
  return local === observationDate;
}

export function isKnowableAt(instantIso: string, asOfUtc: string): boolean {
  return new Date(instantIso).getTime() <= new Date(asOfUtc).getTime();
}

export function listObservationDates(
  fromDate: string,
  toDate: string,
  timeZone: string,
): string[] {
  const dates: string[] = [];
  let cursor = fromDate;
  const guard = 4000;
  let i = 0;
  while (cursor <= toDate && i < guard) {
    dates.push(cursor);
    const start = zonedStartOfDayToUtc(cursor, timeZone);
    const next = zonedDateOnly(new Date(start.getTime() + 36 * 60 * 60 * 1000), timeZone);
    cursor = next;
    i += 1;
  }
  return dates;
}
