import { describe, expect, it } from 'vitest';
import { resolvePlannerVisibleRange } from './bookings-planner-range.utils';

const BERLIN = 'Europe/Berlin';

describe('resolvePlannerVisibleRange', () => {
  it('calendar view uses displayed month/year', () => {
    const range = resolvePlannerVisibleRange({
      view: 'calendar',
      timelineRange: 'week',
      calendarMonth: 6,
      calendarYear: 2026,
      timelineAnchorDateOnly: '2026-01-01',
      timeZone: BERLIN,
      weekStartsOn: 1,
    });
    expect(range.from).toBe('2026-06-30T22:00:00.000Z');
    expect(range.to).toBe('2026-07-31T22:00:00.000Z');
  });

  it('timeline week uses anchor date week', () => {
    const range = resolvePlannerVisibleRange({
      view: 'timeline',
      timelineRange: 'week',
      calendarMonth: 0,
      calendarYear: 2026,
      timelineAnchorDateOnly: '2026-07-15',
      timeZone: BERLIN,
      weekStartsOn: 1,
    });
    expect(range.from).toBe('2026-07-12T22:00:00.000Z');
    expect(range.to).toBe('2026-07-19T22:00:00.000Z');
  });

  it('timeline month uses anchor month', () => {
    const range = resolvePlannerVisibleRange({
      view: 'timeline',
      timelineRange: 'month',
      calendarMonth: 0,
      calendarYear: 2026,
      timelineAnchorDateOnly: '2026-03-15',
      timeZone: BERLIN,
      weekStartsOn: 1,
    });
    expect(range.from).toBe('2026-02-28T23:00:00.000Z');
    expect(range.to).toBe('2026-03-31T22:00:00.000Z');
  });
});
