export type TripAttributionScope =
  | 'PRIVATE'
  | 'BOOKING_ASSIGNED'
  | 'BOOKING_TIME_WINDOW_MATCH'
  | 'UNASSIGNED';

export type TripAttributionConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface TripAttributionBookingOverlap {
  bookingId: string;
  customerId: string | null;
}

export interface TripAttribution {
  scope: TripAttributionScope;
  confidence: TripAttributionConfidence;
  customerRelevant: boolean;
  bookingRelevant: boolean;
  customerChargeable: boolean;
  bookingId: string | null;
  customerId: string | null;
  reason: string;
}

export interface TripAttributionInput {
  isPrivateTrip: boolean;
  assignmentStatus: string | null;
  assignedBookingId: string | null;
  assignmentSubjectId: string | null;
  bookingLinkSource: 'EXPLICIT' | 'TIME_WINDOW' | null;
  bookingOverlap?: TripAttributionBookingOverlap | null;
}
