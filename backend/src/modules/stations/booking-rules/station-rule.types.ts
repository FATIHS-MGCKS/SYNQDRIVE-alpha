export type StationRuleOutcome =
  | 'ALLOWED'
  | 'WARNING'
  | 'MANUAL_CONFIRMATION_REQUIRED'
  | 'BLOCKED';

export type StationRuleField = 'pickup' | 'return' | 'actualPickup' | 'actualReturn';

export interface StationRuleEvaluation {
  outcome: StationRuleOutcome;
  ruleId: string;
  message: string;
  stationId?: string;
  field?: StationRuleField;
}

export interface StationBookingRulesResult {
  evaluations: StationRuleEvaluation[];
  overallOutcome: StationRuleOutcome;
}

export interface StationBookingRulesInput {
  organizationId: string;
  pickupStationId?: string | null;
  returnStationId?: string | null;
  actualPickupStationId?: string | null;
  actualReturnStationId?: string | null;
  pickupAt?: Date | null;
  returnAt?: Date | null;
  isOneWayRental?: boolean;
}
