import { VehicleStatus } from '@prisma/client';
import { evaluateStationBookingRules } from './station-booking-rules.resolver';
import {
  StationBookingRuleOutcome,
  StationBookingRulesBookingType,
} from './station-booking-rules.contract';
import { evaluateStationCapacityPolicy } from './station-capacity-policy';
import { evaluateStationCapacityRules } from './station-capacity-rules';
import { evaluatePlanVehicleStationTransfer } from '../../modules/stations/vehicle-station-transfer.util';

const STATION = 'station-capacity-sim';
const OTHER = 'station-other';

function vehicle(
  id: string,
  partial: Partial<{
    homeStationId: string | null;
    currentStationId: string | null;
    expectedStationId: string | null;
    status: VehicleStatus;
  }> = {},
) {
  return {
    id,
    homeStationId:
      'homeStationId' in partial ? (partial.homeStationId ?? null) : STATION,
    currentStationId:
      'currentStationId' in partial ? (partial.currentStationId ?? null) : STATION,
    expectedStationId:
      'expectedStationId' in partial ? (partial.expectedStationId ?? null) : null,
    status: partial.status ?? VehicleStatus.AVAILABLE,
  };
}

describe('station-capacity simulation', () => {
  it('does not treat unknown capacity as free capacity in booking rules', () => {
    const result = evaluateStationBookingRules({
      organizationId: 'org-capacity',
      pickupStation: {
        id: STATION,
        organizationId: 'org-capacity',
        stationId: STATION,
        status: 'ACTIVE',
        pickupEnabled: true,
        returnEnabled: true,
        afterHoursReturnEnabled: false,
        keyBoxAvailable: false,
        timezone: 'Europe/Berlin',
        openingHours: {
          version: 2,
          monday: { open24h: true },
          tuesday: { open24h: true },
          wednesday: { open24h: true },
          thursday: { open24h: true },
          friday: { open24h: true },
          saturday: { open24h: true },
          sunday: { open24h: true },
        },
        calendarExceptions: [],
        capacity: null,
        capacityVehicles: [vehicle('v1')],
      },
      returnStation: {
        id: STATION,
        organizationId: 'org-capacity',
        stationId: STATION,
        status: 'ACTIVE',
        pickupEnabled: true,
        returnEnabled: true,
        afterHoursReturnEnabled: false,
        keyBoxAvailable: false,
        timezone: 'Europe/Berlin',
        openingHours: {
          version: 2,
          monday: { open24h: true },
          tuesday: { open24h: true },
          wednesday: { open24h: true },
          thursday: { open24h: true },
          friday: { open24h: true },
          saturday: { open24h: true },
          sunday: { open24h: true },
        },
        calendarExceptions: [],
        capacity: null,
        capacityVehicles: [vehicle('v1')],
      },
      pickupDateTime: '2026-07-14T08:00:00.000Z',
      returnDateTime: '2026-07-17T08:00:00.000Z',
      bookingType: StationBookingRulesBookingType.STANDARD,
      vehicle: { id: 'booking-vehicle' },
    });

    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
    expect(
      result.pickup.evaluations.some((evaluation) => evaluation.ruleId.includes('capacity')),
    ).toBe(false);
  });

  it('simulates multiple concurrent returns pushing projected occupancy over capacity', () => {
    const fleet = [
      vehicle('on-site-1'),
      vehicle('on-site-2'),
    ];

    const policy = evaluateStationCapacityPolicy({
      stationId: STATION,
      configuredCapacity: 4,
      vehicles: fleet,
      bookingProjection: {
        concurrentReturnArrivals: 3,
        expectedPickupDepartures: 0,
      },
    });

    expect(policy.projectedOccupancy).toBe(5);
    expect(policy.capacityStatus).toBe('PROJECTED_OVER_CAPACITY');

    const rules = evaluateStationCapacityRules({
      ruleIdPrefix: 'return',
      policy: {
        capacityWarningEnabled: true,
        capacityBlockAtFull: false,
        capacityFullOutcome: StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED,
        capacityProjectedOverOutcome: StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED,
      },
      capacityInput: {
        stationId: STATION,
        configuredCapacity: 4,
        vehicles: fleet,
        bookingProjection: {
          concurrentReturnArrivals: 3,
          expectedPickupDepartures: 0,
        },
      },
    });

    expect(rules[0]?.outcome).toBe(StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED);
  });

  it('simulates pickup departure reducing projected occupancy in the same window', () => {
    const fleet = Array.from({ length: 4 }, (_, index) => vehicle(`on-site-${index}`));

    const policy = evaluateStationCapacityPolicy({
      stationId: STATION,
      configuredCapacity: 4,
      vehicles: fleet,
      bookingProjection: {
        concurrentReturnArrivals: 2,
        concurrentPickupDepartures: 2,
      },
    });

    expect(policy.projectedOccupancy).toBe(4);
    expect(policy.capacityStatus).toBe('FULL');
  });

  it('excludes home fleet parked elsewhere from physical occupancy', () => {
    const fleet = [
      vehicle('home-away', { currentStationId: OTHER, homeStationId: STATION }),
      vehicle('foreign-on-site', {
        homeStationId: OTHER,
        currentStationId: STATION,
      }),
    ];

    const policy = evaluateStationCapacityPolicy({
      stationId: STATION,
      configuredCapacity: 2,
      vehicles: fleet,
      bookingProjection: { expectedReturnArrivals: 0, expectedPickupDepartures: 0 },
    });

    expect(policy.currentOnSiteCount).toBe(1);
    expect(policy.breakdown.foreignOnSiteCount).toBe(1);
  });

  it('warns on transfer destination capacity and blocks only with hard-block policy', () => {
    const fleet = Array.from({ length: 4 }, (_, index) =>
      vehicle(`dest-${index}`, { currentStationId: STATION, homeStationId: STATION }),
    );

    const soft = evaluatePlanVehicleStationTransfer({
      fromStationId: OTHER,
      toStationId: STATION,
      toStationStatus: 'ACTIVE',
      activeTransferCount: 0,
      plannedAt: '2026-07-18T12:00:00.000Z',
      destinationCapacity: {
        configuredCapacity: 4,
        vehicles: fleet,
      },
    });

    expect(soft.allowed).toBe(true);
    expect(soft.warnings.length).toBeGreaterThan(0);

    const hard = evaluatePlanVehicleStationTransfer({
      fromStationId: OTHER,
      toStationId: STATION,
      toStationStatus: 'ACTIVE',
      activeTransferCount: 0,
      plannedAt: '2026-07-18T12:00:00.000Z',
      destinationCapacity: {
        configuredCapacity: 4,
        vehicles: fleet,
        policy: { capacityBlockAtFull: true },
      },
    });

    expect(hard.allowed).toBe(false);
    expect(hard.blockingReasons[0]?.code).toBe('VEHICLE_STATION_TRANSFER_CAPACITY_BLOCKED');
  });
});
