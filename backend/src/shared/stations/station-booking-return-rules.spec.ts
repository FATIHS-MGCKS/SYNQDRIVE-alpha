import { StationCalendarExceptionType } from '@prisma/client';
import {
  DEFAULT_STATION_BOOKING_RULES_ORGANIZATION_POLICY,
  StationBookingRuleOutcome,
  StationBookingRuleReasonCode,
  StationBookingRulesBookingChannel,
  type StationBookingRulesOrganizationPolicy,
} from './station-booking-rules.contract';
import { evaluateReturnBookingRules } from './station-booking-return-rules';
import { deriveIsOneWayFromStationIds } from './station-booking-return-rules.contract';
import { zonedLocalTimeToUtc } from './station-opening-calendar.util';

const BERLIN = 'Europe/Berlin';
const ORG_ID = 'org-booking-return';
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

function evaluateReturn(
  input: Omit<Partial<Parameters<typeof evaluateReturnBookingRules>[0]>, 'policy'> & {
    returnDateTime?: Date | string;
    policy?: StationBookingRulesOrganizationPolicy;
  },
) {
  const returnAt =
    input.returnAt ??
    (input.returnDateTime
      ? new Date(input.returnDateTime)
      : zonedLocalTimeToUtc('2026-07-17', '10:00', BERLIN)!);

  return evaluateReturnBookingRules({
    organizationId: ORG_ID,
    station: input.station === undefined ? { ...BASE_STATION } : input.station,
    returnAt,
    vehicle: input.vehicle,
    policy: {
      ...DEFAULT_STATION_BOOKING_RULES_ORGANIZATION_POLICY,
      ...(input.policy ?? {}),
    },
    bookingContext: input.bookingContext,
  });
}

