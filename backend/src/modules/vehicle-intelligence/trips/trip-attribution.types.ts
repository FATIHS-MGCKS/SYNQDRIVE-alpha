import type { CustomerType } from '@prisma/client';
import type { DrivingAttributionType } from './driving-attribution-roles/driving-attribution-roles.types';

export type TripAttributionScope =
  | 'PRIVATE'
  | 'BOOKING_ASSIGNED'
  | 'BOOKING_TIME_WINDOW_MATCH'
  | 'UNASSIGNED';

export type TripAttributionConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface TripAttributionBookingOverlap {
  bookingId: string;
  /** Contract holder — not the driver mirror. */
  bookingCustomerId: string | null;
  assignedDriverId: string | null;
  customerType?: CustomerType | null;
  /** @deprecated Use bookingCustomerId */
  customerId?: string | null;
}

export interface TripAttribution {
  scope: TripAttributionScope;
  confidence: TripAttributionConfidence;
  customerRelevant: boolean;
  bookingRelevant: boolean;
  customerChargeable: boolean;
  bookingId: string | null;
  /** Contract holder (booking customer). */
  customerId: string | null;
  bookingCustomerId: string | null;
  assignedDriverId: string | null;
  actualDriverId: string | null;
  customerDecisionEligible: boolean;
  driverDecisionEligible: boolean;
  attributionType: DrivingAttributionType;
  reason: string;
}

export interface TripAttributionInput {
  isPrivateTrip: boolean;
  assignmentStatus: string | null;
  assignedBookingId: string | null;
  assignmentSubjectId: string | null;
  assignmentSubjectType?: string | null;
  bookingLinkSource: 'EXPLICIT' | 'TIME_WINDOW' | null;
  bookingCustomerId?: string | null;
  bookingAssignedDriverId?: string | null;
  bookingCustomerType?: CustomerType | null;
  tripBookingCustomerId?: string | null;
  tripAssignedDriverId?: string | null;
  tripActualDriverId?: string | null;
  bookingOverlap?: TripAttributionBookingOverlap | null;
}
