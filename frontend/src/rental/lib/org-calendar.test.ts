import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ORG_TIMEZONE,
  isScheduledOnOrgCalendarDay,
  zonedDateOnly,
  zonedStartOfDayToUtc,
} from './org-calendar';

describe('org-calendar', () => {
  it('resolves Berlin calendar day across midnight UTC', () => {
    const reference = new Date('2026-03-29T22:30:00.000Z');
    expect(zonedDateOnly(reference, 'Europe/Berlin')).toBe('2026-03-30');
  });

  it('matches scheduled instant on org calendar day, not browser-local day', () => {
    const reference = new Date('2026-07-25T22:00:00.000Z');
    expect(
      isScheduledOnOrgCalendarDay('2026-07-26T06:00:00.000Z', reference, 'Europe/Berlin'),
    ).toBe(true);
    expect(
      isScheduledOnOrgCalendarDay('2026-07-25T20:00:00.000Z', reference, 'Europe/Berlin'),
    ).toBe(false);
  });

  it('handles DST spring-forward start of day', () => {
    const start = zonedStartOfDayToUtc('2026-03-29', 'Europe/Berlin');
    expect(zonedDateOnly(start, 'Europe/Berlin')).toBe('2026-03-29');
    expect(start.getTime()).toBeLessThan(Date.parse('2026-03-29T02:00:00.000Z'));
  });

  it('handles DST fall-back start of day', () => {
    const start = zonedStartOfDayToUtc('2026-10-25', 'Europe/Berlin');
    expect(zonedDateOnly(start, 'Europe/Berlin')).toBe('2026-10-25');
  });

  it('defaults to Europe/Berlin when timezone is blank', () => {
    const reference = new Date('2026-07-25T10:00:00.000Z');
    expect(isScheduledOnOrgCalendarDay('2026-07-25T08:00:00.000Z', reference, '   ')).toBe(true);
    expect(zonedDateOnly(reference, '')).toBe(
      zonedDateOnly(reference, DEFAULT_ORG_TIMEZONE),
    );
  });
});