describe('station-booking-return-rules', () => {
  it('allows return during configured opening hours with effective rule', () => {
    const result = evaluateReturn({});

    expect(result.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
    expect(result.effectiveRule?.source).toBe('station.opening_hours');
    expect(result.timezone).toBe(BERLIN);
    expect(result.adminOverrideApplied).toBe(false);
  });

  it('blocks archived and inactive return stations unconditionally', () => {
    expect(
      evaluateReturn({ station: { ...BASE_STATION, status: 'ARCHIVED' } }).outcome,
    ).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(
      evaluateReturn({ station: { ...BASE_STATION, status: 'INACTIVE' } }).reasons[0]?.code,
    ).toBe(StationBookingRuleReasonCode.STATION_INACTIVE);
  });

  it('blocks return when station organization does not match booking organization', () => {
    const result = evaluateReturn({
      station: { ...BASE_STATION, organizationId: 'other-org' },
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(result.reasons[0]?.code).toBe(StationBookingRuleReasonCode.STATION_ORG_MISMATCH);
  });

  it('blocks return when returnEnabled is false', () => {
    const result = evaluateReturn({
      station: { ...BASE_STATION, returnEnabled: false },
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(result.reasons[0]?.code).toBe(StationBookingRuleReasonCode.RETURN_DISABLED);
  });

  it('requires manual confirmation for return outside opening hours without after-hours policy', () => {
    const result = evaluateReturn({
      returnAt: zonedLocalTimeToUtc('2026-07-17', '20:00', BERLIN)!,
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED);
    expect(result.reasons[0]?.code).toBe(StationBookingRuleReasonCode.OUTSIDE_OPENING_HOURS);
  });

  it('allows after-hours return with ALLOWED_WITH_INFO by default when policy and keybox are enabled', () => {
    const result = evaluateReturn({
      station: {
        ...BASE_STATION,
        afterHoursReturnEnabled: true,
        keyBoxAvailable: true,
      },
      returnAt: zonedLocalTimeToUtc('2026-07-17', '20:00', BERLIN)!,
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
    expect(result.reasons[0]?.code).toBe(StationBookingRuleReasonCode.ALLOWED_WITH_INFO);
  });

  it('warns on after-hours return when org policy requests WARNING presentation', () => {
    const result = evaluateReturn({
      station: {
        ...BASE_STATION,
        afterHoursReturnEnabled: true,
        keyBoxAvailable: true,
      },
      returnAt: zonedLocalTimeToUtc('2026-07-17', '20:00', BERLIN)!,
      policy: {
        afterHoursReturnAllowedPresentation: 'WARNING',
      },
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.WARNING);
    expect(result.reasons[0]?.code).toBe(StationBookingRuleReasonCode.AFTER_HOURS_ALLOWED);
  });

  it('requires keybox confirmation when after-hours return lacks keybox by default', () => {
    const result = evaluateReturn({
      station: {
        ...BASE_STATION,
        afterHoursReturnEnabled: true,
        keyBoxAvailable: false,
      },
      returnAt: zonedLocalTimeToUtc('2026-07-17', '20:00', BERLIN)!,
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED);
    expect(result.reasons[0]?.code).toBe(StationBookingRuleReasonCode.KEYBOX_REQUIRED);
  });

  it('blocks return when keybox is missing and org policy says so', () => {
    const result = evaluateReturn({
      station: {
        ...BASE_STATION,
        afterHoursReturnEnabled: true,
        keyBoxAvailable: false,
      },
      returnAt: zonedLocalTimeToUtc('2026-07-17', '20:00', BERLIN)!,
      policy: {
        keyboxMissingReturnOutcome: StationBookingRuleOutcome.BLOCKED,
      },
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(result.reasons[0]?.code).toBe(StationBookingRuleReasonCode.KEYBOX_REQUIRED);
  });

  it('maps calendar holiday closures without inventing opening hours', () => {
    const result = evaluateReturn({
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
      returnAt: zonedLocalTimeToUtc('2026-10-03', '10:00', BERLIN)!,
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.WARNING);
    expect(result.reasons[0]?.code).toBe(StationBookingRuleReasonCode.HOLIDAY_CLOSURE);
    expect(result.effectiveRule?.source).toBe('station.calendar_exception');
  });

  it('flags missing timezone configuration without inventing opening hours', () => {
    const result = evaluateReturn({
      station: { ...BASE_STATION, timezone: null },
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED);
    expect(result.reasons[0]?.code).toBe(StationBookingRuleReasonCode.CONFIGURATION_INCOMPLETE);
    expect(result.effectiveRule?.ruleId).toBe('station.timezone.missing');
  });

  it('applies controlled internal admin override for soft return violations only', () => {
    const result = evaluateReturn({
      returnAt: zonedLocalTimeToUtc('2026-07-17', '20:00', BERLIN)!,
      bookingContext: {
        channel: StationBookingRulesBookingChannel.INTERNAL_ADMIN,
        adminOverride: {
          enabled: true,
          reason: 'Fleet manager approved after-hours return',
          performedByUserId: 'admin-1',
        },
      },
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
    expect(result.adminOverrideApplied).toBe(true);
    expect(
      result.reasons.some((r) => r.code === StationBookingRuleReasonCode.ADMIN_OVERRIDE_APPLIED),
    ).toBe(true);
  });

  it('does not apply admin override for return-disabled stations', () => {
    const result = evaluateReturn({
      station: { ...BASE_STATION, returnEnabled: false },
      bookingContext: {
        channel: StationBookingRulesBookingChannel.INTERNAL_ADMIN,
        adminOverride: { enabled: true, reason: 'override attempt' },
      },
    });

    expect(result.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
    expect(result.adminOverrideApplied).toBe(false);
  });

  describe('deriveIsOneWayFromStationIds', () => {
    it('derives one-way from differing station IDs', () => {
      expect(deriveIsOneWayFromStationIds(STATION_A, STATION_B)).toBe(true);
      expect(deriveIsOneWayFromStationIds(STATION_A, STATION_A)).toBe(false);
      expect(deriveIsOneWayFromStationIds(null, STATION_B)).toBe(false);
    });
  });
});
