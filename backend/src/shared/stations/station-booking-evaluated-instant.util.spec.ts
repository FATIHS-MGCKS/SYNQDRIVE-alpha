import { StationCalendarExceptionType } from '@prisma/client';
import { zonedLocalTimeToUtc } from './station-opening-calendar.util';
import { resolveStationBookingEvaluatedInstant } from './station-booking-evaluated-instant.util';

const BERLIN = 'Europe/Berlin';
const NEW_YORK = 'America/New_York';
const TOKYO = 'Asia/Tokyo';

describe('station-booking-evaluated-instant.util', () => {
  it('derives business day from station timezone, not server timezone', () => {
    const utc = new Date('2026-07-14T22:30:00.000Z');
    const berlin = resolveStationBookingEvaluatedInstant(utc, BERLIN);
    const newYork = resolveStationBookingEvaluatedInstant(utc, NEW_YORK);

    expect(berlin.localDate).toBe('2026-07-15');
    expect(berlin.localTime).toBe('00:30');
    expect(newYork.localDate).toBe('2026-07-14');
    expect(newYork.localTime).toBe('18:30');
    expect(berlin.instantUtc).toBe(utc.toISOString());
    expect(newYork.instantUtc).toBe(utc.toISOString());
  });

  it('handles Berlin DST spring-forward local time', () => {
    const at = zonedLocalTimeToUtc('2026-03-30', '09:00', BERLIN)!;
    const instant = resolveStationBookingEvaluatedInstant(at, BERLIN);

    expect(instant.localDate).toBe('2026-03-30');
    expect(instant.localTime).toBe('09:00');
  });

  it('handles Berlin DST fall-back ambiguous evening local time', () => {
    const at = zonedLocalTimeToUtc('2026-10-25', '17:00', BERLIN)!;
    const instant = resolveStationBookingEvaluatedInstant(at, BERLIN);

    expect(instant.localDate).toBe('2026-10-25');
    expect(instant.localTime).toBe('17:00');
  });

  it('returns null local fields when timezone is missing', () => {
    const at = new Date('2026-07-14T08:00:00.000Z');
    const instant = resolveStationBookingEvaluatedInstant(at, null);

    expect(instant.instantUtc).toBe(at.toISOString());
    expect(instant.localDate).toBeNull();
    expect(instant.localTime).toBeNull();
    expect(instant.timezone).toBeNull();
  });

  it('supports different IANA zones for pickup vs return evaluation', () => {
    const utc = new Date('2026-07-15T04:00:00.000Z');
    const tokyo = resolveStationBookingEvaluatedInstant(utc, TOKYO);
    const newYork = resolveStationBookingEvaluatedInstant(utc, NEW_YORK);

    expect(tokyo.localDate).toBe('2026-07-15');
    expect(tokyo.localTime).toBe('13:00');
    expect(newYork.localDate).toBe('2026-07-15');
    expect(newYork.localTime).toBe('00:00');
  });
});
