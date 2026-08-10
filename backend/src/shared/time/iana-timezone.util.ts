const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Existing platform fallback when organization/station data predates timezone fields. */
export const DEFAULT_PLATFORM_TIMEZONE = 'Europe/Berlin';

export interface ZonedDateTimeParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
}

function formatter(timeZone: string): Intl.DateTimeFormat {
  assertIanaTimezone(timeZone);
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

export function assertIanaTimezone(timeZone: string): void {
  const normalized = timeZone.trim();
  if (!normalized) {
    throw new Error('IANA timezone is required');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(0);
  } catch {
    throw new Error(`Invalid IANA timezone: ${normalized}`);
  }
}

export function zonedDateTimeParts(instant: Date, timeZone: string): ZonedDateTimeParts {
  if (Number.isNaN(instant.getTime())) {
    throw new Error('Invalid instant');
  }
  const parts = formatter(timeZone).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
    millisecond: instant.getUTCMilliseconds(),
  };
}

export function zonedDateOnly(instant: Date, timeZone: string): string {
  const parts = zonedDateTimeParts(instant, timeZone);
  return formatDateOnly(parts.year, parts.month, parts.day);
}

export function formatDateOnly(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseDateOnly(dateOnly: string): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
} {
  const match = DATE_ONLY_PATTERN.exec(dateOnly);
  if (!match) {
    throw new Error(`Invalid date-only value: ${dateOnly}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${dateOnly}`);
  }
  return { year, month, day };
}

/**
 * Converts a local wall-clock value in an IANA timezone into its UTC instant.
 * Iterative offset correction avoids assuming a fixed 24-hour calendar day.
 */
export function zonedDateTimeToUtc(
  local: ZonedDateTimeParts,
  timeZone: string,
): Date {
  assertIanaTimezone(timeZone);
  const targetAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
    local.millisecond,
  );
  let candidate = targetAsUtc;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const observed = zonedDateTimeParts(new Date(candidate), timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
      observed.millisecond,
    );
    const correction = targetAsUtc - observedAsUtc;
    if (correction === 0) {
      return new Date(candidate);
    }
    candidate += correction;
  }

  const resolved = new Date(candidate);
  const observed = zonedDateTimeParts(resolved, timeZone);
  if (
    observed.year !== local.year ||
    observed.month !== local.month ||
    observed.day !== local.day ||
    observed.hour !== local.hour ||
    observed.minute !== local.minute ||
    observed.second !== local.second
  ) {
    throw new Error(
      `Local date-time does not resolve uniquely in ${timeZone}: ${JSON.stringify(local)}`,
    );
  }
  return resolved;
}

export function zonedStartOfDayToUtc(dateOnly: string, timeZone: string): Date {
  const date = parseDateOnly(dateOnly);
  return zonedDateTimeToUtc(
    {
      ...date,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    },
    timeZone,
  );
}
