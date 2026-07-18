import { StationCalendarExceptionType, StationStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { STATION_SCOPE_MODE } from '@shared/stations/station-scope.constants';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import { StationBookingRuleOutcome, StationBookingRulesBookingType } from '@shared/stations/station-booking-rules.contract';
import { zonedLocalTimeToUtc } from '@shared/stations/station-opening-calendar.util';
import { StationBookingRulesService } from './station-booking-rules.service';
import { StationRuleManualOverrideService } from './station-rule-manual-override.service';
import { StationsAccessService } from './stations-access.service';

const ORG = 'org-booking-calendar';
const PICKUP_STATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RETURN_STATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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

describe('StationBookingRulesService calendar/timezone integration', () => {
  const prisma = {
    station: {
      findFirst: jest.fn(),
    },
    vehicle: {
      findFirst: jest.fn(),
    },
  } as unknown as PrismaService;

  const stationAccessScope = new StationAccessScopeService(
    prisma,
    new StationScopeService(prisma),
  );
  const manualOverrideService = {
    persistAppliedOverride: jest.fn(),
    validate: jest.fn(),
  } as unknown as StationRuleManualOverrideService;

  const stationsAccess = {
    assertStationsPermission: jest.fn().mockResolvedValue(undefined),
  } as unknown as StationsAccessService;

  const service = new StationBookingRulesService(
    prisma,
    stationAccessScope,
    stationsAccess,
    manualOverrideService,
  );

  const allScope: StationScopeContext = {
    orgId: ORG,
    mode: STATION_SCOPE_MODE.ALL_STATIONS,
    allowedStationIds: [],
    bypassScope: false,
  };

  const berlinStation = {
    id: PICKUP_STATION_ID,
    organizationId: ORG,
    status: StationStatus.ACTIVE,
    pickupEnabled: true,
    returnEnabled: true,
    afterHoursReturnEnabled: false,
    keyBoxAvailable: false,
    timezone: 'Europe/Berlin',
    openingHours: WEEKDAY_HOURS,
    holidayRules: null,
    capacity: null,
    calendarExceptions: [],
  };

  const newYorkStation = {
    ...berlinStation,
    id: RETURN_STATION_ID,
    timezone: 'America/New_York',
    calendarExceptions: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.station.findFirst as jest.Mock).mockImplementation(
      async (args: { where?: { id?: string } }) => {
        const stationId = args?.where?.id;
        if (stationId === PICKUP_STATION_ID) return berlinStation;
        if (stationId === RETURN_STATION_ID) return newYorkStation;
        return null;
      },
    );
  });

  it('exposes contract metadata forbidding frontend recomputation', () => {
    const metadata = service.getContractMetadata();
    expect(metadata.frontendRecomputation).toBe(false);
    expect(metadata.instantEvaluation).toBe('station_timezone');
    expect(metadata.calendarIntegration).toBe('opening_calendar_v2');
    expect(metadata.version).toBe(5);
  });

  it('evaluates pickup and return with independent station timezones and local/UTC instants', async () => {
    const pickupUtc = zonedLocalTimeToUtc('2026-07-14', '10:00', 'Europe/Berlin')!.toISOString();
    const returnUtc = zonedLocalTimeToUtc('2026-07-17', '10:00', 'America/New_York')!.toISOString();

    const result = await service.evaluateRequest(
      ORG,
      {
        pickupStationId: PICKUP_STATION_ID,
        returnStationId: RETURN_STATION_ID,
        pickupDateTime: pickupUtc,
        returnDateTime: returnUtc,
        bookingType: StationBookingRulesBookingType.ONE_WAY,
      },
      allScope,
    );

    expect(result.pickup.timezone).toBe('Europe/Berlin');
    expect(result.return.timezone).toBe('America/New_York');
    expect(result.pickup.evaluatedInstant.localDate).toBe('2026-07-14');
    expect(result.pickup.evaluatedInstant.localTime).toBe('10:00');
    expect(result.return.evaluatedInstant.localDate).toBe('2026-07-17');
    expect(result.return.evaluatedInstant.localTime).toBe('10:00');
    expect(result.pickup.evaluatedInstant.instantUtc).toBe(pickupUtc);
    expect(result.return.evaluatedInstant.instantUtc).toBe(returnUtc);
    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
    expect(result.return.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
  });

  it('uses station business day for holiday closure independent of UTC calendar date', async () => {
    (prisma.station.findFirst as jest.Mock).mockImplementation(
      async (args: { where?: { id?: string } }) => {
        if (args?.where?.id === PICKUP_STATION_ID) {
          return {
            ...berlinStation,
            calendarExceptions: [
              {
                id: 'holiday-berlin',
                type: StationCalendarExceptionType.REGIONAL_HOLIDAY,
                title: 'Public holiday',
                recurrenceKind: 'NONE',
                calendarDate: new Date('2026-07-14T00:00:00.000Z'),
                monthDay: null,
                closedAllDay: true,
                slots: null,
                regionCode: 'DE',
                priority: 20,
                source: 'MANUAL',
              },
            ],
          };
        }
        return berlinStation;
      },
    );

    const pickupUtc = zonedLocalTimeToUtc('2026-07-14', '10:00', 'Europe/Berlin')!.toISOString();
    const result = await service.evaluateRequest(
      ORG,
      {
        pickupStationId: PICKUP_STATION_ID,
        returnStationId: PICKUP_STATION_ID,
        pickupDateTime: pickupUtc,
        returnDateTime: pickupUtc,
        bookingType: StationBookingRulesBookingType.STANDARD,
      },
      allScope,
    );

    expect(result.pickup.evaluatedInstant.localDate).toBe('2026-07-14');
    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.WARNING);
    expect(result.pickup.reasons[0]?.code).toBe('HOLIDAY_CLOSURE');
    expect(result.pickup.effectiveRule?.source).toBe('station.calendar_exception');
  });

  it('lets SPECIAL_OPENING override holiday closure per opening calendar contract', async () => {
    (prisma.station.findFirst as jest.Mock).mockImplementation(
      async (args: { where?: { id?: string } }) => {
        if (args?.where?.id === PICKUP_STATION_ID) {
          return {
            ...berlinStation,
            calendarExceptions: [
              {
                id: 'closure',
                type: StationCalendarExceptionType.STATION_CLOSURE,
                title: 'Holiday',
                recurrenceKind: 'NONE',
                calendarDate: new Date('2026-07-14T00:00:00.000Z'),
                monthDay: null,
                closedAllDay: true,
                slots: null,
                regionCode: null,
                priority: 10,
                source: 'MANUAL',
              },
              {
                id: 'special',
                type: StationCalendarExceptionType.SPECIAL_OPENING,
                title: 'Morning service',
                recurrenceKind: 'NONE',
                calendarDate: new Date('2026-07-14T00:00:00.000Z'),
                monthDay: null,
                closedAllDay: false,
                slots: [{ open: '08:00', close: '12:00' }],
                regionCode: null,
                priority: 30,
                source: 'MANUAL',
              },
            ],
          };
        }
        return berlinStation;
      },
    );

    const pickupUtc = zonedLocalTimeToUtc('2026-07-14', '10:00', 'Europe/Berlin')!.toISOString();
    const result = await service.evaluateRequest(
      ORG,
      {
        pickupStationId: PICKUP_STATION_ID,
        returnStationId: PICKUP_STATION_ID,
        pickupDateTime: pickupUtc,
        returnDateTime: pickupUtc,
        bookingType: StationBookingRulesBookingType.STANDARD,
      },
      allScope,
    );

    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
    expect(
      result.pickup.evaluations.some(
        (evaluation) => evaluation.ruleId === 'pickup.within_opening_hours',
      ),
    ).toBe(true);
  });

  it('evaluates Berlin DST spring-forward pickup using station timezone', async () => {
    const pickupUtc = zonedLocalTimeToUtc('2026-03-30', '09:00', 'Europe/Berlin')!.toISOString();
    const result = await service.evaluateRequest(
      ORG,
      {
        pickupStationId: PICKUP_STATION_ID,
        returnStationId: PICKUP_STATION_ID,
        pickupDateTime: pickupUtc,
        returnDateTime: pickupUtc,
        bookingType: StationBookingRulesBookingType.STANDARD,
      },
      allScope,
    );

    expect(result.pickup.evaluatedInstant.localDate).toBe('2026-03-30');
    expect(result.pickup.evaluatedInstant.localTime).toBe('09:00');
    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
  });
});
