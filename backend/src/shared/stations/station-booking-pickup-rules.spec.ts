import { StationCalendarExceptionType } from '@prisma/client';
import {
  DEFAULT_STATION_BOOKING_RULES_ORGANIZATION_POLICY,
  StationBookingRuleOutcome,
  StationBookingRuleReasonCode,
  StationBookingRulesBookingChannel,
  type StationBookingRulesOrganizationPolicy,
} from './station-booking-rules.contract';
import { evaluatePickupBookingRules } from './station-booking-pickup-rules';
import { zonedLocalTimeToUtc } from './station-opening-calendar.util';

const BERLIN = 'Europe/Berlin';
const NEW_YORK = 'America/New_York';
const ORG_ID = 'org-booking-pickup';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

function evaluatePickup(
  input: Omit<Partial<Parameters<typeof evaluatePickupBookingRules>[0]>, 'policy'> & {
    pickupDateTime?: Date | string;
    policy?: StationBookingRulesOrganizationPolicy;
  },
) {
  const pickupAt =
    input.pickupAt ??
    (input.pickupDateTime
      ? new Date(input.pickupDateTime)
      : zonedLocalTimeToUtc('2026-07-14', '10:00', BERLIN)!);

  return evaluatePickupBookingRules({
    organizationId: ORG_ID,
    station: input.station === undefined ? { ...BASE_STATION } : input.station,
    pickupAt,
    vehicle: input.vehicle,
    policy: {
      ...DEFAULT_STATION_BOOKING_RULES_ORGANIZATION_POLICY,
      ...(input.policy ?? {}),
    },
    bookingContext: input.bookingContext,
  });
}

describe('station-booking-pickup-rules', () => {
  it('allows pickup during configured opening hours with effective rule', () => {
    const result = evaluatePickup({});

    expect(result.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
    expect(result.effectiveRule?.source).toBe('station.opening_hours');
    expect(result.timezone).toBe(BERLIN);
    expect(result.adminOverrideApplied).toBe(false);
  });

  it('blocks archived and inactive pickup stations unconditionally', () => {
    expect(
      evaluatePickup({ station: { ...BASE_STATION, status: 'ARCHIVED' } }).outcome,
    ).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(
      evaluatePickup({ station: { ...BASE_STATION, status: 'INACTIVE' } }).reasons[0]?.code,
    ).toBe(StationBookingRuleReasonCode.STATION_INACTIVE);
  });

  it('blocks pickup when station organization does not match booking organization', () => {
    const result = evaluatePickup({
      station: { ...BASE_STATION, organizationId: 'other-org' },
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(result.reasons[0]?.code).toBe(StationBookingRuleReasonCode.STATION_ORG_MISMATCH);
  });

  it('blocks pickup when pickupEnabled is false', () => {
    const result = evaluatePickup({
      station: { ...BASE_STATION, pickupEnabled: false },
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(result.reasons[0]?.code).toBe(StationBookingRuleReasonCode.PICKUP_DISABLED);
  });

  it('warns on pickup outside opening hours by default without inventing hours', () => {
    const result = evaluatePickup({
      pickupAt: zonedLocalTimeToUtc('2026-07-14', '20:00', BERLIN)!,
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.WARNING);
    expect(result.reasons[0]?.code).toBe(StationBookingRuleReasonCode.OUTSIDE_OPENING_HOURS);
    expect(result.effectiveRule?.source).toBe('station.opening_hours');
  });

  it('requires manual confirmation for outside hours when org policy says so', () => {
    const result = evaluatePickup({
      pickupAt: zonedLocalTimeToUtc('2026-07-14', '20:00', BERLIN)!,
      policy: {
        outsideOpeningHoursPickupOutcome: StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED,
      },
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED);
  });

  it('maps calendar holiday closures without inventing opening hours', () => {
    const result = evaluatePickup({
      station: {
        ...BASE_STATION,
        calendarExceptions: [
          {
            id: 'holiday-1',
            type: StationCalendarExceptionType.REGIONAL_HOLIDAY,
            title: 'Unity Day',
            calendarDate: '2026-10-03',
            closedAllDay: true,
          },
        ],
      },
      pickupAt: zonedLocalTimeToUtc('2026-10-03', '10:00', BERLIN)!,
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.WARNING);
    expect(result.reasons[0]?.code).toBe(StationBookingRuleReasonCode.HOLIDAY_CLOSURE);
    expect(result.effectiveRule?.source).toBe('station.calendar_exception');
  });

  it('flags missing timezone configuration without inventing opening hours', () => {
    const result = evaluatePickup({
      station: { ...BASE_STATION, timezone: null },
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED);
    expect(result.reasons[0]?.code).toBe(StationBookingRuleReasonCode.CONFIGURATION_INCOMPLETE);
    expect(result.effectiveRule?.ruleId).toBe('station.timezone.missing');
  });

  it('emits capacity warning for pickup without blocking when below hard limit', () => {
    const vehicles = Array.from({ length: 8 }, (_, index) => ({
      id: `vehicle-${index}`,
      homeStationId: STATION_A,
      currentStationId: STATION_A,
      expectedStationId: null,
      status: 'AVAILABLE' as const,
    }));

    const result = evaluatePickup({
      station: {
        ...BASE_STATION,
        capacity: 10,
        capacityVehicles: vehicles,
      },
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.WARNING);
    expect(result.reasons.some((r) => r.code === StationBookingRuleReasonCode.CAPACITY_WARNING)).toBe(
      true,
    );
  });

  it('does not apply legacy admin override at pickup rule layer anymore', () => {
    const result = evaluatePickup({
      pickupAt: zonedLocalTimeToUtc('2026-07-14', '20:00', BERLIN)!,
      bookingContext: {
        channel: StationBookingRulesBookingChannel.INTERNAL_ADMIN,
        adminOverride: {
          enabled: true,
          reason: 'Fleet manager approved after-hours pickup',
          performedByUserId: 'admin-1',
        },
      },
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.WARNING);
    expect(result.manualOverrideApplied).toBe(false);
  });

  it('does not apply admin override for archived pickup stations', () => {
    const result = evaluatePickup({
      station: { ...BASE_STATION, status: 'ARCHIVED' },
      bookingContext: {
        channel: StationBookingRulesBookingChannel.INTERNAL_ADMIN,
        adminOverride: { enabled: true, reason: 'override attempt' },
      },
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(result.adminOverrideApplied).toBe(false);
  });

  describe('DST transitions', () => {
    it('evaluates Berlin spring-forward Tuesday morning pickup as open', () => {
      const result = evaluatePickup({
        pickupAt: zonedLocalTimeToUtc('2026-03-31', '10:00', BERLIN)!,
      });

      expect(result.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
      expect(result.timezone).toBe(BERLIN);
    });

    it('evaluates Berlin DST fall-back Monday evening pickup as outside hours warning', () => {
      const result = evaluatePickup({
        pickupAt: zonedLocalTimeToUtc('2026-10-26', '19:00', BERLIN)!,
      });

      expect(result.outcome).toBe(StationBookingRuleOutcome.WARNING);
      expect(result.reasons[0]?.code).toBe(StationBookingRuleReasonCode.OUTSIDE_OPENING_HOURS);
    });

    it('evaluates New York DST spring-forward morning pickup using station timezone', () => {
      const result = evaluatePickup({
        station: {
          ...BASE_STATION,
          timezone: NEW_YORK,
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
        },
        pickupAt: zonedLocalTimeToUtc('2026-03-09', '10:00', NEW_YORK)!,
      });

      expect(result.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
      expect(result.timezone).toBe(NEW_YORK);
    });
  });
});
