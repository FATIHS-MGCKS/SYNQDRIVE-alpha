import type { DtcSnapshotBindingIdentity } from './dtc-snapshot.types';

export type DimoBindingVerificationFailure =
  | 'NO_ACTIVE_LINK'
  | 'TOKEN_DIMO_VEHICLE_MISMATCH'
  | 'LINK_DIMO_VEHICLE_MISMATCH'
  | 'VEHICLE_DIMO_VEHICLE_MISMATCH'
  | 'TOKEN_NOT_REGISTERED';

export type DimoBindingVerificationResult =
  | { ok: true; binding: DtcSnapshotBindingIdentity }
  | { ok: false; reason: DimoBindingVerificationFailure };

/**
 * Resolve and cryptographically/logically verify DIMO binding for an ingress token.
 * An active link alone is not sufficient — tokenId must match registered DimoVehicle.
 */
type BindingLookupClient = {
  vehicle: { findUnique: (args: unknown) => Promise<unknown> };
  vehicleDataSourceLink: { findFirst: (args: unknown) => Promise<unknown> };
};

export async function verifyActiveDimoBindingForVehicle(
  prisma: BindingLookupClient,
  vehicleId: string,
  ingressTokenId: number,
): Promise<DimoBindingVerificationResult> {
  const vehicle = (await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      dimoVehicleId: true,
      dimoVehicle: { select: { tokenId: true } },
    },
  })) as {
    dimoVehicleId: string | null;
    dimoVehicle: { tokenId: number | null } | null;
  } | null;
  if (!vehicle?.dimoVehicle?.tokenId) {
    return { ok: false, reason: 'TOKEN_NOT_REGISTERED' };
  }
  if (vehicle.dimoVehicle.tokenId !== ingressTokenId) {
    return { ok: false, reason: 'TOKEN_DIMO_VEHICLE_MISMATCH' };
  }

  const link = (await prisma.vehicleDataSourceLink.findFirst({
    where: { vehicleId, provider: 'DIMO', isActive: true },
    orderBy: { activatedAt: 'desc' },
    select: { id: true, isActive: true, dimoVehicleId: true },
  })) as {
    id: string;
    isActive: boolean;
    dimoVehicleId: string | null;
  } | null;
  if (!link?.isActive) {
    return { ok: false, reason: 'NO_ACTIVE_LINK' };
  }

  if (vehicle.dimoVehicleId && link.dimoVehicleId && link.dimoVehicleId !== vehicle.dimoVehicleId) {
    return { ok: false, reason: 'LINK_DIMO_VEHICLE_MISMATCH' };
  }

  return {
    ok: true,
    binding: {
      provider: 'DIMO',
      providerBindingId: link.id,
      dimoTokenId: ingressTokenId,
    },
  };
}

/** @deprecated Use verifyActiveDimoBindingForVehicle — kept for tests importing legacy name */
export async function resolveActiveDimoBindingForVehicle(
  prisma: Parameters<typeof verifyActiveDimoBindingForVehicle>[0],
  vehicleId: string,
  dimoTokenId: number,
): Promise<DtcSnapshotBindingIdentity | null> {
  const r = await verifyActiveDimoBindingForVehicle(prisma, vehicleId, dimoTokenId);
  return r.ok ? r.binding : null;
}
