import { Injectable } from '@nestjs/common';
import {
  evaluateStationBookingRules,
  getStationBookingRulesMetadata,
} from '@shared/stations/station-booking-rules.resolver';
import {
  getStationBookingRulesContractMetadata,
  type StationBookingRulesInput,
  type StationBookingRulesResult,
} from '@shared/stations/station-booking-rules.contract';

@Injectable()
export class StationBookingRulesService {
  evaluate(input: StationBookingRulesInput): StationBookingRulesResult {
    return evaluateStationBookingRules(input);
  }

  getContractMetadata() {
    return getStationBookingRulesContractMetadata();
  }

  getMetadata() {
    return getStationBookingRulesMetadata();
  }
}
