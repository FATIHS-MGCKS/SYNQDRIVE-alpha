import type { CustomerType, DriverAttributionSource, DriverAttributionType, DrivingAttributionConfidence, Prisma } from '@prisma/client';
import type { TripAssignmentResolution } from './trip-assignment.service';
import type { TripAttribution } from './trip-attribution.types';

/** Max trips per impact/decision batch query (large list guard). */
export const CANONICAL_HYDRATION_TRIP_ID_BATCH = 500;

export type CanonicalTripDecisionSummary = {
  tripId: string;
  attributionType: DriverAttributionType;
  confidence: DrivingAttributionConfidence;
  driverId: string | null;
  customerId: string | null;
  source: DriverAttributionSource;
  modelVersion: string;
};

export type BookingOverlapCandidate = {
  id: string;
  vehicleId: string;
  customerId: string;
  assignedDriverId: string | null;
  startDate: Date;
  endDate: Date;
  customer: { customerType: CustomerType };
};

export type BookingDriverPoolContext = {
  allowedDriverIds: string[];
  primaryDriverId: string | null;
};

export type TripHydrationTripInput = {
  id: string;
  vehicleId: string;
  startTime: Date;
  endTime: Date | null;
  driverName?: string | null;
  assignmentStatus: string | null;
  assignmentSubjectType: string | null;
  assignmentSubjectId: string | null;
  assignedBookingId: string | null;
  bookingLinkSource: 'EXPLICIT' | 'TIME_WINDOW' | null;
  bookingCustomerId: string | null;
  assignedDriverId: string | null;
  actualDriverId: string | null;
  isPrivateTrip: boolean;
};

export type CanonicalTripHydrationPrefetch = {
  impactByTripId: Map<
    string,
    { drivingStressScore: number | null; sourceSummaryJson: Prisma.JsonValue | null }
  >;
  bookingsByVehicle: Map<string, BookingOverlapCandidate[]>;
  driverPoolByBookingId: Map<string, BookingDriverPoolContext>;
  decisionSummaryByTripId: Map<string, CanonicalTripDecisionSummary | null>;
  queryCount: number;
};

export type CanonicalTripHydrationResolved = {
  assignment: TripAssignmentResolution;
  attribution: TripAttribution;
  decisionSummary: CanonicalTripDecisionSummary | null;
};
