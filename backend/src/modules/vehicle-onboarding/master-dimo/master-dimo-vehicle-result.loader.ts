import type { PrismaClient, Vehicle } from '@prisma/client';

/** Loads the full Prisma `Vehicle` row for register-from-dimo API contract. */
export async function loadMasterRegistrationVehicleResult(
  prisma: PrismaClient,
  vehicleId: string,
): Promise<Vehicle> {
  return prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
}
