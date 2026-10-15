import type { DtcSnapshotBindingIdentity } from './dtc-snapshot.types';

export async function resolveActiveDimoBindingForVehicle(
  prisma: {
    vehicleDataSourceLink: {
      findFirst: (args: unknown) => Promise<{
        id: string;
        isActive: boolean;
        dimoVehicleId: string | null;
      } | null>;
    };
  },
  vehicleId: string,
  dimoTokenId: number,
): Promise<DtcSnapshotBindingIdentity | null> {
  const link = await prisma.vehicleDataSourceLink.findFirst({
    where: { vehicleId, provider: 'DIMO', isActive: true },
    orderBy: { activatedAt: 'desc' },
    select: { id: true, isActive: true, dimoVehicleId: true },
  });
  if (!link?.isActive) return null;
  return {
    provider: 'DIMO',
    providerBindingId: link.id,
    dimoTokenId,
  };
}
