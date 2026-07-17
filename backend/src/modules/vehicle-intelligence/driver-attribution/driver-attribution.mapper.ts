import {
  DriverAttributionSource,
  DriverAttributionType,
  DrivingAttributionConfidence,
} from '@prisma/client';
import type { TripAttribution } from '../trips/trip-attribution.types';
import type { ResolvedDrivingAttributionRoles } from '../trips/driving-attribution-roles/driving-attribution-roles.types';
import type { DriverAttributionEvidence } from './driver-attribution.types';

export function mapTripAttributionToDriverAttributionType(
  attribution: Pick<TripAttribution, 'scope' | 'attributionType'>,
  roles: Pick<
    ResolvedDrivingAttributionRoles,
    'actualDriverId' | 'assignedDriverId' | 'bookingCustomerId'
  >,
): DriverAttributionType {
  if (attribution.scope === 'PRIVATE') {
    return DriverAttributionType.PRIVATE;
  }
  if (roles.actualDriverId) {
    return DriverAttributionType.CONFIRMED_DRIVER;
  }
  if (roles.assignedDriverId) {
    return DriverAttributionType.ASSIGNED_DRIVER;
  }
  if (attribution.scope === 'BOOKING_TIME_WINDOW_MATCH') {
    return DriverAttributionType.TIME_WINDOW_MATCH;
  }
  if (attribution.scope === 'BOOKING_ASSIGNED' && roles.bookingCustomerId) {
    return DriverAttributionType.BOOKING_CUSTOMER_ONLY;
  }
  if (attribution.scope === 'UNASSIGNED') {
    return DriverAttributionType.VEHICLE_ONLY;
  }
  return DriverAttributionType.UNKNOWN;
}

export function mapTripAttributionSource(
  attribution: Pick<TripAttribution, 'scope'>,
): DriverAttributionSource {
  if (attribution.scope === 'BOOKING_ASSIGNED') {
    return DriverAttributionSource.EXPLICIT_BOOKING_LINK;
  }
  if (attribution.scope === 'BOOKING_TIME_WINDOW_MATCH') {
    return DriverAttributionSource.TIME_WINDOW_OVERLAP;
  }
  return DriverAttributionSource.PIPELINE_SNAPSHOT;
}

export function mapTripAttributionConfidence(
  confidence: TripAttribution['confidence'],
): DrivingAttributionConfidence {
  switch (confidence) {
    case 'HIGH':
      return DrivingAttributionConfidence.HIGH;
    case 'MEDIUM':
      return DrivingAttributionConfidence.MEDIUM;
    default:
      return DrivingAttributionConfidence.LOW;
  }
}

export function buildDriverAttributionEvidence(input: {
  attribution: TripAttribution;
  roles: ResolvedDrivingAttributionRoles;
  pipelineJobId?: string | null;
}): DriverAttributionEvidence {
  return {
    attributionScope: input.attribution.scope,
    reason: input.attribution.reason,
    rolesModelVersion: input.roles.modelVersion,
    bookingCustomerId: input.roles.bookingCustomerId,
    assignedDriverId: input.roles.assignedDriverId,
    actualDriverId: input.roles.actualDriverId,
    pipelineJobId: input.pipelineJobId ?? null,
  };
}

export function resolveDriverIdForAttribution(input: {
  roles: Pick<ResolvedDrivingAttributionRoles, 'actualDriverId' | 'assignedDriverId'>;
}): string | null {
  return input.roles.actualDriverId ?? input.roles.assignedDriverId ?? null;
}
