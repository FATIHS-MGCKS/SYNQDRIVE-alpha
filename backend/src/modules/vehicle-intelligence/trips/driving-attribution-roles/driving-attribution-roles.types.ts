import type { CustomerType, TripAssignmentStatus } from '@prisma/client';

/** Mirrors Prisma `DrivingAttributionType` (enum not client-exported until bound to a model). */
export type DrivingAttributionType =
  | 'CONFIRMED_DRIVER'
  | 'BOOKING_CUSTOMER'
  | 'ASSIGNED_DRIVER'
  | 'VEHICLE_ONLY'
  | 'PRIVATE_UNASSIGNED'
  | 'UNKNOWN';

export const DrivingAttributionType = {
  CONFIRMED_DRIVER: 'CONFIRMED_DRIVER',
  BOOKING_CUSTOMER: 'BOOKING_CUSTOMER',
  ASSIGNED_DRIVER: 'ASSIGNED_DRIVER',
  VEHICLE_ONLY: 'VEHICLE_ONLY',
  PRIVATE_UNASSIGNED: 'PRIVATE_UNASSIGNED',
  UNKNOWN: 'UNKNOWN',
} as const satisfies Record<DrivingAttributionType, DrivingAttributionType>;

export interface DrivingAttributionRoleIds {
  bookingCustomerId: string | null;
  assignedDriverId: string | null;
  actualDriverId: string | null;
}

export type DrivingAttributionPrimarySubject =
  | 'bookingCustomer'
  | 'assignedDriver'
  | 'actualDriver'
  | 'vehicleOnly'
  | 'unknown';

export interface DrivingAttributionRolesInput {
  isPrivateTrip: boolean;
  assignmentStatus: TripAssignmentStatus | null;
  assignmentSubjectType: string | null;
  assignmentSubjectId: string | null;
  assignedBookingId: string | null;
  bookingLinkSource: 'EXPLICIT' | 'TIME_WINDOW' | null;
  bookingCustomerId?: string | null;
  bookingAssignedDriverId?: string | null;
  bookingCustomerType?: CustomerType | null;
  tripBookingCustomerId?: string | null;
  tripAssignedDriverId?: string | null;
  tripActualDriverId?: string | null;
}

export interface ResolvedDrivingAttributionRoles extends DrivingAttributionRoleIds {
  modelVersion: string;
  attributionType: DrivingAttributionType;
  primarySubject: DrivingAttributionPrimarySubject;
  /** Contract holder only — never mirrored from driver IDs. */
  contractCustomerId: string | null;
  /** Person attributed for driving conduct when known. */
  driverConductSubjectId: string | null;
  /** Operator/customer-facing decision allowed (corporate requires driver assignment). */
  customerDecisionEligible: boolean;
  driverDecisionEligible: boolean;
}
