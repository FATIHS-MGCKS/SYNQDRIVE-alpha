import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { CUSTOMER_UUID_PATTERN } from '../trips/driving-attribution-roles/driving-attribution-roles.config';

export type ScopedVehicleTripWhere = Prisma.VehicleTripWhereInput;
export type ScopedDrivingEventWhere = Prisma.DrivingEventWhereInput;

export async function assertVehicleInOrganization(
  prisma: PrismaService,
  organizationId: string,
  vehicleId: string,
): Promise<void> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, organizationId },
    select: { id: true },
  });
  if (!vehicle) {
    throw new NotFoundException('Vehicle not found for organization');
  }
}

export async function assertTripInOrganization(
  prisma: PrismaService,
  organizationId: string,
  tripId: string,
): Promise<{ vehicleId: string }> {
  const trip = await prisma.vehicleTrip.findFirst({
    where: { id: tripId, vehicle: { organizationId } },
    select: { id: true, vehicleId: true },
  });
  if (!trip) {
    throw new NotFoundException('Trip not found for organization');
  }
  return { vehicleId: trip.vehicleId };
}

export async function assertBookingInOrganization(
  prisma: PrismaService,
  organizationId: string,
  bookingId: string,
): Promise<void> {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, organizationId },
    select: { id: true },
  });
  if (!booking) {
    throw new NotFoundException('Booking not found for organization');
  }
}

export function scopedVehicleTripWhere(
  organizationId: string,
  vehicleId: string,
  extra: ScopedVehicleTripWhere = {},
): ScopedVehicleTripWhere {
  return {
    ...extra,
    vehicleId,
    vehicle: { organizationId },
  };
}

export function scopedDrivingEventWhere(
  organizationId: string,
  vehicleId: string,
  extra: ScopedDrivingEventWhere = {},
): ScopedDrivingEventWhere {
  return {
    ...extra,
    vehicleId,
    vehicle: { organizationId },
  };
}

export function resolveDriverFilterQuery(driver?: string): {
  driverCustomerId?: string;
  driverName?: string;
} {
  if (!driver?.trim()) return {};
  const trimmed = driver.trim();
  if (CUSTOMER_UUID_PATTERN.test(trimmed)) {
    return { driverCustomerId: trimmed };
  }
  return { driverName: trimmed };
}

export function buildTripDriverIdentityFilter(input: {
  driverCustomerId?: string;
  driverName?: string;
}): Prisma.VehicleTripWhereInput | null {
  if (input.driverCustomerId) {
    return {
      OR: [
        { actualDriverId: input.driverCustomerId },
        { assignedDriverId: input.driverCustomerId },
        {
          assignmentSubjectType: 'DRIVER',
          assignmentSubjectId: input.driverCustomerId,
        },
      ],
    };
  }
  if (input.driverName) {
    return { driverName: input.driverName };
  }
  return null;
}
