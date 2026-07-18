import { StationCalendarExceptionType } from '@prisma/client';
import {
  StationBookingRuleOutcome,
  StationBookingRuleReasonCode,
  StationBookingRulesBookingType,
} from './station-booking-rules.contract';
import { evaluateStationBookingRules } from './station-booking-rules.resolver';
import { zonedLocalTimeToUtc } from './station-opening-calendar.util';

const BERLIN = 'Europe/Berlin';
const ORG_ID = 'org-booking-rules';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const BASE_STATION = {
  id: STATION_A,
  organizationId: ORG_ID,
  status: 'ACTIVE' as const,
  pickupEnabled: true,
  returnEnabled: true,
  afterHoursReturnEnabled: false,
  keyBoxAvailable: false,
  timezone: BERLIN,
  openingHours: {
    version: 2,
    monday: { slots: [{ open: '09:00', close: '18:00' }] },
    tuesday: { slots: [{ open: '09:00', close: '18:00' }] },
    wednesday: { slots: [{ open: '09:00', close: '18:00' }] },
    thursday: { slots: [{ open: '09:00', close: '18:00' }] },
    friday: { slots: [{ open: '09:00', close: '18:00' }] },
    saturday: { closed: true },
    sunday: { closed: true },
  },
  calendarExceptions: [],
  capacity: null,
  capacityVehicles: [],
};

function evaluate(input: Partial<Parameters<typeof evaluateStationBookingRules>[0]>) {
  const pickupAt =
    input.pickupDateTime ??
    zonedLocalTimeToUtc('2026-07-14', '10:00', BERLIN)!.toISOString();
  const returnAt =
    input.returnDateTime ??
    zonedLocalTimeToUtc('2026-07-17', '10:00', BERLIN)!.toISOString();

  return evaluateStationBookingRules({
    organizationId: ORG_ID,
    pickupStation: input.pickupStation === undefined ? { ...BASE_STATION } : input.pickupStation,
    returnStation:
      input.returnStation === undefined
        ? { ...BASE_STATION, id: STATION_A }
        : input.returnStation,
    pickupDateTime: pickupAt,
    returnDateTime: returnAt,
    bookingType: input.bookingType ?? StationBookingRulesBookingType.STANDARD,
    vehicle: input.vehicle,
    organizationPolicy: input.organizationPolicy,
  });
}

