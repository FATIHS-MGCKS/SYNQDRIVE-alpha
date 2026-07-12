import {
  resolveZonedCalendarDayWindow,
  zonedLookbackStart,
} from './booking-day-window.util';

describe('booking-day-window.util', () => {
  it('resolves Europe/Berlin summer day boundaries for a late-evening UTC instant', () => {
    // 2026-07-12 23:17 UTC = 2026-07-13 01:17 CEST — org "today" is July 13.
    const reference = new Date('2026-07-12T23:17:00.000Z');
    const window = resolveZonedCalendarDayWindow(reference, 'Europe/Berlin');

    expect(window.dateOnly).toBe('2026-07-13');
    expect(window.todayStart.toISOString()).toBe('2026-07-12T22:00:00.000Z');
    expect(window.todayEnd.toISOString()).toBe('2026-07-13T21:59:59.999Z');
  });

  it('resolves Europe/Berlin winter day boundaries (CET)', () => {
    const reference = new Date('2026-01-15T10:00:00.000Z');
    const window = resolveZonedCalendarDayWindow(reference, 'Europe/Berlin');

    expect(window.dateOnly).toBe('2026-01-15');
    expect(window.todayStart.toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(window.todayEnd.toISOString()).toBe('2026-01-15T22:59:59.999Z');
  });

  it('computes lookback start in org timezone', () => {
    const lookback = zonedLookbackStart('2026-07-13', 7, 'Europe/Berlin');
    expect(lookback.toISOString()).toBe('2026-07-05T22:00:00.000Z');
  });
});
