import { BadRequestException } from '@nestjs/common';
import {
  assertValidStationOpeningHours,
  expandSlotToMinuteIntervals,
  getStationOpeningHoursContractMetadata,
  minuteIntervalsOverlap,
  normalizeStationOpeningHoursForRead,
  slotsHaveOverlap,
  stationOpeningHoursIsMissing,
  STATION_OPENING_HOURS_CONTRACT_VERSION,
  StationOpeningHoursValidationCode,
} from './station-opening-hours.validation';

describe('station-opening-hours.validation', () => {
  describe('contract metadata', () => {
    it('exposes version 2 canonical metadata', () => {
      expect(getStationOpeningHoursContractMetadata()).toMatchObject({
        version: STATION_OPENING_HOURS_CONTRACT_VERSION,
        missingDayPolicy: 'closed',
        timeFormat: 'HH:mm',
        timezoneSource: 'station.timezone',
      });
    });
  });

  describe('assertValidStationOpeningHours', () => {
    it('allows null and legacy free-text', () => {
      expect(() => assertValidStationOpeningHours(null)).not.toThrow();
      expect(() => assertValidStationOpeningHours('Mo–Fr 8–18')).not.toThrow();
      expect(() =>
        assertValidStationOpeningHours({ legacyText: 'By appointment only' }),
      ).not.toThrow();
    });

    it('rejects empty day objects', () => {
      try {
        assertValidStationOpeningHours({ monday: {} });
      } catch (e) {
        expect((e as BadRequestException).getResponse()).toMatchObject({
          code: StationOpeningHoursValidationCode.EMPTY_DAY,
        });
      }
    });

    it('rejects unknown weekdays', () => {
      expect(() =>
        assertValidStationOpeningHours({ funday: { closed: true } }),
      ).toThrow(BadRequestException);
    });

    it('accepts closed days', () => {
      expect(() =>
        assertValidStationOpeningHours({
          version: 2,
          sunday: { closed: true },
        }),
      ).not.toThrow();
    });

    it('accepts 24-hour days', () => {
      expect(() =>
        assertValidStationOpeningHours({
          friday: { open24h: true },
        }),
      ).not.toThrow();
    });

    it('accepts legacy single open/close per day', () => {
      expect(() =>
        assertValidStationOpeningHours({
          monday: { open: '08:00', close: '18:00' },
        }),
      ).not.toThrow();
    });

    it('accepts multiple slots with a break', () => {
      expect(() =>
        assertValidStationOpeningHours({
          tuesday: {
            slots: [
              { open: '08:00', close: '12:00' },
              { open: '13:00', close: '18:00' },
            ],
          },
        }),
      ).not.toThrow();
    });

    it('accepts midnight-spanning slots', () => {
      expect(() =>
        assertValidStationOpeningHours({
          saturday: { open: '22:00', close: '06:00' },
        }),
      ).not.toThrow();
    });

    it('rejects overlapping slots on the same day', () => {
      try {
        assertValidStationOpeningHours({
          wednesday: {
            slots: [
              { open: '08:00', close: '14:00' },
              { open: '12:00', close: '18:00' },
            ],
          },
        });
      } catch (e) {
        expect((e as BadRequestException).getResponse()).toMatchObject({
          code: StationOpeningHoursValidationCode.OVERLAPPING_SLOTS,
        });
      }
    });

    it('rejects overlapping midnight-spanning slots', () => {
      expect(() =>
        assertValidStationOpeningHours({
          friday: {
            slots: [
              { open: '22:00', close: '06:00' },
              { open: '23:00', close: '01:00' },
            ],
          },
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects invalid time format', () => {
      expect(() =>
        assertValidStationOpeningHours({
          monday: { open: '25:99', close: '18:00' },
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects equal open and close times', () => {
      expect(() =>
        assertValidStationOpeningHours({
          monday: { open: '08:00', close: '08:00' },
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects unsupported contract version', () => {
      expect(() =>
        assertValidStationOpeningHours({
          version: 99,
          monday: { closed: true },
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('slot interval helpers', () => {
    it('expands midnight-spanning slots into two intervals', () => {
      expect(expandSlotToMinuteIntervals({ open: '22:00', close: '06:00' })).toEqual([
        [22 * 60, 24 * 60],
        [0, 6 * 60],
      ]);
    });

    it('detects overlap across midnight pieces', () => {
      const a: [number, number] = [22 * 60, 24 * 60];
      const b: [number, number] = [23 * 60, 24 * 60];
      expect(minuteIntervalsOverlap(a, b)).toBe(true);
      expect(
        slotsHaveOverlap([
          { open: '22:00', close: '06:00' },
          { open: '23:00', close: '01:00' },
        ]),
      ).toBe(true);
    });
  });

  describe('stationOpeningHoursIsMissing', () => {
    it('treats omitted schedule as missing', () => {
      expect(stationOpeningHoursIsMissing(null)).toBe(true);
      expect(stationOpeningHoursIsMissing({})).toBe(true);
    });

    it('treats legacy text as configured', () => {
      expect(stationOpeningHoursIsMissing({ legacyText: '24/7 hotline' })).toBe(false);
    });

    it('treats partial weekday schedule as configured', () => {
      expect(stationOpeningHoursIsMissing({ monday: { closed: true } })).toBe(false);
    });
  });

  describe('normalizeStationOpeningHoursForRead', () => {
    it('adds contract version and normalizes legacy single slots', () => {
      expect(
        normalizeStationOpeningHoursForRead({
          monday: { open: '08:00', close: '18:00' },
          sunday: { closed: true },
        }),
      ).toEqual({
        version: 2,
        monday: { slots: [{ open: '08:00', close: '18:00' }] },
        sunday: { closed: true },
      });
    });

    it('keeps legacy text unchanged', () => {
      expect(normalizeStationOpeningHoursForRead({ legacyText: 'Call ahead' })).toEqual({
        legacyText: 'Call ahead',
      });
    });
  });
});