describe('station-booking-rules.resolver', () => {
  it('returns ALLOWED for pickup and return during opening hours', () => {
    const result = evaluate({});

    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
    expect(result.return.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
    expect(result.pickup.reasons).toHaveLength(0);
    expect(result.return.reasons).toHaveLength(0);
  });

  it('blocks archived stations', () => {
    const archived = { ...BASE_STATION, status: 'ARCHIVED' as const };
    const result = evaluate({
      pickupStation: archived,
      returnStation: archived,
    });

    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(result.return.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(result.pickup.reasons[0]?.code).toBe(StationBookingRuleReasonCode.STATION_ARCHIVED);
    expect(result.return.reasons[0]?.code).toBe(StationBookingRuleReasonCode.STATION_ARCHIVED);
  });

  it('always blocks inactive pickup stations even when org policy would warn', () => {
    const inactive = { ...BASE_STATION, status: 'INACTIVE' as const };
    const result = evaluate({
      pickupStation: inactive,
      organizationPolicy: {
        inactiveStationOutcome: StationBookingRuleOutcome.WARNING,
      },
    });

    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(result.pickup.reasons[0]?.code).toBe(StationBookingRuleReasonCode.STATION_INACTIVE);
  });

  it('exposes pickup effective rule and timezone on pickup side', () => {
    const result = evaluate({});

    expect(result.pickup.effectiveRule?.source).toBe('station.opening_hours');
    expect(result.pickup.timezone).toBe(BERLIN);
  });

  it('warns on pickup outside opening hours by default', () => {
    const result = evaluate({
      pickupDateTime: zonedLocalTimeToUtc('2026-07-14', '20:00', BERLIN)!.toISOString(),
    });

    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.WARNING);
    expect(result.pickup.reasons.some((r) => r.code === StationBookingRuleReasonCode.OUTSIDE_OPENING_HOURS)).toBe(
      true,
    );
  });

  it('requires manual confirmation for return outside opening hours without after-hours policy', () => {
    const result = evaluate({
      returnDateTime: zonedLocalTimeToUtc('2026-07-17', '20:00', BERLIN)!.toISOString(),
    });

    expect(result.return.outcome).toBe(StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED);
    expect(
      result.return.reasons.some((r) => r.code === StationBookingRuleReasonCode.OUTSIDE_OPENING_HOURS),
    ).toBe(true);
  });

  it('allows after-hours return when policy and keybox are enabled', () => {
    const result = evaluate({
      returnStation: {
        ...BASE_STATION,
        afterHoursReturnEnabled: true,
        keyBoxAvailable: true,
      },
      returnDateTime: zonedLocalTimeToUtc('2026-07-17', '20:00', BERLIN)!.toISOString(),
    });

    expect(result.return.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
    expect(
      result.return.evaluations.some(
        (evaluation) => evaluation.reason.code === StationBookingRuleReasonCode.ALLOWED_WITH_INFO,
      ),
    ).toBe(true);
  });

  it('requires keybox confirmation when after-hours return lacks keybox', () => {
    const result = evaluate({
      returnStation: {
        ...BASE_STATION,
        afterHoursReturnEnabled: true,
        keyBoxAvailable: false,
      },
      returnDateTime: zonedLocalTimeToUtc('2026-07-17', '20:00', BERLIN)!.toISOString(),
    });

    expect(result.return.outcome).toBe(StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED);
    expect(
      result.return.reasons.some((r) => r.code === StationBookingRuleReasonCode.KEYBOX_REQUIRED),
    ).toBe(true);
  });

  it('blocks pickup when pickup is disabled', () => {
    const result = evaluate({
      pickupStation: { ...BASE_STATION, pickupEnabled: false },
    });

    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(result.pickup.reasons[0]?.code).toBe(StationBookingRuleReasonCode.PICKUP_DISABLED);
  });

  it('blocks return when return is disabled', () => {
    const result = evaluate({
      returnStation: { ...BASE_STATION, returnEnabled: false },
    });

    expect(result.return.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(result.return.reasons[0]?.code).toBe(StationBookingRuleReasonCode.RETURN_DISABLED);
  });

  it('maps calendar exception closures to holiday closure', () => {
    const holiday = {
      ...BASE_STATION,
      calendarExceptions: [
        {
          id: 'holiday-1',
          type: StationCalendarExceptionType.REGIONAL_HOLIDAY,
          title: 'Public holiday',
          calendarDate: '2026-07-14',
          closedAllDay: true,
        },
      ],
    };

    const result = evaluate({
      pickupStation: holiday,
      pickupDateTime: zonedLocalTimeToUtc('2026-07-14', '10:00', BERLIN)!.toISOString(),
    });

    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.WARNING);
    expect(result.pickup.reasons[0]?.code).toBe(StationBookingRuleReasonCode.HOLIDAY_CLOSURE);
  });

  it('requires manual confirmation for configuration incomplete stations', () => {
    const result = evaluate({
      pickupStation: { ...BASE_STATION, timezone: null },
    });

    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED);
    expect(result.pickup.reasons[0]?.code).toBe(
      StationBookingRuleReasonCode.CONFIGURATION_INCOMPLETE,
    );
  });

  it('emits capacity warning when station is near capacity', () => {
    const vehicles = Array.from({ length: 8 }, (_, index) => ({
      id: `vehicle-${index}`,
      homeStationId: STATION_A,
      currentStationId: STATION_A,
      expectedStationId: null,
      status: 'AVAILABLE' as const,
    }));

    const result = evaluate({
      pickupStation: {
        ...BASE_STATION,
        capacity: 10,
        capacityVehicles: vehicles,
      },
    });

    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.WARNING);
    expect(
      result.pickup.reasons.some((r) => r.code === StationBookingRuleReasonCode.CAPACITY_WARNING),
    ).toBe(true);
  });

  it('requires manual confirmation when station capacity is full by default', () => {
    const vehicles = Array.from({ length: 10 }, (_, index) => ({
      id: `vehicle-${index}`,
      homeStationId: STATION_A,
      currentStationId: STATION_A,
      expectedStationId: null,
      status: 'AVAILABLE' as const,
    }));

    const result = evaluate({
      pickupStation: {
        ...BASE_STATION,
        capacity: 10,
        capacityVehicles: vehicles,
      },
    });

    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED);
    expect(
      result.pickup.reasons.some(
        (r) => r.code === StationBookingRuleReasonCode.CAPACITY_MANUAL_CONFIRMATION,
      ),
    ).toBe(true);
  });

  it('blocks when organization policy enables capacity hard block at full', () => {
    const vehicles = Array.from({ length: 10 }, (_, index) => ({
      id: `vehicle-${index}`,
      homeStationId: STATION_A,
      currentStationId: STATION_A,
      expectedStationId: null,
      status: 'AVAILABLE' as const,
    }));

    const result = evaluate({
      pickupStation: {
        ...BASE_STATION,
        capacity: 10,
        capacityVehicles: vehicles,
      },
      organizationPolicy: {
        capacityBlockAtFull: true,
      },
    });

    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(
      result.pickup.reasons.some((r) => r.code === StationBookingRuleReasonCode.CAPACITY_BLOCK),
    ).toBe(true);
  });

  it('respects organization policy to block outside opening hours', () => {
    const result = evaluate({
      pickupDateTime: zonedLocalTimeToUtc('2026-07-14', '20:00', BERLIN)!.toISOString(),
      organizationPolicy: {
        outsideOpeningHoursPickupOutcome: StationBookingRuleOutcome.BLOCKED,
      },
    });

    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(result.pickup.reasons[0]?.code).toBe(StationBookingRuleReasonCode.OUTSIDE_OPENING_HOURS);
  });

  it('blocks when pickup station is missing', () => {
    const result = evaluate({
      pickupStation: null,
    });

    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(result.pickup.stationId).toBeNull();
  });

  it('evaluates pickup and return independently', () => {
    const result = evaluate({
      pickupDateTime: zonedLocalTimeToUtc('2026-07-14', '10:00', BERLIN)!.toISOString(),
      returnDateTime: zonedLocalTimeToUtc('2026-07-17', '20:00', BERLIN)!.toISOString(),
    });

    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
    expect(result.return.outcome).toBe(StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED);
  });

  it('exposes evaluated instant with local and UTC times on each side', () => {
    const result = evaluate({});

    expect(result.pickup.evaluatedInstant.instantUtc).toBeTruthy();
    expect(result.pickup.evaluatedInstant.localDate).toBe('2026-07-14');
    expect(result.pickup.evaluatedInstant.localTime).toBe('10:00');
    expect(result.pickup.evaluatedInstant.timezone).toBe(BERLIN);
  });

  it('includes booking type and derived one-way flag in the result envelope', () => {
    const result = evaluate({
      bookingType: StationBookingRulesBookingType.ONE_WAY,
      returnStation: { ...BASE_STATION, id: STATION_B },
    });

    expect(result.bookingType).toBe(StationBookingRulesBookingType.ONE_WAY);
    expect(result.derivedIsOneWay).toBe(true);
    expect(result.version).toBe(5);
    expect(result.evaluatedAt).toBeTruthy();
  });

  it('blocks when booking type conflicts with derived one-way from station IDs', () => {
    const result = evaluate({
      bookingType: StationBookingRulesBookingType.STANDARD,
      returnStation: { ...BASE_STATION, id: STATION_B },
    });

    expect(result.derivedIsOneWay).toBe(true);
    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(result.return.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(
      result.pickup.evaluations.some(
        (evaluation) => evaluation.reason.code === StationBookingRuleReasonCode.ONE_WAY_MISMATCH,
      ),
    ).toBe(true);
  });
});
