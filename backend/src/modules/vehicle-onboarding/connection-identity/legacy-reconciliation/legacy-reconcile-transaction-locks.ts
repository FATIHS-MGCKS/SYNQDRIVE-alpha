import type { Prisma } from '@prisma/client';

export type LegacyReconcileLockContext = {
  organizationId: string;
  vehicleId: string;
  sourceLinkId: string;
  consentId: string;
  dimoVehicleId: string;
};

/** Lock dependent rows in a stable order to detect concurrent lifecycle/consent/mirror drift. */
export async function lockLegacyReconcileDependencyRows(
  tx: Prisma.TransactionClient,
  ctx: LegacyReconcileLockContext,
): Promise<void> {
  const vehicleLock = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM vehicles
    WHERE id = ${ctx.vehicleId}::text
      AND organization_id = ${ctx.organizationId}::text
    FOR UPDATE
  `;
  if (vehicleLock.length !== 1) {
    throw new Error('LOCK_VEHICLE_MISSING');
  }

  const consentLock = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM vehicle_provider_consents
    WHERE id = ${ctx.consentId}::text
      AND vehicle_id = ${ctx.vehicleId}::text
      AND organization_id = ${ctx.organizationId}::text
    FOR UPDATE
  `;
  if (consentLock.length !== 1) {
    throw new Error('LOCK_CONSENT_MISSING');
  }

  const dimoLock = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM dimo_vehicles
    WHERE id = ${ctx.dimoVehicleId}::text
    FOR UPDATE
  `;
  if (dimoLock.length !== 1) {
    throw new Error('LOCK_DIMO_MIRROR_MISSING');
  }

  const linkLock = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM vehicle_data_source_links
    WHERE id = ${ctx.sourceLinkId}::text
      AND vehicle_id = ${ctx.vehicleId}::text
    FOR UPDATE
  `;
  if (linkLock.length !== 1) {
    throw new Error('LOCK_LINK_MISSING');
  }
}
