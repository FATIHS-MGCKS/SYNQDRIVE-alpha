import { EVALUATIONS_PLATFORM_FALLBACK_TIMEZONE } from '@synq/evaluations-periods/evaluations-period.contract';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Existing platform fallback when organization/station data predates timezone fields. */
export const DEFAULT_PLATFORM_TIMEZONE = EVALUATIONS_PLATFORM_FALLBACK_TIMEZONE;

export type ZonedDateTimeDisambiguation = 'REJECT' | 'COMPATIBLE';

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

function wallClockEpoch(parts: ZonedDateTimeParts): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
}

function sameWallClock(left: ZonedDateTimeParts, right: ZonedDateTimeParts): boolean {
  return wallClockEpoch(left) === wallClockEpoch(right);
}

function offsetAt(instant: Date, timeZone: string): number {
  return wallClockEpoch(zonedDateTimeParts(instant, timeZone)) - instant.getTime();
}

/**
 * Converts a local wall-clock value in an IANA timezone into its UTC instant.
 * COMPATIBLE selects the earlier instant in an overlap and moves a gap forward
 * by its transition duration, matching calendar arithmetic expectations.
 */
export function zonedDateTimeToUtc(
  local: ZonedDateTimeParts,
  timeZone: string,
  disambiguation: ZonedDateTimeDisambiguation = 'REJECT',
): Date {
  assertIanaTimezone(timeZone);
  const targetAsUtc = wallClockEpoch(local);
  const offsets = new Set<number>();

  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = new Date(targetAsUtc + hours * 60 * 60 * 1_000);
    offsets.add(offsetAt(sample, timeZone));
  }

  const candidates = [...offsets].map((offset) => new Date(targetAsUtc - offset));
  const exact = candidates
    .filter((candidate) => sameWallClock(zonedDateTimeParts(candidate, timeZone), local))
    .sort((left, right) => left.getTime() - right.getTime());

  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    if (disambiguation === 'COMPATIBLE') return exact[0];
    throw new Error(
      `Local date-time does not resolve uniquely in ${timeZone}: ${JSON.stringify(local)}`,
    );
  }

  if (disambiguation === 'COMPATIBLE') {
    const nextValid = candidates
      .map((candidate) => ({
        candidate,
        observedWallClock: wallClockEpoch(zonedDateTimeParts(candidate, timeZone)),
      }))
      .filter(({ observedWallClock }) => observedWallClock > targetAsUtc)
      .sort(
        (left, right) =>
          left.observedWallClock - right.observedWallClock ||
          left.candidate.getTime() - right.candidate.getTime(),
      )[0];
    if (nextValid) return nextValid.candidate;
  }

  throw new Error(
    `Local date-time does not exist in ${timeZone}: ${JSON.stringify(local)}`,
  );
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
    'COMPATIBLE',
  );
}
