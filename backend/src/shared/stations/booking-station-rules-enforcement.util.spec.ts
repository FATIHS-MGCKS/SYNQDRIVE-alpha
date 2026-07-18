import {
  StationBookingRuleOutcome,
  StationBookingRulesBookingType,
  type StationBookingRulesResult,
} from './station-booking-rules.contract';
import {
  assessBookingStationRulesPersistence,
  bookingRequiresStationRulesEvaluation,
  extractStationBookingRulesContext,
  resolveServerBookingRulesType,
  stripStationBookingRulesRequestFields,
} from './booking-station-rules-enforcement.util';

function baseResult(
  overrides: Partial<StationBookingRulesResult> = {},
): StationBookingRulesResult {
  return {
    version: 5,
    evaluatedAt: '2026-07-18T10:00:00.000Z',
    bookingType: StationBookingRulesBookingType.STANDARD,
    derivedIsOneWay: false,
    pickup: {
      side: 'pickup',
      stationId: 'pickup',
      outcome: StationBookingRuleOutcome.ALLOWED,
      reasons: [],
      evaluations: [],
      effectiveRule: null,
      timezone: 'Europe/Berlin',
      evaluatedInstant: {
        instantUtc: '2026-07-18T08:00:00.000Z',
        localDate: '2026-07-18',
        localTime: '10:00',
        timezone: 'Europe/Berlin',
      },
      adminOverrideApplied: false,
      manualOverrideApplied: false,
    },
    return: {
      side: 'return',
      stationId: 'return',
      outcome: StationBookingRuleOutcome.ALLOWED,
      reasons: [],
      evaluations: [],
      effectiveRule: null,
      timezone: 'Europe/Berlin',
      evaluatedInstant: {
        instantUtc: '2026-07-20T16:00:00.000Z',
        localDate: '2026-07-20',
        localTime: '18:00',
        timezone: 'Europe/Berlin',
      },
      adminOverrideApplied: false,
      manualOverrideApplied: false,
    },
    manualOverrideRequired: false,
    manualOverrideApplied: false,
    manualOverrideAudit: null,
    ...overrides,
  };
}

describe('booking-station-rules-enforcement.util', () => {
  it('derives booking type from server-side one-way flag', () => {
    expect(resolveServerBookingRulesType(false)).toBe(StationBookingRulesBookingType.STANDARD);
    expect(resolveServerBookingRulesType(true)).toBe(StationBookingRulesBookingType.ONE_WAY);
  });

  it('skips evaluation when address overrides replace station selection', () => {
    expect(
      bookingRequiresStationRulesEvaluation({
        pickupStationId: 'a',
        returnStationId: 'b',
        pickupAddressOverride: 'Custom pickup',
      }),
    ).toBe(false);
  });

  it('extracts manual override context and strips API-only fields', () => {
    const extracted = extractStationBookingRulesContext({
      stationBookingRules: {
        manualOverride: { reason: 'Approved by station manager' },
      },
    });
    expect(extracted?.manualOverride?.reason).toBe('Approved by station manager');

    const stripped = stripStationBookingRulesRequestFields({
      vehicleId: 'veh-1',
      stationBookingRules: { manualOverride: { reason: 'x' } },
    });
    expect(stripped).toEqual({ vehicleId: 'veh-1' });
  });

  it('blocks persistence on BLOCKED outcomes', () => {
    const assessment = assessBookingStationRulesPersistence(
      baseResult({
        pickup: {
          ...baseResult().pickup,
          outcome: StationBookingRuleOutcome.BLOCKED,
        },
      }),
    );
    expect(assessment.allowed).toBe(false);
    expect(assessment.code).toBe('STATION_BOOKING_RULES_BLOCKED');
  });

  it('requires manual override when soft confirmation is pending', () => {
    const assessment = assessBookingStationRulesPersistence(
      baseResult({
        manualOverrideRequired: true,
        return: {
          ...baseResult().return,
          outcome: StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED,
        },
      }),
    );
    expect(assessment.allowed).toBe(false);
    expect(assessment.manualOverrideRequired).toBe(true);
    expect(assessment.code).toBe('STATION_BOOKING_RULES_MANUAL_OVERRIDE_REQUIRED');
  });

  it('allows persistence for WARNING outcomes', () => {
    const assessment = assessBookingStationRulesPersistence(
      baseResult({
        pickup: {
          ...baseResult().pickup,
          outcome: StationBookingRuleOutcome.WARNING,
        },
      }),
    );
    expect(assessment.allowed).toBe(true);
  });
});
