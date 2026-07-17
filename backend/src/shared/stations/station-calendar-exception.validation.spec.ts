import { BadRequestException } from '@nestjs/common';
import {
  StationCalendarExceptionType,
  StationCalendarRecurrenceKind,
} from '@prisma/client';
import {
  assertNoCalendarExceptionConflicts,
  assertValidCalendarExceptionShape,
  buildCalendarExceptionWriteData,
  calendarExceptionsOverlap,
  detectCalendarExceptionConflicts,
} from './station-calendar-exception.validation';
import { StationCalendarExceptionValidationCode } from './station-calendar-exception.contract';

describe('station-calendar-exception.validation', () => {
  it('accepts special opening that overrides an existing closure on the same day', () => {
    const conflicts = detectCalendarExceptionConflicts(
      [
        {
          id: 'closure-1',
          status: 'ACTIVE',
          type: StationCalendarExceptionType.STATION_CLOSURE,
          title: 'Closed',
          recurrenceKind: StationCalendarRecurrenceKind.NONE,
          calendarDate: '2026-12-25',
          monthDay: null,
          closedAllDay: true,
          slots: null,
          regionCode: null,
          priority: 20,
          source: 'MANUAL',
        },
      ],
      {
        type: StationCalendarExceptionType.SPECIAL_OPENING,
        title: 'Christmas pickup window',
        recurrenceKind: StationCalendarRecurrenceKind.NONE,
        calendarDate: '2026-12-25',
        closedAllDay: false,
        slots: [{ open: '10:00', close: '14:00' }],
      },
    );

    expect(conflicts).toHaveLength(0);
  });

  it('rejects closure that would override an active special opening', () => {
    expect(() =>
      assertNoCalendarExceptionConflicts(
        [
          {
            id: 'special-1',
            status: 'ACTIVE',
            type: StationCalendarExceptionType.SPECIAL_OPENING,
            title: 'Special',
            recurrenceKind: StationCalendarRecurrenceKind.NONE,
            calendarDate: '2026-12-24',
            monthDay: null,
            closedAllDay: false,
            slots: [{ open: '10:00', close: '14:00' }],
            regionCode: null,
            priority: 100,
            source: 'MANUAL',
          },
        ],
        {
          type: StationCalendarExceptionType.STATION_CLOSURE,
          title: 'Close',
          recurrenceKind: StationCalendarRecurrenceKind.NONE,
          calendarDate: '2026-12-24',
          closedAllDay: true,
        },
      ),
    ).toThrow(BadRequestException);

    try {
      assertNoCalendarExceptionConflicts(
        [
          {
            id: 'special-1',
            status: 'ACTIVE',
            type: StationCalendarExceptionType.SPECIAL_OPENING,
            title: 'Special',
            recurrenceKind: StationCalendarRecurrenceKind.NONE,
            calendarDate: '2026-12-24',
            monthDay: null,
            closedAllDay: false,
            slots: [{ open: '10:00', close: '14:00' }],
            regionCode: null,
            priority: 100,
            source: 'MANUAL',
          },
        ],
        {
          type: StationCalendarExceptionType.STATION_CLOSURE,
          title: 'Close',
          recurrenceKind: StationCalendarRecurrenceKind.NONE,
          calendarDate: '2026-12-24',
          closedAllDay: true,
        },
      );
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: StationCalendarExceptionValidationCode.CLOSURE_OVERRIDES_SPECIAL_OPENING,
      });
    }
  });

  it('detects overlap between yearly and one-off dates', () => {
    expect(
      calendarExceptionsOverlap(
        {
          recurrenceKind: StationCalendarRecurrenceKind.YEARLY,
          monthDay: '12-25',
          calendarDate: null,
        },
        {
          recurrenceKind: StationCalendarRecurrenceKind.NONE,
          calendarDate: '2026-12-25',
          monthDay: null,
        },
      ),
    ).toBe(true);
  });

  it('requires regionCode for regional holidays', () => {
    expect(() =>
      assertValidCalendarExceptionShape({
        type: StationCalendarExceptionType.REGIONAL_HOLIDAY,
        title: 'Bayern Feiertag',
        recurrenceKind: StationCalendarRecurrenceKind.YEARLY,
        monthDay: '01-06',
        closedAllDay: true,
      }),
    ).toThrow(BadRequestException);
  });

  it('builds write data with default priorities', () => {
    const data = buildCalendarExceptionWriteData({
      type: StationCalendarExceptionType.SPECIAL_OPENING,
      title: 'Open',
      calendarDate: '2026-07-20',
      closedAllDay: false,
      slots: [{ open: '08:00', close: '12:00' }],
    });

    expect(data.priority).toBe(100);
    expect(data.calendarDate?.toISOString().slice(0, 10)).toBe('2026-07-20');
  });
});
