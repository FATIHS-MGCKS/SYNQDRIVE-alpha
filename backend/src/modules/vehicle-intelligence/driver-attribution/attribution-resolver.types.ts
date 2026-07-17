import type {
  CustomerType,
  DriverAttributionSource,
  DriverAttributionType,
  DrivingAttributionConfidence,
  HandoverKind,
  TripAssignmentStatus,
} from '@prisma/client';
import type { TripAttributionConfidence, TripAttributionScope } from '../trips/trip-attribution.types';

export const ATTRIBUTION_RESOLVER_VERSION = 'attribution-resolver-v1';

export type AttributionConflictCode =
  | 'PRIVATE_VS_BOOKING_LINK'
  | 'ASSIGNED_DRIVER_VS_HANDOVER'
  | 'TIME_WINDOW_VS_EXPLICIT_ASSIGNMENT'
  | 'CORPORATE_WITHOUT_DRIVER'
  | 'MANUAL_OVERRIDE_VS_PIPELINE'
  | 'STAFF_MOVEMENT_VS_CUSTOMER_HINT';

export type AttributionConflict = {
  code: AttributionConflictCode;
  message: string;
  competingTypes: DriverAttributionType[];
};

export type HandoverProofContext = {
  protocolId: string;
  bookingId: string;
  kind: HandoverKind;
  performedAt: Date;
  customerSignatureName: string | null;
  staffSignatureName: string | null;
};

export type ManualAttributionOverride = {
  driverId: string;
  resolvedByUserId: string;
  resolvedAt: Date;
};

export type AttributionResolverInput = {
  isPrivateTrip: boolean;
  assignmentStatus: TripAssignmentStatus | null;
  assignmentSubjectType: string | null;
  assignmentSubjectId: string | null;
  assignedBookingId: string | null;
  bookingLinkSource: 'EXPLICIT' | 'TIME_WINDOW' | null;
  tripBookingCustomerId?: string | null;
  tripAssignedDriverId?: string | null;
  tripActualDriverId?: string | null;
  bookingCustomerId?: string | null;
  bookingAssignedDriverId?: string | null;
  bookingCustomerType?: CustomerType | null;
  tripAttributionScope: TripAttributionScope;
  tripAttributionConfidence: TripAttributionConfidence;
  tripAttributionReason?: string | null;
  handoverProof?: HandoverProofContext | null;
  manualOverride?: ManualAttributionOverride | null;
  /** Internal staff movement without customer accountability. */
  staffMovementHint?: boolean;
};

export type ResolvedTripAttribution = {
  resolverVersion: typeof ATTRIBUTION_RESOLVER_VERSION;
  attributionType: DriverAttributionType;
  confidence: DrivingAttributionConfidence;
  customerEligibility: boolean;
  driverEligibility: boolean;
  reasons: string[];
  conflicts: AttributionConflict[];
  bookingId: string | null;
  customerId: string | null;
  driverId: string | null;
  source: DriverAttributionSource;
  bookingCustomerId: string | null;
  assignedDriverId: string | null;
  actualDriverId: string | null;
};
