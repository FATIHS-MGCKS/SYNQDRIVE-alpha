import { Injectable } from '@nestjs/common';
import {
  evaluateStationBookingRules,
  getStationBookingRulesMetadata,
} from '@shared/stations/station-booking-rules.resolver';
import { evaluatePickupBookingRules } from '@shared/stations/station-booking-pickup-rules';
import {
  DEFAULT_STATION_BOOKING_RULES_ORGANIZATION_POLICY,
  getStationBookingRulesContractMetadata,
  type StationBookingRulesInput,
  type StationBookingRulesResult,
} from '@shared/stations/station-booking-rules.contract';
import { getStationBookingPickupRulesMetadata } from '@shared/stations/station-booking-pickup-rules.contract';
import { evaluateReturnBookingRules } from '@shared/stations/station-booking-return-rules';
import { getStationBookingReturnRulesMetadata } from '@shared/stations/station-booking-return-rules.contract';

@Injectable()
export class StationBookingRulesService {
  evaluate(input: StationBookingRulesInput): StationBookingRulesResult {
    return evaluateStationBookingRules(input);
  }

  evaluateReturn(
    input: Omit<StationBookingRulesInput, 'pickupStation' | 'pickupDateTime'> & {
      returnAt?: Date | string;
    },
  ) {
    const policy = {
      ...DEFAULT_STATION_BOOKING_RULES_ORGANIZATION_POLICY,
      ...input.organizationPolicy,
    };
    const returnAt =
      input.returnAt instanceof Date
        ? input.returnAt
        : new Date(input.returnAt ?? input.returnDateTime);

    return evaluateReturnBookingRules({
      organizationId: input.organizationId,
      station: input.returnStation,
      returnAt,
      vehicle: input.vehicle,
      policy,
      bookingContext: input.bookingContext,
    });
  }

  evaluatePickup(
    input: Omit<StationBookingRulesInput, 'returnStation' | 'returnDateTime'> & {
      pickupAt?: Date | string;
    },
  ) {
    const policy = {
      ...DEFAULT_STATION_BOOKING_RULES_ORGANIZATION_POLICY,
      ...input.organizationPolicy,
    };
    const pickupAt =
      input.pickupAt instanceof Date
        ? input.pickupAt
        : new Date(input.pickupAt ?? input.pickupDateTime);

    return evaluatePickupBookingRules({
      organizationId: input.organizationId,
      station: input.pickupStation,
      pickupAt,
      vehicle: input.vehicle,
      policy,
      bookingContext: input.bookingContext,
    });
  }

  getContractMetadata() {
    return getStationBookingRulesContractMetadata();
  }

  getPickupRulesMetadata() {
    return getStationBookingPickupRulesMetadata();
  }

  getReturnRulesMetadata() {
    return getStationBookingReturnRulesMetadata();
  }

  getMetadata() {
    return getStationBookingRulesMetadata();
  }
}
