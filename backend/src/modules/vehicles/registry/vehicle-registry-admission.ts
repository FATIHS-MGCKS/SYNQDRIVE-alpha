import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma, VehicleRegistryLifecycle } from '@prisma/client';

export const VEHICLE_REGISTRY_NOT_OPERATIONAL_CODE = 'VEHICLE_REGISTRY_NOT_OPERATIONAL';

export function isVehicleRegistryOperationalActive(
  registryLifecycle: VehicleRegistryLifecycle | null | undefined,
): boolean {
  return registryLifecycle === 'ACTIVE';
}

/**
 * Fail-closed gate for NEW operational admission (bookings, trip start, pickup handover).
 * Does not apply to historical finalization of work that began while ACTIVE.
 */
export async function assertVehicleRegistryActiveForOperationalAdmission(
  db: { vehicle: Prisma.VehicleDelegate },
  organizationId: string,
  vehicleId: string,
): Promise<void> {
  const vehicle = await db.vehicle.findFirst({
    where: { id: vehicleId, organizationId },
    select: { id: true, registryLifecycle: true },
  });
  if (!vehicle) {
    throw new NotFoundException('Vehicle not found');
  }
  if (!isVehicleRegistryOperationalActive(vehicle.registryLifecycle)) {
    throw new BadRequestException({
      code: VEHICLE_REGISTRY_NOT_OPERATIONAL_CODE,
      message: 'Vehicle is not active in the product registry',
      registryLifecycle: vehicle.registryLifecycle,
    });
  }
}
