import {
  CustomerType,
  TripAssignmentStatus,
  TripAssignmentSubjectType,
} from '@prisma/client';
import {
  CUSTOMER_UUID_PATTERN,
  DRIVING_ATTRIBUTION_ROLES_VERSION,
} from './driving-attribution-roles.config';
import type {
  DrivingAttributionRolesInput,
  ResolvedDrivingAttributionRoles,
} from './driving-attribution-roles.types';
import { DrivingAttributionType } from './driving-attribution-roles.types';

function isCustomerUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && CUSTOMER_UUID_PATTERN.test(value);
}

function resolveBookingCustomerId(input: DrivingAttributionRolesInput): string | null {
  if (input.tripBookingCustomerId) return input.tripBookingCustomerId;
  if (input.bookingCustomerId) return input.bookingCustomerId;
  if (
    input.assignmentStatus === TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER &&
    input.assignmentSubjectType === TripAssignmentSubjectType.BOOKING_CUSTOMER
  ) {
    return input.assignmentSubjectId;
  }
  return null;
}

function resolveAssignedDriverId(input: DrivingAttributionRolesInput): string | null {
  if (input.tripAssignedDriverId) return input.tripAssignedDriverId;
  if (input.bookingAssignedDriverId) return input.bookingAssignedDriverId;
  if (
    input.assignmentStatus === TripAssignmentStatus.ASSIGNED_DRIVER &&
    isCustomerUuid(input.assignmentSubjectId)
  ) {
    return input.assignmentSubjectId;
  }
  return null;
}

function resolveActualDriverId(input: DrivingAttributionRolesInput): string | null {
  if (input.tripActualDriverId) return input.tripActualDriverId;
  const assigned = resolveAssignedDriverId(input);
  if (
    assigned &&
    input.bookingLinkSource === 'EXPLICIT' &&
    input.assignedBookingId != null
  ) {
    return assigned;
  }
  return null;
}

function deriveAttributionType(
  input: DrivingAttributionRolesInput,
  roles: {
    bookingCustomerId: string | null;
    assignedDriverId: string | null;
    actualDriverId: string | null;
  },
): DrivingAttributionType {
  if (input.isPrivateTrip || input.assignmentStatus === TripAssignmentStatus.PRIVATE_UNASSIGNED) {
    return DrivingAttributionType.PRIVATE_UNASSIGNED;
  }
  if (roles.actualDriverId) {
    return DrivingAttributionType.CONFIRMED_DRIVER;
  }
  if (roles.assignedDriverId) {
    return DrivingAttributionType.ASSIGNED_DRIVER;
  }
  if (roles.bookingCustomerId) {
    return DrivingAttributionType.BOOKING_CUSTOMER;
  }
  if (input.assignmentStatus === TripAssignmentStatus.ASSIGNED_DRIVER) {
    return DrivingAttributionType.ASSIGNED_DRIVER;
  }
  if (input.assignmentStatus === TripAssignmentStatus.UNKNOWN_ASSIGNMENT) {
    return DrivingAttributionType.UNKNOWN;
  }
  return DrivingAttributionType.VEHICLE_ONLY;
}

function derivePrimarySubject(
  attributionType: DrivingAttributionType,
): ResolvedDrivingAttributionRoles['primarySubject'] {
  switch (attributionType) {
    case DrivingAttributionType.CONFIRMED_DRIVER:
      return 'actualDriver';
    case DrivingAttributionType.ASSIGNED_DRIVER:
      return 'assignedDriver';
    case DrivingAttributionType.BOOKING_CUSTOMER:
      return 'bookingCustomer';
    case DrivingAttributionType.VEHICLE_ONLY:
      return 'vehicleOnly';
    default:
      return 'unknown';
  }
}

function isCustomerDecisionEligible(input: {
  bookingCustomerType: CustomerType | null | undefined;
  bookingCustomerId: string | null;
  assignedDriverId: string | null;
  actualDriverId: string | null;
  hasExplicitBookingLink: boolean;
}): boolean {
  if (!input.hasExplicitBookingLink || !input.bookingCustomerId) {
    return false;
  }
  if (input.bookingCustomerType === CustomerType.CORPORATE) {
    return Boolean(input.assignedDriverId || input.actualDriverId);
  }
  return true;
}

export function resolveDrivingAttributionRoles(
  input: DrivingAttributionRolesInput,
): ResolvedDrivingAttributionRoles {
  const bookingCustomerId = resolveBookingCustomerId(input);
  const assignedDriverId = resolveAssignedDriverId(input);
  const actualDriverId = resolveActualDriverId(input);

  const attributionType = deriveAttributionType(input, {
    bookingCustomerId,
    assignedDriverId,
    actualDriverId,
  });
  const primarySubject = derivePrimarySubject(attributionType);

  const hasExplicitBookingLink =
    input.bookingLinkSource === 'EXPLICIT' && input.assignedBookingId != null;

  const customerDecisionEligible = isCustomerDecisionEligible({
    bookingCustomerType: input.bookingCustomerType ?? null,
    bookingCustomerId,
    assignedDriverId,
    actualDriverId,
    hasExplicitBookingLink,
  });

  const driverConductSubjectId = actualDriverId ?? assignedDriverId;

  return {
    modelVersion: DRIVING_ATTRIBUTION_ROLES_VERSION,
    bookingCustomerId,
    assignedDriverId,
    actualDriverId,
    attributionType,
    primarySubject,
    contractCustomerId: bookingCustomerId,
    driverConductSubjectId,
    customerDecisionEligible,
    driverDecisionEligible: Boolean(driverConductSubjectId),
  };
}
