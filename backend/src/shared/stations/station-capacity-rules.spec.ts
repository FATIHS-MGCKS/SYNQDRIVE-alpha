import { VehicleStatus } from '@prisma/client';
import { StationBookingRuleOutcome } from './station-booking-rules.contract';
import { StationCapacityStatus } from './station-capacity-policy';
import {
  DEFAULT_STATION_CAPACITY_RULES_POLICY,
  StationCapacityRuleReasonCode,
} from './station-capacity-rules.contract';
import {
  evaluateStationCapacityRules,
  resolveEffectiveCapacityBookingProjection,
} from './station-capacity-rules';

const STATION = 'station-capacity-unit';

function vehicle(id: string) {
  return {
    id,
    homeStationId: STATION,
    currentStationId: STATION,
    expectedStationId: null,
    status: VehicleStatus.AVAILABLE,
  };
}

describe('station-capacity-rules', () => {
  it('returns no evaluations when capacity is unknown', () => {
    const evaluations = evaluateStationCapacityRules({
      ruleIdPrefix: 'pickup',
      policy: DEFAULT_STATION_CAPACITY_RULES_POLICY,
      capacityInput: {
        stationId: STATION,
        configuredCapacity: null,
        vehicles: [vehicle('v1')],
      },
    });

    expect(evaluations).toEqual([]);
  });

  it('warns near capacity by default', () => {
    const fleet = Array.from({ length: 4 }, (_, index) => vehicle(`v-${index}`));

    const evaluations = evaluateStationCapacityRules({
      ruleIdPrefix: 'return',
      policy: DEFAULT_STATION_CAPACITY_RULES_POLICY,
      capacityInput: {
        stationId: STATION,
        configuredCapacity: 5,
        vehicles: fleet,
      },
    });

    expect(evaluations).toHaveLength(1);
    expect(evaluations[0]?.outcome).toBe(StationBookingRuleOutcome.WARNING);
    expect(evaluations[0]?.reasonCode).toBe(StationCapacityRuleReasonCode.CAPACITY_WARNING);
    expect(evaluations[0]?.capacity.capacityStatus).toBe(StationCapacityStatus.NEAR_CAPACITY);
  });

  it('requires manual confirmation when full unless hard block policy is enabled', () => {
    const fleet = Array.from({ length: 5 }, (_, index) => vehicle(`v-${index}`));

    const soft = evaluateStationCapacityRules({
      ruleIdPrefix: 'return',
      policy: DEFAULT_STATION_CAPACITY_RULES_POLICY,
      capacityInput: {
        stationId: STATION,
        configuredCapacity: 5,
        vehicles: fleet,
      },
    });

    expect(soft[0]?.outcome).toBe(StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED);

    const hard = evaluateStationCapacityRules({
      ruleIdPrefix: 'return',
      policy: {
        ...DEFAULT_STATION_CAPACITY_RULES_POLICY,
        capacityBlockAtFull: true,
      },
      capacityInput: {
        stationId: STATION,
        configuredCapacity: 5,
        vehicles: fleet,
      },
    });

    expect(hard[0]?.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
  });

  it('adds pickup departure and return arrival deltas in effective projection', () => {
    const pickupProjection = resolveEffectiveCapacityBookingProjection(
      {
        concurrentReturnArrivals: 2,
        concurrentPickupDepartures: 1,
        concurrentTransferArrivals: 1,
        concurrentTransferDepartures: 1,
      },
      'pickup',
      true,
    );

    expect(pickupProjection.expectedPickupDepartures).toBe(2);
    expect(pickupProjection.expectedReturnArrivals).toBe(2);
    expect(pickupProjection.concurrentTransferArrivals).toBe(1);
    expect(pickupProjection.concurrentTransferDepartures).toBe(1);

    const returnProjection = resolveEffectiveCapacityBookingProjection(
      {
        concurrentReturnArrivals: 2,
        concurrentPickupDepartures: 1,
      },
      'return',
      true,
    );

    expect(returnProjection.expectedReturnArrivals).toBe(3);
    expect(returnProjection.expectedPickupDepartures).toBe(1);
  });
});
