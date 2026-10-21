import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { VO_PG_DIMO_SOFTWARE_RAW_JSON } from '../../vehicle-onboarding/testing/dimo-mirror-postgres.fixture';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';

export type VsiP2cObservationFixture = {
  organizationId: string;
  vehicleId: string;
  linkId: string;
  providerTokenReference: string;
};

export async function createVsiP2cObservationFixture(
  prisma: PrismaClient,
): Promise<VsiP2cObservationFixture> {
  const organizationId = await createLegacyReconcileOrg(prisma);
  const externalId = `0x${randomUUID().replace(/-/g, '').slice(0, 40)}`;
  const fixture = await createLegacyDimoLinkFixture(prisma, {
    organizationId,
    externalId,
    rawJson: VO_PG_DIMO_SOFTWARE_RAW_JSON,
    tokenId: 9_900_000 + Math.floor(Math.random() * 10_000),
  });
  const dimo = await prisma.dimoVehicle.findUnique({
    where: { id: fixture.dimoId },
    select: { tokenId: true },
  });
  const tokenRef = String(dimo?.tokenId ?? '9900001');
  return {
    organizationId,
    vehicleId: fixture.vehicleId,
    linkId: fixture.linkId,
    providerTokenReference: tokenRef,
  };
}

export async function cleanupVsiP2cObservationFixture(
  prisma: PrismaClient,
  organizationId: string,
): Promise<void> {
  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId },
    select: { id: true, dimoVehicleId: true },
  });
  const vehicleIds = vehicles.map((v) => v.id);
  if (vehicleIds.length > 0) {
    await prisma.vehicleProviderSourceObservation.deleteMany({
      where: { organizationId, vehicleId: { in: vehicleIds } },
    });
    await prisma.vehicleProviderSourceObservationCounter.deleteMany({
      where: { organizationId, vehicleId: { in: vehicleIds } },
    });
    await prisma.vehicleLatestState.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleDataSourceLink.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleProviderConsent.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
  }
  const dimoIds = vehicles.map((v) => v.dimoVehicleId).filter((id): id is string => Boolean(id));
  if (dimoIds.length > 0) {
    await prisma.dimoVehicle.deleteMany({ where: { id: { in: dimoIds } } });
  }
  await prisma.organization.deleteMany({ where: { id: organizationId } });
}
