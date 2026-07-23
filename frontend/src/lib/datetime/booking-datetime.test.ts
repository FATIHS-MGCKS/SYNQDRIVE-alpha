import { describe, expect, it } from 'vitest';
import {
  bookingInstantToDateTimeLocal,
  bookingLocalDateTimeToIso,
  composeZonedDateTimeToUtc,
  isSameOrgLocalInstant,
  overlapsHalfOpen,
  parseOrgDateTimeLocalValue,
  todayDateOnlyInZone,
  zonedCalendarMonthRange,
  zonedDateOnly,
  zonedDayRange,
  zonedStartOfDayToUtc,
} from './index';

const BERLIN = 'Europe/Berlin';
const LONDON = 'Europe/London';
const UTC = 'UTC';

describe('zonedDateOnly', () => {
  it('uses org timezone, not browser local, for midnight UTC', () => {
    // 2026-01-01T00:30:00Z is still 2025-12-31 in New York but 2026-01-01 in Berlin
    const instant = new Date('2026-01-01T00:30:00.000Z');
    expect(zonedDateOnly(instant, BERLIN)).toBe('2026-01-01');
    expect(zonedDateOnly(instant, UTC)).toBe('2026-01-01');
    expect(zonedDateOnly(instant, LONDON)).toBe('2026-01-01');
  });

  it('returns previous calendar day before Berlin midnight for late UTC evening', () => {
    const instant = new Date('2026-03-15T22:30:00.000Z');
    expect(zonedDateOnly(instant, BERLIN)).toBe('2026-03-15');
    expect(zonedDateOnly(instant, UTC)).toBe('2026-03-15');
  });
});

describe('composeZonedDateTimeToUtc', () => {
  it('converts Berlin wall clock to UTC', () => {
    const utc = composeZonedDateTimeToUtc('2026-07-10', '10:00', BERLIN);
    expect(utc.toISOString()).toBe('2026-07-10T08:00:00.000Z');
  });

  it('converts London wall clock to UTC (BST)', () => {
    const utc = composeZonedDateTimeToUtc('2026-07-10', '10:00', LONDON);
    expect(utc.toISOString()).toBe('2026-07-10T09:00:00.000Z');
  });

  it('treats UTC date+time as UTC instant', () => {
    const utc = composeZonedDateTimeToUtc('2026-07-10', '10:00', UTC);
    expect(utc.toISOString()).toBe('2026-07-10T10:00:00.000Z');
  });

  it('handles Berlin midnight correctly', () => {
    const utc = composeZonedDateTimeToUtc('2026-03-29', '00:00', BERLIN);
    expect(utc.toISOString()).toBe('2026-03-28T23:00:00.000Z');
  });

  it('spring-forward gap advances to next valid local time in Berlin', () => {
    // 2026-03-29 02:30 does not exist in Europe/Berlin (clocks jump 02:00 → 03:00)
    const utc = composeZonedDateTimeToUtc('2026-03-29', '02:30', BERLIN);
    expect(utc.toISOString()).toBe('2026-03-29T01:00:00.000Z');
  });

  it('fall-back ambiguous hour resolves to first occurrence in Berlin', () => {
    // 2026-10-25 02:30 happens twice; we pick the earlier UTC (CEST)
    const utc = composeZonedDateTimeToUtc('2026-10-25', '02:30', BERLIN);
    expect(utc.toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });
});

describe('booking datetime roundtrip', () => {
  it('roundtrips Berlin org-local datetime-local values', () => {
    const iso = '2026-07-10T08:00:00.000Z';
    const local = bookingInstantToDateTimeLocal(iso, BERLIN);
    expect(local).toBe('2026-07-10T10:00');
    expect(parseOrgDateTimeLocalValue(local, BERLIN)).toBe(iso);
  });

  it('parses org wall clock independent of browser timezone simulation', () => {
    const iso = bookingLocalDateTimeToIso('2026-07-10', '10:00', BERLIN);
    expect(iso).toBe('2026-07-10T08:00:00.000Z');
    // Same wall digits in London would be a different instant
    const londonIso = bookingLocalDateTimeToIso('2026-07-10', '10:00', LONDON);
    expect(londonIso).toBe('2026-07-10T09:00:00.000Z');
    expect(londonIso).not.toBe(iso);
  });

  it('compares instants with org-local minute precision', () => {
    expect(
      isSameOrgLocalInstant('2026-07-10T08:00:00.000Z', '2026-07-10T10:00', BERLIN),
    ).toBe(true);
    expect(
      isSameOrgLocalInstant('2026-07-10T08:00:00.000Z', '2026-07-10T10:00', LONDON),
    ).toBe(false);
  });
});

describe('half-open intervals', () => {
  it('uses [from, to) for calendar month range', () => {
    const range = zonedCalendarMonthRange(2026, 6, BERLIN); // July 2026
    expect(range.from).toBe('2026-06-30T22:00:00.000Z');
    expect(range.to).toBe('2026-07-31T22:00:00.000Z');
    const bookingStart = new Date('2026-07-15T08:00:00.000Z');
    const bookingEnd = new Date('2026-07-16T08:00:00.000Z');
    const windowStart = new Date(range.from);
    const windowEnd = new Date(range.to);
    expect(overlapsHalfOpen(bookingStart, bookingEnd, windowStart, windowEnd)).toBe(true);
  });

  it('zoned day range is half-open at midnight boundary', () => {
    const day = zonedDayRange('2026-07-10', BERLIN);
    const start = new Date(day.from);
    const end = new Date(day.to);
    expect(start.toISOString()).toBe('2026-07-09T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-10T22:00:00.000Z');
    const atEndBoundary = new Date('2026-07-10T22:00:00.000Z');
    expect(overlapsHalfOpen(atEndBoundary, new Date('2026-07-11T12:00:00.000Z'), start, end)).toBe(
      false,
    );
  });
});

describe('todayDateOnlyInZone', () => {
  it('returns org calendar date for a fixed instant', () => {
    const ref = new Date('2026-01-01T23:30:00.000Z');
    expect(todayDateOnlyInZone(BERLIN, ref)).toBe('2026-01-02');
    expect(todayDateOnlyInZone(UTC, ref)).toBe('2026-01-01');
  });
});

describe('zonedStartOfDayToUtc', () => {
  it('resolves DST start-of-day in Berlin', () => {
    const start = zonedStartOfDayToUtc('2026-03-29', BERLIN);
    expect(start.toISOString()).toBe('2026-03-28T23:00:00.000Z');
  });
});
