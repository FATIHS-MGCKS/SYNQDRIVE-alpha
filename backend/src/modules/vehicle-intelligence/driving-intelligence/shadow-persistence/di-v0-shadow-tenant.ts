import type { Prisma } from '@prisma/client';
import type { DiV0ShadowRunIdentity } from './di-v0-shadow-types';

export type DiV0ShadowDbClient = Prisma.TransactionClient | { vehicleTrip: Prisma.TransactionClient['vehicleTrip'] };

/**
 * Ensures tripId, vehicleId, and organizationId refer to one canonical chain:
 * VehicleTrip(vehicleId) -> Vehicle(organizationId).
 */
export async function assertShadowRunTripIdentity(
  client: DiV0ShadowDbClient,
  identity: DiV0ShadowRunIdentity,
): Promise<void> {
  const trip = await client.vehicleTrip.findFirst({
    where: {
      id: identity.tripId,
      vehicleId: identity.vehicleId,
      vehicle: {
        id: identity.vehicleId,
        organizationId: identity.organizationId,
      },
    },
    select: { id: true },
  });
  if (!trip) {
    throw new Error('DI_V0_SHADOW_TRIP_IDENTITY_MISMATCH');
  }
}
