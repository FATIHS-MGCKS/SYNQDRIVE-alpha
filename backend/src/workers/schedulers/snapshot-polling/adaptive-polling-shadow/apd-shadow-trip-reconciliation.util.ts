import type { PrismaService } from '@shared/database/prisma.service';

/** Frozen PS1 semantics: reconciliation when poll start is outside vehicle_trips intervals. */
export async function isVehicleInActiveTripAtMs(
  prisma: PrismaService,
  vehicleId: string,
  atMs: number,
): Promise<boolean> {
  const at = new Date(atMs);
  const trip = await prisma.vehicleTrip.findFirst({
    where: {
      vehicleId,
      startTime: { lte: at },
      OR: [{ endTime: null }, { endTime: { gte: at } }],
    },
    select: { id: true },
  });
  return trip != null;
}
