import { StationCalendarExceptionType } from '@prisma/client';
import {
  findNextOpeningWindow,
  isStationOpenAt,
  zonedLocalTimeToUtc,
  zonedTimeOfDayMinutes,
  zonedWeekday,
} from './station-opening-calendar.util';

const BERLIN = 'Europe/Berlin';
const NEW_YORK = 'America/New_York';

const WEEKDAY_HOURS = {
  version: 2,
  monday: { slots: [{ open: '09:00', close: '18:00' }] },
  tuesday: { slots: [{ open: '09:00', close: '18:00' }] },
  wednesday: { slots: [{ open: '09:00', close: '18:00' }] },
  thursday: { slots: [{ open: '09:00', close: '18:00' }] },
  friday: { slots: [{ open: '09:00', close: '18:00' }] },
  saturday: { closed: true },
  sunday: { closed: true },
};

describe('station-opening-calendar.util', () => {
  describe('zonedTimeOfDayMinutes', () => {
    it('maps Berlin local time during standard time', () => {
      const instant = new Date('2026-01-15T08:30:00.000Z');
      expect(zonedTimeOfDayMinutes(instant, BERLIN)).toBe(9 * 60 + 30);
    });

    it('maps Berlin local time during daylight saving time', () => {
      const instant = new Date('2026-07-15T07:30:00.000Z');
      expect(zonedTimeOfDayMinutes(instant, BERLIN)).toBe(9 * 60 + 30);
    });
  });

  describe('zonedLocalTimeToUtc DST transitions', () => {
    it('resolves Berlin spring-forward day start (CET → CEST)', () => {
      const start = zonedLocalTimeToUtc('2026-03-29', '00:00', BERLIN);
      expect(start).not.toBeNull();
      expect(zonedTimeOfDayMinutes(start!, BERLIN)).toBe(0);
    });

    it('resolves Berlin slot after spring-forward transition', () => {
      const open = zonedLocalTimeToUtc('2026-03-30', '09:00', BERLIN);
      expect(open).not.toBeNull();
      expect(zonedTimeOfDayMinutes(open!, BERLIN)).toBe(9 * 60);
      expect(isStationOpenAt(open!, BERLIN, WEEKDAY_HOURS).open).toBe(true);
    });

    it('resolves Berlin fall-back evening slot', () => {
      const open = zonedLocalTimeToUtc('2026-10-25', '17:00', BERLIN);
      expect(open).not.toBeNull();
      expect(zonedTimeOfDayMinutes(open!, BERLIN)).toBe(17 * 60);
    });

    it('resolves New York DST spring-forward morning slot', () => {
      const open = zonedLocalTimeToUtc('2026-03-08', '09:30', NEW_YORK);
      expect(open).not.toBeNull();
      expect(zonedTimeOfDayMinutes(open!, NEW_YORK)).toBe(9 * 60 + 30);
    });

    it('resolves New York DST fall-back evening slot', () => {
      const open = zonedLocalTimeToUtc('2026-11-01', '18:00', NEW_YORK);
      expect(open).not.toBeNull();
      expect(zonedTimeOfDayMinutes(open!, NEW_YORK)).toBe(18 * 60);
    });
  });

  describe('isStationOpenAt', () => {
    it('returns open inside weekday slot in Berlin timezone', () => {
      const at = zonedLocalTimeToUtc('2026-07-14', '10:00', BERLIN)!;
      expect(isStationOpenAt(at, BERLIN, WEEKDAY_HOURS).open).toBe(true);
    });

    it('returns closed on configured closed day', () => {
      const saturday = new Date('2026-07-18T10:00:00.000Z');
      expect(zonedWeekday(saturday, BERLIN)).toBe('saturday');
      expect(isStationOpenAt(saturday, BERLIN, WEEKDAY_HOURS).open).toBe(false);
    });

    it('applies calendar exception closure over weekday schedule', () => {
      const at = zonedLocalTimeToUtc('2026-07-14', '10:00', BERLIN)!;
      const result = isStationOpenAt(at, BERLIN, WEEKDAY_HOURS, {
        calendarExceptions: [
          {
            type: StationCalendarExceptionType.STATION_CLOSURE,
            calendarDate: '2026-07-14',
            closedAllDay: true,
            title: 'Maintenance',
          },
        ],
      });
      expect(result.open).toBe(false);
      expect(result.schedule.kind).toBe('closed');
    });

    it('lets SPECIAL_OPENING override closure on same day', () => {
      const at = zonedLocalTimeToUtc('2026-07-14', '10:00', BERLIN)!;
      const result = isStationOpenAt(at, BERLIN, WEEKDAY_HOURS, {
        calendarExceptions: [
          {
            type: StationCalendarExceptionType.STATION_CLOSURE,
            calendarDate: '2026-07-14',
            closedAllDay: true,
            title: 'Holiday',
          },
          {
            type: StationCalendarExceptionType.SPECIAL_OPENING,
            calendarDate: '2026-07-14',
            slots: [{ open: '08:00', close: '12:00' }],
            title: 'Morning only',
          },
        ],
      });
      expect(result.open).toBe(true);
    });

    it('supports midnight-spanning slots', () => {
      const hours = {
        version: 2,
        friday: { slots: [{ open: '22:00', close: '02:00' }] },
      };
      const fridayLate = zonedLocalTimeToUtc('2026-07-17', '23:00', BERLIN)!;
      const saturdayEarly = zonedLocalTimeToUtc('2026-07-18', '01:00', BERLIN)!;
      expect(isStationOpenAt(fridayLate, BERLIN, hours).open).toBe(true);
      expect(isStationOpenAt(saturdayEarly, BERLIN, hours).open).toBe(true);
    });
  });

  describe('findNextOpeningWindow', () => {
    it('finds same-day next slot when currently closed in the morning', () => {
      const at = zonedLocalTimeToUtc('2026-07-14', '07:00', BERLIN)!;
      const next = findNextOpeningWindow(at, BERLIN, WEEKDAY_HOURS);
      expect(next).not.toBeNull();
      expect(zonedTimeOfDayMinutes(next!.opensAt, BERLIN)).toBe(9 * 60);
    });

    it('skips weekend and finds Monday window', () => {
      const at = zonedLocalTimeToUtc('2026-07-18', '12:00', BERLIN)!;
      const next = findNextOpeningWindow(at, BERLIN, WEEKDAY_HOURS);
      expect(next).not.toBeNull();
      expect(zonedWeekday(next!.opensAt, BERLIN)).toBe('monday');
    });
  });
});
