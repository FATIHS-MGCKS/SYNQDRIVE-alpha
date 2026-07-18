export const ONE_WAY_RETURN_FOLLOW_UP_VERSION = 1 as const;

export const OneWayReturnFollowUpRecommendation = {
  NO_ACTION: 'NO_ACTION',
  KEEP_AT_RETURN_STATION: 'KEEP_AT_RETURN_STATION',
  SUGGEST_TRANSFER_HOME: 'SUGGEST_TRANSFER_HOME',
  SUGGEST_TRANSFER_TO_NEXT_BOOKING: 'SUGGEST_TRANSFER_TO_NEXT_BOOKING',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
} as const;

export type OneWayReturnFollowUpRecommendation =
  (typeof OneWayReturnFollowUpRecommendation)[keyof typeof OneWayReturnFollowUpRecommendation];

export const OneWayReturnFollowUpReasonCode = {
  NOT_ONE_WAY: 'ONE_WAY_FOLLOW_UP_NOT_ONE_WAY',
  ALIGNED_AT_HOME: 'ONE_WAY_FOLLOW_UP_ALIGNED_AT_HOME',
  CURRENT_MISMATCH: 'ONE_WAY_FOLLOW_UP_CURRENT_MISMATCH',
  ACTIVE_TRANSFER_EXISTS: 'ONE_WAY_FOLLOW_UP_ACTIVE_TRANSFER_EXISTS',
  STALE_EXPECTED_POSITION: 'ONE_WAY_FOLLOW_UP_STALE_EXPECTED_POSITION',
  HOME_STATION_MISSING: 'ONE_WAY_FOLLOW_UP_HOME_STATION_MISSING',
  REPOSITIONING_REQUIRED: 'ONE_WAY_FOLLOW_UP_REPOSITIONING_REQUIRED',
  NEXT_BOOKING_AT_RETURN: 'ONE_WAY_FOLLOW_UP_NEXT_BOOKING_AT_RETURN',
  NEXT_BOOKING_AT_HOME: 'ONE_WAY_FOLLOW_UP_NEXT_BOOKING_AT_HOME',
  NEXT_BOOKING_AT_OTHER_STATION: 'ONE_WAY_FOLLOW_UP_NEXT_BOOKING_AT_OTHER_STATION',
} as const;

export type OneWayReturnFollowUpReasonCode =
  (typeof OneWayReturnFollowUpReasonCode)[keyof typeof OneWayReturnFollowUpReasonCode];

export interface OneWayReturnFollowUpReason {
  code: OneWayReturnFollowUpReasonCode | string;
  message: string;
}

export interface OneWayReturnFollowUpNextBookingContext {
  id: string;
  pickupStationId: string | null;
  startDate: string;
}

export interface OneWayReturnFollowUpActiveTransferContext {
  id: string;
  fromStationId: string | null;
  toStationId: string;
  status: string;
}

export interface OneWayReturnFollowUpTransferSuggestion {
  kind: 'HOME' | 'NEXT_BOOKING';
  fromStationId: string;
  toStationId: string;
  sourceBookingId?: string;
}

export interface OneWayReturnFollowUpChecks {
  isOneWayRental: boolean;
  vehicleHomeDiffersFromReturn: boolean;
  currentMatchesReturnStation: boolean;
  repositioningRequired: boolean;
  hasNextBookingAtOtherStation: boolean;
  transferSuggestionSensible: boolean;
}

export interface OneWayReturnFollowUpResult {
  version: typeof ONE_WAY_RETURN_FOLLOW_UP_VERSION;
  evaluatedAt: string;
  bookingId: string;
  recommendation: OneWayReturnFollowUpRecommendation;
  checks: OneWayReturnFollowUpChecks;
  context: {
    homeStationId: string | null;
    currentStationId: string;
    actualReturnStationId: string;
    plannedReturnStationId: string | null;
    pickupStationId: string | null;
    nextBooking: OneWayReturnFollowUpNextBookingContext | null;
    activeTransfer: OneWayReturnFollowUpActiveTransferContext | null;
    expectedStationId: string | null;
    expectedStationSource: string | null;
  };
  transferSuggestion: OneWayReturnFollowUpTransferSuggestion | null;
  reasons: OneWayReturnFollowUpReason[];
  /** No automatic transfer is created by this evaluation. */
  noAutomaticTransfer: true;
  /** Home station is never mutated by this evaluation. */
  homeUnchanged: true;
  /** Expected station is never mutated — only set after confirmed transfer. */
  expectedUnchanged: true;
}

export interface OneWayReturnFollowUpEvaluationInput {
  evaluatedAt: string;
  bookingId: string;
  isOneWayRental: boolean;
  pickupStationId: string | null;
  plannedReturnStationId: string | null;
  actualReturnStationId: string;
  homeStationId: string | null;
  currentStationId: string;
  expectedStationId: string | null;
  expectedStationSource: string | null;
  nextBooking: OneWayReturnFollowUpNextBookingContext | null;
  activeTransfer: OneWayReturnFollowUpActiveTransferContext | null;
}
