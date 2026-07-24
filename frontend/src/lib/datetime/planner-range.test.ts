import { describe, expect, it } from 'vitest';
import {
  buildOrgCalendarGrid,
  countHalfOpenZonedDays,
  iterHalfOpenZonedDays,
  resolveWeekStartsOn,
  shiftDateOnlyByMonths,
  shiftDateOnlyByWeeks,
  zonedWeekRange,
} from './planner-range';
import { zonedCalendarMonthRange } from './zoned-instant';

const BERLIN = 'Europe/Berlin';

describe('resolveWeekStartsOn', () => {
  it('uses Monday for de-DE', () => {
    expect(resolveWeekStartsOn('de-DE')).toBe(1);
  });

  it('uses Sunday for en-US', () => {
    expect(resolveWeekStartsOn('en-US')).toBe(0);
  });
});

describe('zonedWeekRange', () => {
  it('contains exactly seven org calendar days (not eight)', () => {
    const ref = new Date('2026-07-15T12:00:00.000Z');
    const range = zonedWeekRange(ref, BERLIN, 1);
    expect(countHalfOpenZonedDays(range.from, range.to, BERLIN)).toBe(7);
  });

  it('starts on Monday for de-DE week start', () => {
    const ref = new Date('2026-07-15T12:00:00.000Z'); // Wednesday in Berlin
    const range = zonedWeekRange(ref, BERLIN, 1);
    const days = iterHalfOpenZonedDays(range.from, range.to, BERLIN);
    expect(days[0]?.dateOnly).toBe('2026-07-13');
    expect(days[6]?.dateOnly).toBe('2026-07-19');
  });

  it('handles DST spring-forward week without an eighth day marker', () => {
    const ref = new Date('2026-03-30T12:00:00.000Z');
    const range = zonedWeekRange(ref, BERLIN, 1);
    expect(countHalfOpenZonedDays(range.from, range.to, BERLIN)).toBe(7);
  });

  it('handles DST fall-back week', () => {
    const ref = new Date('2026-10-28T12:00:00.000Z');
    const range = zonedWeekRange(ref, BERLIN, 1);
    expect(countHalfOpenZonedDays(range.from, range.to, BERLIN)).toBe(7);
  });
});

describe('timeline/calendar navigation anchors', () => {
  it('shifts weeks across year boundary', () => {
    const next = shiftDateOnlyByWeeks('2026-12-30', 1, BERLIN);
    expect(next >= '2027-01-01').toBe(true);
  }, 15000);

  it('shifts months across year boundary', () => {
    const next = shiftDateOnlyByMonths('2026-11-15', 2, BERLIN);
    expect(next.startsWith('2027-01')).toBe(true);
    const range = zonedCalendarMonthRange(2027, 0, BERLIN);
    expect(range.from < range.to).toBe(true);
  });

  it('builds Monday-first calendar grid for July 2026', () => {
    const cells = buildOrgCalendarGrid(2026, 6, BERLIN, 1);
    const firstDay = cells.find((c) => c.day === 1);
    expect(firstDay).toBeTruthy();
    const leading = cells.findIndex((c) => c.day === 1);
    expect(leading).toBe(2);
  });
});
