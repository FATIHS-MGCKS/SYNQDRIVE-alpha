import { StationCalendarExceptionType, StationCalendarRecurrenceKind } from '@prisma/client';
import {
  legacyHolidayRulesHasEntries,
  parseLegacyHolidayRules,
} from './station-holiday-rules.legacy';

describe('station-holiday-rules.legacy', () => {
  it('parses array-based legacy holiday rules', () => {
    const parsed = parseLegacyHolidayRules(
      [
        { date: '2026-12-25', closed: true, name: 'Weihnachten' },
        {
          date: '2026-12-24',
          open: '10:00',
          close: '14:00',
          special: true,
          name: 'Heiligabend',
        },
      ],
      'station-1',
    );

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      type: StationCalendarExceptionType.STATION_CLOSURE,
      calendarDate: '2026-12-25',
      closedAllDay: true,
    });
    expect(parsed[1]).toMatchObject({
      type: StationCalendarExceptionType.SPECIAL_OPENING,
      calendarDate: '2026-12-24',
      slots: [{ open: '10:00', close: '14:00' }],
    });
  });

  it('parses wrapped legacy objects and yearly recurrence', () => {
    const parsed = parseLegacyHolidayRules(
      {
        exceptions: [
          {
            type: 'regional_holiday',
            recurrence: 'yearly',
            monthDay: '10-03',
            regionCode: 'DE-BY',
            title: 'Tag der Deutschen Einheit (BY)',
            closed: true,
          },
        ],
      },
      'station-2',
    );

    expect(parsed[0]).toMatchObject({
      type: StationCalendarExceptionType.REGIONAL_HOLIDAY,
      recurrenceKind: StationCalendarRecurrenceKind.YEARLY,
      monthDay: '10-03',
      regionCode: 'DE-BY',
      closedAllDay: true,
    });
  });

  it('detects whether legacy holiday JSON has entries', () => {
    expect(legacyHolidayRulesHasEntries(null)).toBe(false);
    expect(legacyHolidayRulesHasEntries({ exceptions: [{ date: '2026-01-01', closed: true }] })).toBe(
      true,
    );
  });
});
