import {
  DEFAULT_STATION_TIMEZONE,
  formatStationTime,
  isSameStationDay,
  overdueRelativeToStation,
  resolveOpeningWindow,
  StationTimezoneError,
  stationDayBoundsUtc,
  stationLocalDate,
  stationNow,
} from './station-timezone.util';
import { getStationTimezoneContractMetadata } from './station-timezone.contract';

const BERLIN = 'Europe/Berlin';
const UTC = 'UTC';
const NEW_YORK = 'America/New_York';

describe('station-timezone.util', () => {
  describe('contract metadata', () => {
    it('exposes versioned utility contract', () => {
      const metadata = getStationTimezoneContractMetadata();
      expect(metadata.version).toBe(1);
      expect(metadata.functions).toContain('stationLocalDate');
      expect(metadata.forbiddenSources).toContain('server-local-time');
    });
  });

  describe('timezone validation', () => {
    it('rejects invalid IANA timezone', () => {
      expect(() => stationLocalDate(new Date(), 'Not/AZone')).toThrow(StationTimezoneError);
    });

    it('defaults missing timezone to Europe/Berlin', () => {
      expect(stationLocalDate(new Date('2026-01-15T12:00:00.000Z'), '')).toBe('2026-01-15');
    });
  });

  describe('stationLocalDate', () => {
    it('maps Berlin winter instant to local date', () => {
      expect(stationLocalDate(new Date('2026-01-15T23:30:00.000Z'), BERLIN)).toBe('2026-01-16');
    });

    it('maps Berlin summer instant to local date', () => {
      expect(stationLocalDate(new Date('2026-07-15T21:30:00.000Z'), BERLIN)).toBe('2026-07-15');
    });

    it('maps UTC instant without offset drift', () => {
      expect(stationLocalDate(new Date('2026-03-10T23:00:00.000Z'), UTC)).toBe('2026-03-10');
    });

    it('maps New York evening instant across UTC midnight', () => {
      expect(stationLocalDate(new Date('2026-03-10T04:30:00.000Z'), NEW_YORK)).toBe('2026-03-10');
    });
  });

  describe('stationDayBoundsUtc', () => {
    it('returns DST-aware Berlin day bounds in winter', () => {
      const bounds = stationDayBoundsUtc('2026-01-15', BERLIN);
      expect(bounds.startUtc.toISOString()).toBe('2026-01-14T23:00:00.000Z');
      expect(bounds.endUtc.toISOString()).toBe('2026-01-15T22:59:59.999Z');
    });

    it('returns DST-aware Berlin day bounds in summer', () => {
      const bounds = stationDayBoundsUtc('2026-07-15', BERLIN);
      expect(bounds.startUtc.toISOString()).toBe('2026-07-14T22:00:00.000Z');
      expect(bounds.endUtc.toISOString()).toBe('2026-07-15T21:59:59.999Z');
    });

    it('returns UTC day bounds without offset', () => {
      const bounds = stationDayBoundsUtc('2026-05-01', UTC);
      expect(bounds.startUtc.toISOString()).toBe('2026-05-01T00:00:00.000Z');
      expect(bounds.endUtc.toISOString()).toBe('2026-05-01T23:59:59.999Z');
    });

    it('returns New York DST spring-forward day bounds', () => {
      const bounds = stationDayBoundsUtc('2026-03-08', NEW_YORK);
      expect(bounds.startUtc.toISOString()).toBe('2026-03-08T05:00:00.000Z');
      expect(bounds.endUtc.toISOString()).toBe('2026-03-09T03:59:59.999Z');
    });

    it('returns Berlin DST fall-back day bounds', () => {
      const bounds = stationDayBoundsUtc('2026-10-25', BERLIN);
      expect(bounds.startUtc.toISOString()).toBe('2026-10-24T22:00:00.000Z');
      expect(bounds.endUtc.toISOString()).toBe('2026-10-25T22:59:59.999Z');
    });
  });

  describe('isSameStationDay', () => {
    it('returns true for instants on same Berlin calendar day', () => {
      expect(
        isSameStationDay(
          '2026-07-15T06:00:00.000Z',
          '2026-07-15T20:00:00.000Z',
          BERLIN,
        ),
      ).toBe(true);
    });

    it('returns false across Berlin midnight', () => {
      expect(
        isSameStationDay(
          '2026-07-15T21:00:00.000Z',
          '2026-07-15T23:00:00.000Z',
          BERLIN,
        ),
      ).toBe(false);
    });

    it('compares New York instants on same station day', () => {
      expect(
        isSameStationDay(
          '2026-11-01T04:00:00.000Z',
          '2026-11-01T05:30:00.000Z',
          NEW_YORK,
        ),
      ).toBe(true);
    });
  });

  describe('stationNow', () => {
    it('derives local date/time from explicit UTC reference', () => {
      const now = stationNow(BERLIN, '2026-07-14T08:30:00.000Z');
      expect(now.timezone).toBe(BERLIN);
      expect(now.localDate).toBe('2026-07-14');
      expect(now.localTime).toBe('10:30');
      expect(now.instantUtc.toISOString()).toBe('2026-07-14T08:30:00.000Z');
    });

    it('uses UTC reference without server-local assumptions', () => {
      const now = stationNow(UTC, '2026-12-31T22:15:00.000Z');
      expect(now.localDate).toBe('2026-12-31');
      expect(now.localTime).toBe('22:15');
    });
  });

  describe('formatStationTime', () => {
    it('formats instant in station timezone', () => {
      const formatted = formatStationTime('2026-07-14T08:30:00.000Z', BERLIN, {
        dateStyle: 'short',
        timeStyle: 'short',
      });
      expect(formatted).toContain('14');
      expect(formatted).toMatch(/10:30/);
    });
  });

  describe('resolveOpeningWindow', () => {
    it('resolves same-day Berlin opening window', () => {
      const window = resolveOpeningWindow('2026-07-14', { open: '09:00', close: '18:00' }, BERLIN);
      expect(window.opensAtUtc.toISOString()).toBe('2026-07-14T07:00:00.000Z');
      expect(window.closesAtUtc.toISOString()).toBe('2026-07-14T16:00:00.000Z');
      expect(window.spansMidnight).toBe(false);
    });

    it('resolves midnight-spanning opening window', () => {
      const window = resolveOpeningWindow('2026-07-17', { open: '22:00', close: '02:00' }, BERLIN);
      expect(window.spansMidnight).toBe(true);
      expect(stationLocalDate(window.opensAtUtc, BERLIN)).toBe('2026-07-17');
      expect(stationLocalDate(window.closesAtUtc, BERLIN)).toBe('2026-07-18');
    });

    it('resolves New York DST day opening window', () => {
      const window = resolveOpeningWindow('2026-03-08', { open: '09:00', close: '17:00' }, NEW_YORK);
      expect(window.opensAtUtc.toISOString()).toBe('2026-03-08T13:00:00.000Z');
      expect(window.closesAtUtc.toISOString()).toBe('2026-03-08T21:00:00.000Z');
    });
  });

  describe('overdueRelativeToStation', () => {
    it('marks due instant in the past as overdue', () => {
      const result = overdueRelativeToStation(
        '2026-07-14T08:00:00.000Z',
        BERLIN,
        '2026-07-14T10:00:00.000Z',
      );
      expect(result.overdue).toBe(true);
      expect(result.overdueByMs).toBe(2 * 60 * 60 * 1000);
      expect(result.dueLocalDate).toBe('2026-07-14');
      expect(result.evaluatedLocalDate).toBe('2026-07-14');
    });

    it('returns not overdue when due instant is in the future', () => {
      const result = overdueRelativeToStation(
        '2026-07-14T12:00:00.000Z',
        BERLIN,
        '2026-07-14T10:00:00.000Z',
      );
      expect(result.overdue).toBe(false);
      expect(result.overdueByMs).toBe(0);
    });

    it('evaluates overdue across Berlin station-day boundary', () => {
      const result = overdueRelativeToStation(
        '2026-07-14T21:00:00.000Z',
        BERLIN,
        '2026-07-15T06:00:00.000Z',
      );
      expect(result.overdue).toBe(true);
      expect(result.dueLocalDate).toBe('2026-07-14');
      expect(result.evaluatedLocalDate).toBe('2026-07-15');
    });
  });

  describe('defaults', () => {
    it('uses Europe/Berlin as default station timezone constant', () => {
      expect(DEFAULT_STATION_TIMEZONE).toBe('Europe/Berlin');
    });
  });
});
